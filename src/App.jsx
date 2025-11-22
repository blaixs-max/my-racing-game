import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// --- 1. OYUN VERİ MERKEZİ ---
const useGameStore = create((set, get) => ({
  speed: 0,
  targetSpeed: 20,
  lane: 1, 
  score: 0,
  combo: 1,
  lastComboTime: 0,
  gameOver: false,
  enemies: [],
  message: "", 
  
  startGame: () => set({ speed: 20, targetSpeed: 90, score: 0, combo: 1, gameOver: false, enemies: [], message: "", lane: 1 }),
  
  changeLane: (direction) => set((state) => {
    if (state.gameOver) return {};
    return { lane: Math.max(0, Math.min(2, state.lane + direction)) };
  }),
  
  accelerate: () => set((state) => !state.gameOver && { targetSpeed: 350 }),
  decelerate: () => set((state) => !state.gameOver && { targetSpeed: 90 }),
  
  triggerNearMiss: () => {
    const { combo, score } = get();
    set({ 
      combo: Math.min(combo + 1, 10), 
      score: score + (500 * combo),
      message: `MAKAS! ${combo}x`,
      lastComboTime: Date.now()
    });
    setTimeout(() => set({ message: "" }), 1000);
  },

  updateGame: (delta) => set((state) => {
    if (state.gameOver) return { speed: 0, targetSpeed: 0 };

    const newSpeed = THREE.MathUtils.lerp(state.speed, state.targetSpeed, delta * 3);
    const newScore = state.score + (newSpeed * delta * 0.2);

    let newCombo = state.combo;
    if (Date.now() - state.lastComboTime > 3000 && state.combo > 1) newCombo = 1;

    let newEnemies = state.enemies.map(e => ({
      ...e,
      z: e.z + (newSpeed * delta * 0.5),
      passed: e.passed || false 
    })).filter(e => e.z < 80); 

    const spawnRate = 0.02 + (newSpeed / 10000); 
    if (Math.random() < spawnRate && newEnemies.length < 7) {
      const randomLane = Math.floor(Math.random() * 3); 
      const r = Math.random();
      let type = 'sedan';
      if (r > 0.7) type = 'truck';
      else if (r > 0.9) type = 'bus';
      
      newEnemies.push({ id: Math.random(), lane: randomLane, z: -400 - Math.random() * 200, passed: false, type });
    }

    return { speed: newSpeed, score: newScore, enemies: newEnemies, combo: newCombo };
  }),

  setGameOver: () => set({ gameOver: true, speed: 0, targetSpeed: 0 })
}));

// --- 2. OYUNCU ARABASI (Metalik Gümüş - Parlak) ---
function PlayerCar() {
  const { lane, enemies, setGameOver, gameOver, triggerNearMiss, speed } = useGameStore();
  const group = useRef();
  const wheels = useRef([]);
  
  const leftTarget = useRef();
  const rightTarget = useRef();

  const targetX = (lane - 1) * 4.5; 

  if (!leftTarget.current) {
      leftTarget.current = new THREE.Object3D();
      leftTarget.current.position.set(-0.5, -0.5, -80); 
  }
  if (!rightTarget.current) {
      rightTarget.current = new THREE.Object3D();
      rightTarget.current.position.set(0.5, -0.5, -80); 
  }

  useFrame((state, delta) => {
    if (gameOver) return;

    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, targetX, delta * 10);
    const tilt = (group.current.position.x - targetX) * 0.1;
    group.current.rotation.z = tilt; 
    group.current.rotation.x = -speed * 0.0002; 
    wheels.current.forEach(w => { if(w) w.rotation.x += speed * delta * 0.1; });

    enemies.forEach(enemy => {
      const enemyX = (enemy.lane - 1) * 4.5;
      const dx = Math.abs(group.current.position.x - enemyX);
      const dz = Math.abs(enemy.z - (-2)); 

      if (dz < 3.5 && dx < 2.0) setGameOver();
      if (!enemy.passed && dz < 6.0 && dx > 2.2 && dx < 5.0) {
        enemy.passed = true; 
        triggerNearMiss();   
      }
    });
  });

  // GÖRÜNÜRLÜK İÇİN AÇIK RENKLER
  const bodyColor = new THREE.MeshStandardMaterial({ color: '#dddddd', metalness: 0.8, roughness: 0.2 }); // Gümüş
  const glassMat = new THREE.MeshStandardMaterial({ color: '#88ccff', roughness: 0.1 }); // Mavi Cam
  
  return (
    <group ref={group} position={[0, 0, -2]}>
      <primitive object={leftTarget.current} />
      <primitive object={rightTarget.current} />

      {/* FARLAR: Çok Parlak */}
      <spotLight position={[0.8, 0.6, -1.8]} target={rightTarget.current} angle={0.4} penumbra={0.5} intensity={100} color="#fff" distance={200} />
      <spotLight position={[-0.8, 0.6, -1.8]} target={leftTarget.current} angle={0.4} penumbra={0.5} intensity={100} color="#fff" distance={200} />
      
      {/* Araç kendi etrafını aydınlatsın */}
      <pointLight position={[0, 3, 0]} intensity={2} distance={10} />

      <mesh position={[0, 0.4, 0]} material={bodyColor}><boxGeometry args={[1.8, 0.4, 4.0]} /></mesh>
      <mesh position={[0, 0.7, -0.5]} material={glassMat}><boxGeometry args={[1.4, 0.4, 1.8]} /></mesh>
      <mesh position={[0, 0.3, -2.1]} material={bodyColor}><boxGeometry args={[1.5, 0.2, 0.8]} /></mesh>
      <mesh position={[-0.6, 0.5, 2.05]} material={new THREE.MeshBasicMaterial({color: '#f00'})}><boxGeometry args={[0.3, 0.1, 0.1]} /></mesh>
      <mesh position={[0.6, 0.5, 2.05]} material={new THREE.MeshBasicMaterial({color: '#f00'})}><boxGeometry args={[0.3, 0.1, 0.1]} /></mesh>

      {[[-1.0, -1.2], [1.0, -1.2], [-1.0, 1.4], [1.0, 1.4]].map((pos, i) => (
         <mesh key={i} ref={el => wheels.current[i] = el} position={[pos[0], 0.35, pos[1]]} rotation={[0, 0, Math.PI/2]} material={new THREE.MeshStandardMaterial({color:'#333'})}>
           <cylinderGeometry args={[0.35, 0.35, 0.4, 16]} />
         </mesh>
      ))}
    </group>
  );
}

// --- 3. TRAFİK ---
function Traffic() {
  const enemies = useGameStore(state => state.enemies);
  // Daha açık renkli düşman araçları
  const truckMat = new THREE.MeshStandardMaterial({ color: '#6688aa', roughness: 0.5 }); 
  const containerMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.6 }); 
  const busMat = new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.5 }); 
  const sedanMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.4 });
  const tailLightMat = new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 3 });

  return (
    <>
      {enemies.map(enemy => {
        const x = (enemy.lane - 1) * 4.5;
        return (
          <group key={enemy.id} position={[x, 0, enemy.z]}>
            {enemy.type === 'truck' && (
               <group>
                 <mesh position={[0, 2.0, 0]} material={containerMat}><boxGeometry args={[2.5, 3.0, 7.0]} /></mesh>
                 <mesh position={[0, 1.2, -4.0]} material={truckMat}><boxGeometry args={[2.5, 2.0, 2.0]} /></mesh>
                 <mesh position={[-1, 1.0, 3.6]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                 <mesh position={[1, 1.0, 3.6]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
               </group>
            )}
            {enemy.type === 'bus' && (
               <group>
                 <mesh position={[0, 2.0, 0]} material={busMat}><boxGeometry args={[2.6, 3.2, 9.5]} /></mesh>
                 <mesh position={[-1, 1.0, 4.8]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                 <mesh position={[1, 1.0, 4.8]} material={tailLightMat}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
               </group>
            )}
            {enemy.type === 'sedan' && (
               <group>
                 <mesh position={[0, 0.7, 0]} material={sedanMat}><boxGeometry args={[2.0, 0.8, 4.2]} /></mesh>
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

// --- 4. AYDINLIK ÇEVRE ---
const Building = ({ width, height, side, type }) => {
    const isApartment = type === 'apartment';
    const buildingMat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8 }); // Açık gri bina
    
    const wins = useMemo(() => {
        if (!isApartment) return [];
        const w = [];
        const floors = Math.floor(height / 3);
        for (let i = 1; i < floors; i++) {
             if (Math.random() > 0.5) { 
                 w.push([0, i * 3, side * (width/2 + 0.1)]);
             }
        }
        return w;
    }, [height, isApartment, side, width]);

    return (
        <group>
            <mesh position={[0, height / 2, 0]} material={buildingMat}>
                <boxGeometry args={[width, height, width]} />
            </mesh>
            {wins.map((pos, i) => (
                <mesh key={i} position={pos}>
                    <planeGeometry args={[width * 0.6, 1.5]} />
                    <meshBasicMaterial color="#ffdd88" /> {/* Çok Parlak Camlar */}
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
      return {
        z: -i * 50, 
        type, height, width,
        offset: (Math.random() - 0.5) * 20
      };
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

  const treeMat = new THREE.MeshStandardMaterial({ color: '#44aa44', roughness: 1 }); // Daha yeşil ağaç
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#554433', roughness: 1 });

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


// --- 5. YOL VE BARİYERLER ---
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
             <mesh key={i} position={[0, 0.5, -i * 10]} material={new THREE.MeshStandardMaterial({color: '#bbb'})}>
                <boxGeometry args={[0.2, 1.0, 0.2]} />
             </mesh>
          ))}
          <mesh position={[0, 0.8, -200]} material={new THREE.MeshStandardMaterial({color: '#dbe4eb', metalness: 0.5, roughness: 0.3})}>
              <boxGeometry args={[0.3, 0.4, 1000]} />
          </mesh>
      </group>
  );

  return (
    <group>
      {/* YOL: Açık Gri (#666) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
         <planeGeometry args={[20, 1000]} /> 
         <meshStandardMaterial color="#666" roughness={0.5} />
      </mesh>

      <group ref={stripesRef}>
        {[-2.25, 2.25].map((x) => (
             Array.from({ length: 30 }).map((_, j) => (
                <mesh key={`${x}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -j * 20]}>
                    <planeGeometry args={[0.2, 6]} /> 
                    <meshBasicMaterial color="#fff" />
                </mesh>
             ))
        ))}
      </group>

      <Barrier x={-10.5} />
      <Barrier x={10.5} />

      <SideObjects side={1} />
      <SideObjects side={-1} />
      
      {/* Zemin: Koyu Lacivert/Siyah */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[2000, 2000]} />
          <meshStandardMaterial color="#111122" />
      </mesh>
    </group>
  );
}

// --- 6. HIZ EFEKTİ ---
function SpeedLines() {
  const { speed } = useGameStore();
  const lines = useMemo(() => new Array(150).fill(0).map(() => ({
    x: (Math.random() - 0.5) * 80,
    y: Math.random() * 30,
    z: (Math.random() - 0.5) * 300,
    len: Math.random() * 20 + 10
  })), []);

  const ref = useRef();
  useFrame((state, delta) => {
    if(ref.current) {
      ref.current.children.forEach((line, i) => {
        line.position.z += speed * delta * 0.9;
        if (line.position.z > 20) line.position.z = -300; 
      });
    }
  });
  if (speed < 100) return null;
  return (
    <group ref={ref}>
      {lines.map((l, i) => (
         <mesh key={i} position={[l.x, l.y, l.z]}>
           <boxGeometry args={[0.05, 0.05, l.len]} />
           <meshBasicMaterial color="white" transparent opacity={0.2} />
         </mesh>
      ))}
    </group>
  );
}

// --- 7. ANA UYGULAMA ---
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
    <div style={{ width: '100vw', height: '100vh', background: '#111', overflow: 'hidden' }}>
      
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#fff', zIndex: 10, fontFamily: 'Arial', pointerEvents: 'none' }}>
        <div style={{ fontSize: '50px', fontWeight: 'bold', fontStyle: 'italic', textShadow: '0 0 10px black' }}>{Math.floor(speed)} <span style={{fontSize: '20px'}}>KM/H</span></div>
        <div style={{ fontSize: '24px', color: '#ddd', marginTop: '5px' }}>SKOR: {Math.floor(score)}</div>
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
        
        {/* GÜÇLÜ ORTAM AYDINLATMASI */}
        <ambientLight intensity={1.5} color="#ffffff" /> 
        {/* GÖKYÜZÜ IŞIĞI (Yukarıdan Mavi, Aşağıdan Gri) */}
        <hemisphereLight skyColor="#88ccff" groundColor="#444444" intensity={1.0} />

        {/* SİS UZAKTA */}
        <fog attach="fog" args={['#101020', 10, 150]} />

        <SpeedLines />
        
        <Suspense fallback={null}>
           <PlayerCar />
           <Traffic />
           <RoadEnvironment />
        </Suspense>
      </Canvas>
    </div>
  );
}