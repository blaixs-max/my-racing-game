import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// --- 1. OYUN VERİ MERKEZİ (STATE MANAGEMENT) ---
const useGameStore = create((set, get) => ({
  gameState: 'menu', // menu, countdown, playing, gameover
  countdown: 3,
  speed: 0,
  targetSpeed: 20,
  currentX: 0, // Mevcut X konumu (Animasyon için)
  targetX: 0,  // Hedef X konumu (Klavye girdisi)
  score: 0,
  combo: 1,
  gameOver: false,
  enemies: [],
  coins: [],
  message: "", 
  
  // OYUNU BAŞLATMA
  startGame: () => {
    set({ 
      gameState: 'countdown', 
      countdown: 3, 
      speed: 0, 
      targetSpeed: 0, 
      score: 0, 
      combo: 1, 
      enemies: [], 
      coins: [],
      message: "", 
      currentX: 0,
      targetX: 0,
      gameOver: false
    });

    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        set({ countdown: count });
      } else if (count === 0) {
        set({ countdown: "GO!" });
      } else {
        clearInterval(timer);
        // Yarış başlıyor
        set({ gameState: 'playing', countdown: null, speed: 20, targetSpeed: 90 });
      }
    }, 1000);
  },

  // OYUNDAN ÇIKMA (MENÜYE DÖN)
  quitGame: () => {
    set({ gameState: 'menu', gameOver: false, score: 0, speed: 0 });
  },
  
  // ANALOG DİREKSİYON KONTROLÜ
  // direction: -1 (Sol) veya 1 (Sağ)
  steer: (direction) => set((state) => {
    if (state.gameState !== 'playing') return {};
    
    // Her tuş basışında 2.25 birim (yarım şerit) kay
    const step = 2.25;
    let newX = state.targetX + (direction * step);
    
    // Yol sınırları (Bariyerler -5 ve +5'te)
    if (newX > 5.0) newX = 5.0;
    if (newX < -5.0) newX = -5.0;

    return { targetX: newX };
  }),
  
  // HIZ KONTROLLERİ
  accelerate: () => set((state) => state.gameState === 'playing' && { targetSpeed: 380 }), // Max hız
  decelerate: () => set((state) => state.gameState === 'playing' && { targetSpeed: 90 }),  // Normal hız
  
  // ALTIN TOPLAMA
  collectCoin: (id) => set((state) => ({
    score: state.score + 100,
    coins: state.coins.filter(c => c.id !== id),
    message: "+100 GOLD"
  })),

  // MAKAS ATMA (COMBO)
  triggerNearMiss: () => {
    const { combo, score } = get();
    set({ combo: Math.min(combo + 1, 10), score: score + (500 * combo), message: `MAKAS! ${combo}x` });
    setTimeout(() => set({ message: "" }), 1000);
  },

  // OYUN DÖNGÜSÜ (HER KAREDE ÇALIŞIR)
  updateGame: (delta) => set((state) => {
    if (state.gameState !== 'playing') return { speed: 0 };

    // Hızlanma/Yavaşlama Efekti (Lerp)
    const newSpeed = THREE.MathUtils.lerp(state.speed, state.targetSpeed, delta * 2);
    const newScore = state.score + (newSpeed * delta * 0.2);

    // 1. Düşmanları Hareket Ettir
    let newEnemies = state.enemies.map(e => ({
      ...e,
      // Bağıl hız: Senin hızın - Düşmanın hızı
      z: e.z + (newSpeed - e.ownSpeed * 0.5) * delta * 0.5,
      // Şerit değiştiren düşmanların yanal hareketi
      x: e.isChanging ? e.x + (e.targetLane > e.lane ? 1 : -1) * delta * 5 : e.x
    })).filter(e => e.z < 50); // Kamerayı geçenleri sil

    // 2. Altınları Hareket Ettir
    let newCoins = state.coins.map(c => ({
      ...c,
      z: c.z + newSpeed * delta * 0.5
    })).filter(c => c.z < 50);

    // 3. Düşman Spawn Mantığı (Zorluk Dengesi)
    // Skor arttıkça spawn oranı artar (Logaritmik zorlaşma)
    const difficulty = Math.min(state.score / 15000, 1.0); // 15k skorda max zorluk
    const spawnRate = 0.02 + (difficulty * 0.05); // %2'den %7'ye kadar artar

    // Max 15 araç
    if (Math.random() < spawnRate && newEnemies.length < 15) {
      const randomLane = Math.floor(Math.random() * 3); // 0, 1, 2
      const laneX = (randomLane - 1) * 4.5; // -4.5, 0, 4.5 (Standart şeritler)
      
      // Güvenli Spawn Kontrolü: O bölgede başka araç var mı?
      const isSafe = !newEnemies.some(e => Math.abs(e.x - laneX) < 2 && Math.abs(e.z - -400) < 60);

      if (isSafe) {
         const r = Math.random();
         let type = 'sedan';
         if (r > 0.7) type = 'truck';
         else if (r > 0.9) type = 'bus';
         
         newEnemies.push({ 
           id: Math.random(), 
           lane: randomLane,
           x: laneX, 
           z: -400 - Math.random() * 100, // 400m ile 500m ileride doğar
           type, 
           ownSpeed: 80 + Math.random() * 40, // 80-120 km/h arası hız
           passed: false,
           isChanging: false,
           targetLane: randomLane
         });
      }
    }

    // 4. Altın Spawn Mantığı
    if (Math.random() < 0.02 && newCoins.length < 5) {
        const coinLane = Math.floor(Math.random() * 3);
        const coinX = (coinLane - 1) * 4.5;
        // Altın, araçla veya başka altınla çakışmamalı
        const isSafeCar = !newEnemies.some(e => Math.abs(e.x - coinX) < 2 && Math.abs(e.z - -400) < 40);
        const isSafeCoin = !newCoins.some(c => Math.abs(c.x - coinX) < 2 && Math.abs(c.z - -400) < 40);

        if (isSafeCar && isSafeCoin) {
            newCoins.push({ id: Math.random(), x: coinX, z: -400 - Math.random() * 50 });
        }
    }

    return { speed: newSpeed, score: newScore, enemies: newEnemies, coins: newCoins };
  }),

  // OYUNU BİTİR (KAZA)
  setGameOver: () => set({ gameOver: true, gameState: 'gameover', speed: 0, targetSpeed: 0 })
}));

// --- 2. HIZ GÖSTERGESİ (UI BILEŞENİ) ---
function Speedometer({ speed }) {
  // Hız göstergesi için açı hesaplamaları
  const maxSpeed = 360;
  const angle = -135 + (speed / maxSpeed) * 270;
  
  // Kadran çizgilerini ve sayıları çizen yardımcı fonksiyon
  const renderMarks = () => {
    const marks = [];
    for (let i = 0; i <= maxSpeed; i += 30) {
      const markAngle = -135 + (i / maxSpeed) * 270;
      const isMajor = i % 60 === 0; // Ana çizgiler (0, 60, 120...)
      marks.push(
        // Çizgi
        <div key={`line-${i}`} style={{ position: 'absolute', bottom: '50%', left: '50%', width: isMajor?'3px':'2px', height: '100px', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${markAngle}deg)` }}>
          <div style={{ width: '100%', height: isMajor?'15px':'10px', background: i>=240?'#ff3333':'#00ff00', position: 'absolute', top: 0 }}></div>
        </div>
      );
      if (isMajor) {
        // Sayı
        const rad = (markAngle - 90) * (Math.PI / 180);
        marks.push(<div key={`num-${i}`} style={{ position: 'absolute', top: `calc(50% + ${Math.sin(rad)*70}px)`, left: `calc(50% + ${Math.cos(rad)*70}px)`, transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 'bold', color: i>=240?'#ff3333':'#00ff00' }}>{i}</div>);
      }
    }
    return marks;
  };
  
  return (
    // Gösterge Çerçevesi
    <div style={{ position: 'relative', width: '200px', height: '200px', background: 'radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 70%)', borderRadius: '50%', border: '5px solid #2e2e4e', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Arial' }}>
      {renderMarks()}
      {/* Dijital Hız Göstergesi */}
      <div style={{ position: 'absolute', top: '65%', textAlign: 'center' }}><div style={{ fontSize: '32px', fontWeight: 'bold', textShadow: '0 0 10px #00ff00' }}>{Math.floor(speed)}</div><div style={{ fontSize: '12px', color: '#aaa' }}>km/h</div></div>
      {/* İbre */}
      <div style={{ position: 'absolute', bottom: '50%', left: '50%', width: '6px', height: '85px', background: 'linear-gradient(to top, #ff3333, #ff6666)', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${angle}deg)`, borderRadius: '50% 50% 0 0', zIndex: 2 }}></div>
      {/* İbre Göbeği */}
      <div style={{ position: 'absolute', width: '20px', height: '20px', background: '#333', borderRadius: '50%', border: '3px solid #ff3333', zIndex: 3 }}></div>
    </div>
  );
}

// --- 3. OYUNCU ARABASI (FİZİK VE KONTROL) ---
function PlayerCar() {
  const { targetX, enemies, coins, setGameOver, gameOver, triggerNearMiss, collectCoin, speed } = useGameStore();
  const group = useRef();
  const wheels = useRef([]);
  // Farlar için hedef noktalar
  const leftTarget = useRef();
  const rightTarget = useRef();

  // Hedef noktaları ilk render'da oluştur
  if (!leftTarget.current) { leftTarget.current = new THREE.Object3D(); leftTarget.current.position.set(-0.5, -0.5, -100); }
  if (!rightTarget.current) { rightTarget.current = new THREE.Object3D(); rightTarget.current.position.set(0.5, -0.5, -100); }

  useFrame((state, delta) => {
    if (gameOver) return;
    
    // 1. DİREKSİYON FİZİĞİ (Smooth Geçiş)
    const currentX = group.current.position.x;
    // Hedef X'e doğru yumuşakça kay (Lerp)
    group.current.position.x = THREE.MathUtils.lerp(currentX, targetX, delta * 5); 
    
    // 2. SÜSPANSİYON (Body Roll) - DÜZELTİLDİ: Neredeyse sıfıra indirildi
    const moveDiff = (group.current.position.x - currentX) / delta; // Yanal hız
    group.current.rotation.z = -moveDiff * 0.002; // Katsayı 0.05'ten 0.002'ye düşürüldü (Gözle görülmez)
    
    // Hızlanırken burun kalkması
    group.current.rotation.x = -speed * 0.0002; 

    // Tekerlek dönme efekti
    wheels.current.forEach(w => { if(w) w.rotation.x += speed * delta * 0.1; });

    // 3. ÇARPIŞMA KONTROLÜ (Hassas)
    enemies.forEach(enemy => {
      const dx = Math.abs(group.current.position.x - enemy.x); // Yanal mesafe
      const dz = Math.abs(enemy.z - (-2)); // İleri/geri mesafe (Oyuncu Z=-2'de)
      
      // Kaza Alanı: Çok yakınsa çarpışma
      if (dz < 3.5 && dx < 1.8) setGameOver();
      
      // Makas Alanı: Yakınından geçerse puan
      if (!enemy.passed && dz < 6.0 && dx > 2.0 && dx < 4.5) {
        enemy.passed = true; 
        triggerNearMiss();   
      }
    });

    // 4. ALTIN TOPLAMA KONTROLÜ
    coins.forEach(coin => {
        const dx = Math.abs(group.current.position.x - coin.x);
        const dz = Math.abs(coin.z - (-2));
        if (dz < 2.5 && dx < 2.0) collectCoin(coin.id);
    });
  });

  // Araba Materyalleri
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa', metalness: 0.9, roughness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1 });
  const neonMat = new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 2 });

  return (
    // DÜZELTİLDİ: Y pozisyonu 0.1'e yükseltildi (Yola girmeyi önler)
    <group ref={group} position={[0, 0.1, -2]}>
      {/* Far Hedefleri */}
      <primitive object={leftTarget.current} />
      <primitive object={rightTarget.current} />
      
      {/* Farlar (SpotLight) */}
      <spotLight position={[0.8, 0.6, -1.5]} target={rightTarget.current} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} castShadow />
      <spotLight position={[-0.8, 0.6, -1.5]} target={leftTarget.current} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} castShadow />
      
      {/* Araba Gövdesi (Low-Poly Model) */}
      <mesh position={[0, 0.4, 0]} material={bodyMat}><boxGeometry args={[1.8, 0.5, 4.2]} /></mesh> // Ana Gövde
      <mesh position={[-0.95, 0.3, 1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh> // Sol Arka Çamurluk
      <mesh position={[0.95, 0.3, 1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh> // Sağ Arka Çamurluk
      <mesh position={[-0.95, 0.3, -1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh> // Sol Ön Çamurluk
      <mesh position={[0.95, 0.3, -1.2]} material={bodyMat}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh> // Sağ Ön Çamurluk
      <mesh position={[0, 0.8, -0.3]} material={glassMat}><boxGeometry args={[1.4, 0.5, 2.0]} /></mesh> // Kabin/Cam
      <mesh position={[0, 0.9, 1.9]} material={bodyMat}><boxGeometry args={[1.8, 0.1, 0.4]} /></mesh> // Spoiler
      <mesh position={[-0.7, 0.6, 1.9]} material={bodyMat}><boxGeometry args={[0.1, 0.4, 0.2]} /></mesh> // Spoiler Ayağı Sol
      <mesh position={[0.7, 0.6, 1.9]} material={bodyMat}><boxGeometry args={[0.1, 0.4, 0.2]} /></mesh> // Spoiler Ayağı Sağ
      <mesh position={[0, 0.2, 0]} material={neonMat}><boxGeometry args={[1.7, 0.05, 4.1]} /></mesh> // Neon Alt Işık
      <mesh position={[-0.6, 0.5, 2.11]} material={new THREE.MeshBasicMaterial({color: 'red'})}><boxGeometry args={[0.4, 0.15, 0.1]} /></mesh> // Sol Stop
      <mesh position={[0.6, 0.5, 2.11]} material={new THREE.MeshBasicMaterial({color: 'red'})}><boxGeometry args={[0.4, 0.15, 0.1]} /></mesh> // Sağ Stop

      {/* Tekerlekler */}
      {[[-1.0, -1.2], [1.0, -1.2], [-1.0, 1.4], [1.0, 1.4]].map((pos, i) => (
         <mesh key={i} ref={el => wheels.current[i] = el} position={[pos[0], 0.35, pos[1]]} rotation={[0, 0, Math.PI/2]} material={new THREE.MeshStandardMaterial({color:'#111', roughness:0.8})}>
           <cylinderGeometry args={[0.4, 0.4, 0.4, 24]} />
         </mesh>
      ))}
    </group>
  );
}

// --- 4. ALTINLAR (DÖNME EFEKTİ) ---
function SingleCoin({ x, z }) {
    const group = useRef();
    // Her karede Y ekseninde döndür
    useFrame((state, delta) => {
        if(group.current) group.current.rotation.y += delta * 3; 
    });

    return (
        <group ref={group} position={[x, 1, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.6, 0.6, 0.1, 32]} />
                <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} emissive="#FFD700" emissiveIntensity={0.4} />
            </mesh>
        </group>
    )
}

function Coins() {
    const coins = useGameStore(state => state.coins);
    return (
        <>
            {coins.map(coin => <SingleCoin key={coin.id} x={coin.x} z={coin.z} />)}
        </>
    )
}

// --- 5. TRAFİK (DÜŞMAN ARAÇLAR) ---
function Traffic() {
  const enemies = useGameStore(state => state.enemies);
  // Araç Materyalleri
  const truckMat = new THREE.MeshStandardMaterial({ color: '#335577', roughness: 0.5 }); 
  const containerMat = new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.8 }); 
  const busMat = new THREE.MeshStandardMaterial({ color: '#ddaa00', roughness: 0.5 }); 
  const sedanMat = new THREE.MeshStandardMaterial({ color: '#ccc', roughness: 0.3 });
  const tailLightMat = new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 4 });

  return (
    <>
      {enemies.map(enemy => {
        const x = enemy.x; 
        // Şerit değiştirirken hafif yatma efekti
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

// --- 6. ÇEVRE (BİNALAR VE AĞAÇLAR) ---
const Building = ({ width, height, side, type }) => {
    const isApartment = type === 'apartment';
    const buildingMat = new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.9 });
    const winLitMat = new THREE.MeshStandardMaterial({ color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 3 });
    
    // Pencereleri Oluştur
    const wins = useMemo(() => {
        if (!isApartment) return [];
        const w = [];
        const floors = Math.floor(height / 3);
        for (let i = 1; i < floors; i++) {
             if (Math.random() > 0.6) {
                 // DÜZELTİLDİ: Sol ve sağ taraf için doğru ofset hesaplaması
                 // side > 0 (Sağ) ise +0.2, side < 0 (Sol) ise -0.2
                 const offset = side > 0 ? 0.2 : -0.2;
                 w.push([0, i * 3, side * (width / 2) + offset]); 
             }
        }
        return w;
    }, [height, isApartment, side, width]);

    return (
        <group>
            {/* Bina Gövdesi */}
            <mesh position={[0, height / 2, 0]} material={buildingMat}>
                <boxGeometry args={[width, height, width]} />
            </mesh>
            {/* Pencereler */}
            {wins.map((pos, i) => (
                <mesh key={i} position={pos} material={winLitMat}>
                    <planeGeometry args={[width * 0.6, 1.5]} />
                </mesh>
            ))}
            {/* Küçük Ev Çatısı */}
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
  // Objeleri önceden oluştur (Pooling benzeri)
  const objects = useMemo(() => new Array(30).fill(0).map((_, i) => {
      const rand = Math.random();
      let type = 'empty', height = 0, width = 0;
      if (rand > 0.8) { type = 'apartment'; height = 30 + Math.random() * 40; width = 12; }
      else if (rand > 0.5) { type = 'small_house'; height = 6; width = 8; } 
      else if (rand > 0.2) { type = 'tree'; } 
      return { z: -i * 50, type, height, width, offset: (Math.random() - 0.5) * 20 };
  }), []);

  const groupRef = useRef();
  const itemsRef = useRef(objects);

  // Objeleri hareket ettir ve döngüye sok
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, i) => {
        const item = itemsRef.current[i];
        item.z += speed * delta * 0.5; // Objeleri oyuncuya doğru çek
        
        // Kamerayı geçen objeyi en arkaya at ve tipini değiştir
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
           {(obj.type === 'apartment' || obj.type === 'small_house') && <Building width={obj.width} height={obj.height} side={side} type={obj.type} />}
           <group visible={obj.type === 'tree'}>
              <mesh position={[0, 2, 0]} material={trunkMat}><cylinderGeometry args={[0.8, 1.2, 4]} /></mesh>
              <mesh position={[0, 8, 0]} material={treeMat}><coneGeometry args={[4, 10, 8]} /></mesh>
           </group>
        </group>
      ))}
    </group>
  );
}

// --- 7. YOL VE ZEMİN ---
function RoadEnvironment() {
  const { updateGame, speed } = useGameStore();
  const stripesRef = useRef();

  // Oyun döngüsünü ve yol çizgilerini güncelle
  useFrame((state, delta) => {
    updateGame(delta);
    if (stripesRef.current) {
      stripesRef.current.children.forEach(stripe => {
         stripe.position.z += speed * delta * 0.5;
         if (stripe.position.z > 10) stripe.position.z = -200;
      });
    }
  });

  // Yol Kenarı Bariyerleri
  const Barrier = ({ x }) => (
      <group position={[x, 0, 0]}>
          {/* Bariyer Direkleri */}
          {Array.from({length: 40}).map((_, i) => (
             <mesh key={i} position={[0, 0.5, -i * 10]} material={new THREE.MeshStandardMaterial({color: '#999'})}>
                <boxGeometry args={[0.2, 1.0, 0.2]} />
             </mesh>
          ))}
          {/* Bariyer Rayı */}
          <mesh position={[0, 0.8, -200]} material={new THREE.MeshStandardMaterial({color: '#B0C4DE', metalness: 0.6, roughness: 0.4})}>
              <boxGeometry args={[0.3, 0.4, 1000]} />
          </mesh>
      </group>
  );

  return (
    <group>
      {/* Asfalt Yol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
         <planeGeometry args={[20, 1000]} /> 
         <meshStandardMaterial color="#555" roughness={0.8} />
      </mesh>
      
      {/* Yol Çizgileri */}
      <group ref={stripesRef}>
        {[-2.25, 2.25].map((x) => Array.from({ length: 30 }).map((_, j) => (
            <mesh key={`${x}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -j * 20]}>
                <planeGeometry args={[0.25, 6]} /> 
                <meshBasicMaterial color="#fff" />
            </mesh>
        )))}
      </group>
      
      {/* Bariyerler ve Çevre Objeleri */}
      <Barrier x={-10.5} />
      <Barrier x={10.5} />
      <SideObjects side={1} />
      <SideObjects side={-1} />
      
      {/* Çim Zemin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <planeGeometry args={[2000, 2000]} />
          <meshStandardMaterial color="#113311" roughness={1.0} />
      </mesh>
    </group>
  );
}

// --- 8. HIZ EFEKTİ (ÇİZGİLER) ---
function SpeedLines() {
  const { speed } = useGameStore();
  const lines = useMemo(() => new Array(100).fill(0).map(() => ({ x: (Math.random() - 0.5) * 50, y: Math.random() * 15, z: (Math.random() - 0.5) * 200, len: Math.random() * 20 + 10 })), []);
  const ref = useRef();
  
  useFrame((state, delta) => {
    if(ref.current) {
      ref.current.children.forEach((line, i) => {
        line.position.z += speed * delta * 0.9;
        if (line.position.z > 20) line.position.z = -200; 
      });
    }
  });
  
  // Düşük hızda çizgileri gizle
  if (speed < 100) return null;
  
  return (
    <group ref={ref}>
      {lines.map((l, i) => <mesh key={i} position={[l.x, l.y, l.z]}><boxGeometry args={[0.04, 0.04, l.len]} /><meshBasicMaterial color="white" transparent opacity={0.15} /></mesh>)}
    </group>
  );
}

// --- 9. GÖKYÜZÜ (AY VE YILDIZLAR) ---
function SkyEnvironment() {
  return (
    <group>
      <Stars radius={150} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <mesh position={[50, 80, -200]}><sphereGeometry args={[10, 32, 32]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <pointLight position={[50, 80, -180]} intensity={1.5} color="#aabbff" distance={500} />
    </group>
  );
}

// --- ANA UYGULAMA BİLEŞENİ ---
export default function App() {
  const { speed, score, combo, message, gameOver, gameState, countdown, startGame, quitGame, accelerate, decelerate, steer } = useGameStore();
  
  // Klavye Dinleyicileri
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') steer(-1); // Sola kay
      if (e.key === 'ArrowRight') steer(1); // Sağa kay
      if (e.key === 'ArrowUp') accelerate(); // Gaz
    };
    const handleKeyUp = (e) => { if (e.key === 'ArrowUp') decelerate(); }; // Gazı bırak
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a15', overflow: 'hidden' }}>
      
      {/* COUNTDOWN EKRANI */}
      {gameState === 'countdown' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
           <h1 style={{ fontSize: '150px', color: '#00ff00', textShadow: '0 0 30px #fff', fontStyle: 'italic', fontFamily: 'Arial' }}>{countdown}</h1>
        </div>
      )}

      {/* BAŞLANGIÇ MENÜSÜ */}
      {gameState === 'menu' && (
         <div style={{ position: 'absolute', zIndex: 60, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
            <button onClick={startGame} style={{ padding: '20px 60px', fontSize: '30px', background: '#00ff00', color:'#000', border: 'none', borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px #00ff00' }}>START RACE</button>
         </div>
      )}

      {/* HUD - HIZ GÖSTERGESİ */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, pointerEvents: 'none' }}>
        <Speedometer speed={speed} />
      </div>
      
      {/* HUD - SKOR TABELASI */}
      <div style={{ 
          position: 'absolute', top: 20, right: 20, 
          background: 'linear-gradient(135deg, #333 0%, #000 100%)',
          border: '2px solid #555', borderRadius: '10px', padding: '10px 30px',
          transform: 'skewX(-15deg)', zIndex: 10, color: '#fff', textAlign: 'right', boxShadow: '0 5px 15px rgba(0,0,0,0.5)'
      }}>
        <div style={{ fontSize: '12px', color: '#00ff00', fontWeight: 'bold', transform: 'skewX(15deg)' }}>SCORE</div>
        <div style={{ fontSize: '40px', fontWeight: 'bold', transform: 'skewX(15deg)' }}>{Math.floor(score)}</div>
      </div>

      {/* HUD - MESAJLAR */}
      {combo > 1 && <div style={{ position: 'absolute', top: 120, right: 30, fontSize: '40px', color: '#00ff00', fontWeight: 'bold', zIndex: 10, textShadow: '0 0 15px lime' }}>{combo}x COMBO</div>}
      {message && <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', fontSize: '80px', fontWeight: 'bold', fontStyle: 'italic', zIndex: 15, textShadow: '0 0 20px cyan' }}>{message}</div>}

      {/* GAME OVER MENÜSÜ */}
      {gameOver && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(50,0,0,0.95)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'Arial' }}>
          <h1 style={{ fontSize: '80px', color: '#ff0000', margin: '0 0 20px 0', textShadow: '0 0 30px red', textTransform: 'uppercase' }}>YOU CRASHED</h1>
          <h2 style={{ color: '#fff', fontSize: '30px', marginBottom: '40px' }}>FINAL SCORE: {Math.floor(score)}</h2>
          
          <div style={{ display: 'flex', gap: '20px' }}>
            <button onClick={startGame} style={{ padding: '20px 40px', fontSize: '24px', cursor: 'pointer', background: '#fff', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', boxShadow: '0 0 20px white' }}>RESTART</button>
            <button onClick={quitGame} style={{ padding: '20px 40px', fontSize: '24px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #666', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase' }}>QUIT</button>
          </div>
        </div>
      )}

      {/* 3D SAHNE */}
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 6, 14]} fov={55} />
        <ambientLight intensity={0.6} color="#ffffff" /> 
        <hemisphereLight skyColor="#445566" groundColor="#223344" intensity={0.6} />
        <Suspense fallback={null}>
           <SkyEnvironment />
           <SpeedLines />
           <PlayerCar />
           <Traffic />
           <Coins />
           <RoadEnvironment />
        </Suspense>
      </Canvas>
    </div>
  );
}
