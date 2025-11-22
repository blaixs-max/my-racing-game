import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// --- 1. OYUN VERİ MERKEZİ (GELİŞMİŞ AI) ---
const useGameStore = create((set, get) => ({
  speed: 0,
  targetSpeed: 20,
  lane: 1, 
  score: 0,
  combo: 1,
  gameOver: false,
  enemies: [], // Düşmanlar artık daha akıllı objeleler
  
  startGame: () => set({ speed: 20, targetSpeed: 90, score: 0, combo: 1, gameOver: false, enemies: [], lane: 1 }),
  
  changeLane: (direction) => set((state) => {
    if (state.gameOver) return {};
    return { lane: Math.max(0, Math.min(2, state.lane + direction)) };
  }),
  
  accelerate: () => set((state) => !state.gameOver && { targetSpeed: 380 }),
  decelerate: () => set((state) => !state.gameOver && { targetSpeed: 90 }),
  
  updateGame: (delta) => set((state) => {
    if (state.gameOver) return { speed: 0, targetSpeed: 0 };

    const newSpeed = THREE.MathUtils.lerp(state.speed, state.targetSpeed, delta * 2);
    const newScore = state.score + (newSpeed * delta * 0.2);

    // --- TRAFİK YAPAY ZEKASI (AI) ---
    let newEnemies = state.enemies.map(enemy => {
      // 1. BAĞIL HIZ HESABI
      // Eğer biz hızlıysak düşman bize yaklaşır (z artar).
      // Eğer düşman bizden hızlıysa bizden uzaklaşır (z azalır).
      // enemy.speed (km/h) -> oyun birimine çeviriyoruz (* 0.5)
      const relativeSpeed = (newSpeed - enemy.ownSpeed) * delta * 0.5;
      let newZ = enemy.z + relativeSpeed;
      let newX = enemy.x;
      let newLane = enemy.lane;
      let isChanging = enemy.isChanging;

      // 2. ŞERİT DEĞİŞTİRME MANTIĞI
      if (isChanging) {
        // Şerit değiştirme animasyonu (Smooth geçiş)
        const targetX = (enemy.targetLane - 1) * 4.5;
        const moveDir = targetX > enemy.x ? 1 : -1;
        newX += moveDir * delta * 15; // Sağa/Sola kayma hızı

        // Hedefe ulaştı mı?
        if (Math.abs(newX - targetX) < 0.2) {
          newX = targetX;
          newLane = enemy.targetLane;
          isChanging = false;
        }
      } else {
        // Rastgele şerit değiştirme kararı (%0.5 şans)
        if (Math.random() < 0.005) {
          const direction = Math.random() > 0.5 ? 1 : -1;
          const targetLane = newLane + direction;

          // Güvenlik Kontrolü: Yolun dışına çıkma ve Çarpışma var mı?
          if (targetLane >= 0 && targetLane <= 2) {
            // Hedef şeritte yakın araç var mı? (AI Güvenliği)
            const isSafe = !state.enemies.some(other => 
              other.id !== enemy.id && 
              (other.lane === targetLane || other.targetLane === targetLane) && 
              Math.abs(other.z - newZ) < 15 // 15 birim güvenli mesafe
            );

            if (isSafe) {
              isChanging = true;
              enemy.targetLane = targetLane;
            }
          }
        }
      }

      return { ...enemy, z: newZ, x: newX, lane: newLane, isChanging, targetLane: enemy.targetLane };
    })
    .filter(e => e.z < 50 && e.z > -600); // Çok uzaklaşan veya arkada kalanları sil

    // YENİ ARAÇ OLUŞTURMA (SPAWN)
    // Araçlar artık çok uzakta (-400) değil, görüş mesafesinin hemen ucunda belirsin (-250)
    const spawnRate = 0.03 + (newSpeed / 15000); 
    if (Math.random() < spawnRate && newEnemies.length < 10) {
      const randomLane = Math.floor(Math.random() * 3); 
      
      // Çarpışma önleyici Spawn (Aynı yere araç koyma)
      const isLaneFree = !newEnemies.some(e => e.lane === randomLane && e.z < -200);

      if (isLaneFree) {
        const r = Math.random();
        let type = 'sedan';
        let ownSpeed = 80; // Varsayılan hız

        if (r > 0.7) { type = 'truck'; ownSpeed = 65; } // Kamyonlar yavaş (65 km/h)
        else if (r > 0.9) { type = 'bus'; ownSpeed = 70; } // Otobüsler orta (70 km/h)
        else { ownSpeed = 90 + Math.random() * 30; } // Arabalar hızlı (90-120 km/h)

        newEnemies.push({ 
          id: Math.random(), 
          lane: randomLane, 
          targetLane: randomLane,
          x: (randomLane - 1) * 4.5, // Başlangıç X konumu
          z: -250, 
          passed: false, 
          type, 
          ownSpeed,
          isChanging: false
        });
      }
    }

    return { speed: newSpeed, score: newScore, enemies: newEnemies, combo: newCombo };
  }),

  setGameOver: () => set({ gameOver: true, speed: 0, targetSpeed: 0 })
}));

// --- 2. HIZ GÖSTERGESİ ---
function Speedometer({ speed }) {
  const maxSpeed = 360;
  const angle = -135 + (speed / maxSpeed) * 270;
  const renderMarks = () => {
    const marks = [];
    for (let i = 0; i <= maxSpeed; i += 30) {
      const markAngle = -135 + (i / maxSpeed) * 270;
      const isMajor = i % 60 === 0;
      marks.push(
        <div key={`line-${i}`} style={{ position: 'absolute', bottom: '50%', left: '50%', width: isMajor?'3px':'2px', height: '100px', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${markAngle}deg)` }}>
          <div style={{ width: '100%', height: isMajor?'15px':'10px', background: i>=240?'#ff3333':'#00ff00', position: 'absolute', top: 0 }}></div>
        </div>
      );
      if (isMajor) {
        const rad = (markAngle - 90) * (Math.PI / 180);
        marks.push(<div key={`num-${i}`} style={{ position: 'absolute', top: `calc(50% + ${Math.sin(rad)*70}px)`, left: `calc(50% + ${Math.cos(rad)*70}px)`, transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 'bold', color: i>=240?'#ff3333':'#00ff00' }}>{i}</div>);
      }
    }
    return marks;
  };
  return (
    <div style={{ position: 'relative', width: '200px', height: '200px', background: 'radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 70%)', borderRadius: '50%', border: '5px solid #2e2e4e', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Arial' }}>
      {renderMarks()}
      <div style={{ position: 'absolute', top: '65%', textAlign: 'center' }}><div style={{ fontSize: '32px', fontWeight: 'bold', textShadow: '0 0 10px #00ff00' }}>{Math.floor(speed)}</div><div style={{ fontSize: '12px', color: '#aaa' }}>km/h</div></div>
      <div style={{ position: 'absolute', bottom: '50%', left: '50%', width: '6px', height: '85px', background: 'linear-gradient(to top, #ff3333, #ff6666)', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${angle}deg)`, borderRadius: '50% 50% 0 0', zIndex: 2 }}></div>
      <div style={{ position: 'absolute', width: '20px', height: '20px', background: '#333', borderRadius: '50%', border: '3px solid #ff3333', zIndex: 3 }}></div>
    </div>
  );
}

// --- 3. OYUNCU ARABASI ---
function PlayerCar() {
  const { lane, enemies, setGameOver, gameOver, triggerNearMiss, speed } = useGameStore();
  const group = useRef();
  const wheels = useRef([]);
  
  const leftTarget = useRef();
  const rightTarget = useRef();
  if (!leftTarget.current) { leftTarget.current = new THREE.Object3D(); leftTarget.current.position.set(-0.5, -0.5, -100); }
  if (!rightTarget.current) { rightTarget.current = new THREE.Object3D(); rightTarget.current.position.set(0.5, -0.5, -100); }

  const targetX = (lane - 1) * 4.5; 

  useFrame((state, delta) => {
    if (gameOver) return;
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, targetX, delta * 10);
    const tilt = (group.current.position.x - targetX) * 0.1;
    group.current.rotation.z = tilt; 
    group.current.rotation.x = -speed * 0.0002; 
    wheels.current.forEach(w => { if(w) w.rotation.x += speed * delta * 0.1; });

    // Çarpışma Kontrolü
    enemies.forEach(enemy => {
      // enemy.x artık dinamik değişiyor, şerit değil x pozisyonuna bakıyoruz
      const dx = Math.abs(group.current.position.x - enemy.x);
      const dz = Math.abs(enemy.z - (-2)); 
      if (dz < 3.8 && dx < 2.0) setGameOver();
      if (!enemy.passed && dz < 7.0 && dx > 2.2 && dx < 5.0) {
        enemy.passed = true; 
        triggerNearMiss();   
      }
    });
  });

  const bodyMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa', metalness: 0.9, roughness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1 });
  const neonMat = new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 2 });

  return (
    <group ref={group} position={[0, 0, -2]}>
      <primitive object={leftTarget.current} />
      <primitive object={rightTarget.current} />
      <spotLight position={[0.8, 0.6, -1.5]} target={rightTarget.current} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} castShadow />
      <spotLight position={[-0.8, 0.6, -1.5]} target={leftTarget.current} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} castShadow />
      <pointLight position={[0, 3, 0]} intensity={2} distance={15} />

      <mesh position={[0, 0.4, 0]} material={bodyMat}><boxGeometry args={[1.8, 0.5, 4.2]} /></mesh>
      <mesh position={[-0.95, 0.3, 1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[0.95, 0.3, 1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[-0.95, 0.3, -1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[0.95, 0.3, -1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[0, 0.8, -0.3]} material={glassMat}><boxGeometry args={[1.4, 0.5, 2.0]} /></mesh>
      <mesh position={[0, 0.9, 1.9]} material={bodyMat}><boxGeometry args={[1.8, 0.1, 0.4]} /></mesh>
      <mesh position={[-0.7, 0.6, 1.9]} material={bodyMat}><boxGeometry args={[0.1, 0.4, 0.2]} /></mesh>
      <mesh position={[0.7, 0.6, 1.9]} material={bodyMat}><boxGeometry args={[0.1, 0.4, 0.2]} /></mesh>
      <mesh position={[0, 0.2, 0]} material={neonMat}><boxGeometry args={[1.7, 0.05, 4.1]} /></mesh>
      <mesh position={[-0.6, 0.5, 2.11]} material={new THREE.MeshBasicMaterial({color: 'red'})}><boxGeometry args={[0.4, 0.15, 0.1]} /></mesh>
      <mesh position={[0.6, 0.5, 2.11]} material={new THREE.MeshBasicMaterial({color: 'red'})}><boxGeometry args={[0.4, 0.15, 0.1]} /></mesh>

      {[[-1.0, -1.2], [1.0, -1.2], [-1.0, 1.4], [1.0, 1.4]].map((pos, i) => (
         <mesh key={i} ref={el => wheels.current[i] = el} position={[pos[0], 0.35, pos[1]]} rotation={[0, 0, Math.PI/2]} material={new THREE.MeshStandardMaterial({color:'#111', roughness:0.8})}>
           <cylinderGeometry args={[0.4, 0.4, 0.4, 24]} />
         </mesh>
      ))}
    </group>
  );
}

// --- 4. TRAFİK (GELİŞMİŞ GÖRÜNÜM) ---
function Traffic() {
  const enemies = useGameStore(state => state.enemies);
  const truckMat = new THREE.MeshStandardMaterial({ color: '#335577', roughness: 0.5 }); 
  const containerMat = new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.8 }); 
  const busMat = new THREE.MeshStandardMaterial({ color: '#ddaa00', roughness: 0.5 }); 
  const sedanMat = new THREE.MeshStandardMaterial({ color: '#ccc', roughness: 0.3 });
  const tailLightMat = new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 4 });

  return (
    <>
      {enemies.map(enemy => {
        // Artık enemy.x'i kullanıyoruz, çünkü şerit değiştiriyorlar
        const x = enemy.x; 
        
        // Şerit değiştirenler hafif yatsın (Dönüş efekti)
        const tilt = enemy.isChanging ? (enemy.targetLane > enemy.lane ? -0.1 : 0.1) : 0;

        return (
          <group key={enemy.id} position={[x, 0, enemy.z]} rotation={[0, 0, tilt]}>
            {enemy.type === 'truck' && (
               <group>
                 <mesh position={[0, 2.0, 0]} material={containerMat} castShadow><boxGeometry args={[2.6, 3.2, 7.5]} /></mesh>
                 <mesh position={[0, 1.2, -4.2]} material={truckMat}><boxGeometry args={[2.6, 2.2, 2.0]} /></mesh>
                 <mesh position={[-1, 1.0, 3.8]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                 <mesh position={[1, 1.0, 3.8]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
               </group>
            )}
            {enemy.type === 'bus' && (
               <group>
                 <mesh position={[0, 2.0, 0]} material={busMat} castShadow><boxGeometry args={[2.7, 3.4, 10.0]} /></mesh>
                 <mesh position={[-1, 1.0, 5.1]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                 <mesh position={[1, 1.0, 5.1]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
               </group>
            )}
            {enemy.type === 'sedan' && (
               <group>
                 <mesh position={[0, 0.7, 0]} material={sedanMat} castShadow><boxGeometry args={[2.0, 0.8, 4.2]} /></mesh>
                 <mesh position={[0, 1.1, -0.3]} material={new THREE.MeshStandardMaterial({color:'#222'})}><boxGeometry args={[1.8, 0.5, 2.2]} /></mesh>
                 <mesh position={[-0.8, 0.6, 2.2]} material={tailLightMat}><boxGeometry args={[0.4, 0.2, 0.1]} /></mesh>
                 <mesh position={[0.8, 0.6, 2.2]} material={tailLightMat}><boxGeometry args={[0.4, 0.2, 0.1]} /></mesh>
               </group>
            )}
          </group>
        );
      })}
    </>
  );
}

// --- 5. ÇEVRE (BİNALAR VE AĞAÇLAR) ---
const Building = ({ width, height, side, type }) => {
    const isApartment = type === 'apartment';
    const buildingMat = new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.9 });
    const winLitMat = new THREE.MeshStandardMaterial({ color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 3 });
    
    const wins = useMemo(() => {
        if (!isApartment) return [];
        const w = [];
        const floors = Math.floor(height / 3);
        for (let i = 1; i < floors; i++) {
             if (Math.random() > 0.6) w.push([0, i * 3, side * (width/2 + 0.1)]);
        }
        return w;
    }, [height, isApartment, side, width]);

    return (
        <group>
            <mesh position={[0, height / 2, 0]} material={buildingMat}>
                <boxGeometry args={[width, height, width]} />
            </mesh>
            {wins.map((pos, i) => (
                <mesh key={i} position={pos} material={winLitMat}>
                    <planeGeometry args={[width * 0.6, 1.5]} />
                </mesh>
            ))}
            {type === 'small_house' && (
                 <mesh position={[0, height + 1, 0]} rotation={[0, Math.PI/4, 0]}>
                    <coneGeometry args={[width*0.8, 3, 4]} />
                    <meshStandardMaterial color="#444" />
                 </mesh>
            )}
        </group>
    );
};

function SideObjects({ side }) {
  const { speed } = useGameStore();
  const objects = useMemo(() => {
    return new Array(30).fill(0).map((_, i) => {
      const rand = Math.random();
      let type = 'empty';
      let height = 0;
      let width = 0;
      if (rand > 0.8) { type = 'apartment'; height = 30 + Math.random() * 40; width = 12; }
      else if (rand > 0.5) { type = 'small_house'; height = 6; width = 8; } 
      else if (rand > 0.2) { type = 'tree'; } 
      return { z: -i * 50, type, height, width, offset: (Math.random() - 0.5) * 20 };
    });
  }, []);

  const groupRef = useRef();
  const itemsRef = useRef(objects);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, i) => {
        const item = itemsRef.current[i];
        item.z += speed * delta * 0.5; 
        if (item.z > 20) {
          item.z = -1500; 
          const rand = Math.random();
          if (rand > 0.8) { item.type = 'apartment'; item.height = 30 + Math.random() * 40; item.width = 12; }
          else if (rand > 0.5) { item.type = 'small_house'; item.height = 6; item.width = 8; }
          else if (rand > 0.2) { item.type = 'tree'; }
          else { item.type = 'empty'; }
        }
        mesh.position.z = item.z;
        mesh.visible = item.type !== 'empty';
      });
    }
  });

  const treeMat = new THREE.MeshStandardMaterial({ color: '#224422', roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#443322', roughness: 1 });

  return (
    <group ref={groupRef}>
      {objects.map((obj, i) => (
        <group key={i} position={[side * (45 + obj.offset), 0, obj.z]}>
           {(obj.type === 'apartment' || obj.type === 'small_house') && 
              <Building width={obj.width} height={obj.height} side={side} type={obj.type} />
           }
           <group visible={obj.type === 'tree'}>
              <mesh position={[0, 2, 0]} material={trunkMat}><cylinderGeometry args={[0.8, 1.2, 4]} /></mesh>
              <mesh position={[0, 8, 0]} material={treeMat}><coneGeometry args={[4, 10, 8]} /></mesh>
           </group>
        </group>
      ))}
    </group>
  );
}

// --- 6. YOL VE ZEMİN ---
function RoadEnvironment() {
  const { updateGame, speed } = useGameStore();
  const stripesRef = useRef();

  useFrame((state, delta) => {
    updateGame(delta);
    if (stripesRef.current) {
      stripesRef.current.children.forEach(stripe => {
         stripe.position.z += speed * delta * 0.5;
         if (stripe.position.z > 10) stripe.position.z = -200;
      });
    }
  });

  const Barrier = ({ x }) => (
      <group position={[x, 0, 0]}>
          {Array.from({length: 40}).map((_, i) => (
             <mesh key={i} position={[0, 0.5, -i * 10]} material={new THREE.MeshStandardMaterial({color: '#999'})}>
                <boxGeometry args={[0.2, 1.0, 0.2]} />
             </mesh>
          ))}
          <mesh position={[0, 0.8, -200]} material={new THREE.MeshStandardMaterial({color: '#B0C4DE', metalness: 0.6, roughness: 0.4})}>
              <boxGeometry args={[0.3, 0.4, 1000]} />
          </mesh>
      </group>
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
         <planeGeometry args={[20, 1000]} /> 
         <meshStandardMaterial color="#555" roughness={0.8} />
      </mesh>

      <group ref={stripesRef}>
        {[-2.25, 2.25].map((x) => (
             Array.from({ length: 30 }).map((_, j) => (
                <mesh key={`${x}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -j * 20]}>
                    <planeGeometry args={[0.25, 6]} /> 
                    <meshBasicMaterial color="#fff" />
                </mesh>
             ))
        ))}
      </group>

      <Barrier x={-10.5} />
      <Barrier x={10.5} />
      <SideObjects side={1} />
      <SideObjects side={-1} />
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[2000, 2000]} />
          <meshStandardMaterial color="#2e8b57" roughness={1.0} metalness={0.0} />
      </mesh>
    </group>
  );
}

function SpeedLines() {
  const { speed } = useGameStore();
  const lines = useMemo(() => new Array(100).fill(0).map(() => ({
    x: (Math.random() - 0.5) * 50, y: Math.random() * 15, z: (Math.random() - 0.5) * 200, len: Math.random() * 20 + 10
  })), []);
  const ref = useRef();
  useFrame((state, delta) => {
    if(ref.current) {
      ref.current.children.forEach((line, i) => {
        line.position.z += speed * delta * 0.9;
        if (line.position.z > 20) line.position.z = -200; 
      });
    }
  });
  if (speed < 100) return null;
  return (
    <group ref={ref}>
      {lines.map((l, i) => (
         <mesh key={i} position={[l.x, l.y, l.z]}><boxGeometry args={[0.04, 0.04, l.len]} /><meshBasicMaterial color="white" transparent opacity={0.15} /></mesh>
      ))}
    </group>
  );
}

// --- GÖKYÜZÜ ---
function SkyBackground() {
  const { scene } = useThree();
  const skyTexture = useTexture('https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80');
  useEffect(() => {
    scene.background = skyTexture;
    return () => { scene.background = null; };
  }, [scene, skyTexture]);
  return null;
}

export default function App() {
  const { speed, score, combo, message, gameOver, startGame, accelerate, decelerate, changeLane } = useGameStore();
  useEffect(() => {
    startGame();
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') changeLane(-1);
      if (e.key === 'ArrowRight') changeLane(1);
      if (e.key === 'ArrowUp') accelerate();
    };
    const handleKeyUp = (e) => { if (e.key === 'ArrowUp') decelerate(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#080808', overflow: 'hidden' }}>
      
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, pointerEvents: 'none' }}>
        <Speedometer speed={speed} />
      </div>

      <div style={{ position: 'absolute', top: 230, left: 20, color: '#fff', zIndex: 10, fontFamily: 'Arial', pointerEvents: 'none' }}>
        <div style={{ fontSize: '24px', color: '#ddd' }}>SKOR: {Math.floor(score)}</div>
        {combo > 1 && <div style={{ fontSize: '40px', color: '#00ff00', fontWeight: 'bold', marginTop: '10px', textShadow: '0 0 15px lime' }}>{combo}x COMBO</div>}
      </div>

      {message && <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', fontSize: '80px', fontWeight: 'bold', fontStyle: 'italic', zIndex: 15, textShadow: '0 0 20px cyan' }}>{message}</div>}

      {gameOver && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'Arial' }}>
          <h1 style={{ fontSize: '100px', color: '#ff3333', margin: 0 }}>KAZA!</h1>
          <button onClick={startGame} style={{ padding: '20px 60px', fontSize: '30px', cursor: 'pointer', marginTop: '30px', fontWeight: 'bold', background: 'white', border: 'none', borderRadius: '10px' }}>TEKRAR YARIŞ</button>
        </div>
      )}

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 6, 14]} fov={55} />
        <ambientLight intensity={0.8} color="#ffffff" /> 
        <hemisphereLight skyColor="#445566" groundColor="#223344" intensity={0.6} />
        <Suspense fallback={null}>
           <SkyBackground />
           <SpeedLines />
           <PlayerCar />
           <Traffic />
           <RoadEnvironment />
        </Suspense>
      </Canvas>
    </div>
  );
}
