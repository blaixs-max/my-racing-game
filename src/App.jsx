import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// --- OYUN AYARLARI ---
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
    set({ combo: Math.min(combo + 1, 10), score: score + (500 * combo), message: `MAKAS! ${combo}x`, lastComboTime: Date.now() });
    setTimeout(() => set({ message: "" }), 1000);
  },
  updateGame: (delta) => set((state) => {
    if (state.gameOver) return { speed: 0, targetSpeed: 0 };
    const newSpeed = THREE.MathUtils.lerp(state.speed, state.targetSpeed, delta * 3);
    const newScore = state.score + (newSpeed * delta * 0.2);
    let newCombo = state.combo;
    if (Date.now() - state.lastComboTime > 3000 && state.combo > 1) newCombo = 1;
    let newEnemies = state.enemies.map(e => ({ ...e, z: e.z + (newSpeed * delta * 0.5), passed: e.passed || false })).filter(e => e.z < 100); 
    const spawnRate = 0.02 + (newSpeed / 10000); 
    if (Math.random() < spawnRate && newEnemies.length < 7) {
      const randomLane = Math.floor(Math.random() * 3); 
      const r = Math.random();
      let type = 'sedan';
      if (r > 0.7) type = 'truck';
      newEnemies.push({ id: Math.random(), lane: randomLane, z: -400 - Math.random() * 200, passed: false, type });
    }
    return { speed: newSpeed, score: newScore, enemies: newEnemies, combo: newCombo };
  }),
  setGameOver: () => set({ gameOver: true, speed: 0, targetSpeed: 0 })
}));

// --- 2. OYUNCU ARABASI (HERO.GLB) ---
function PlayerCar() {
  const { lane, enemies, setGameOver, gameOver, triggerNearMiss, speed } = useGameStore();
  const group = useRef();
  
  // DİKKAT: Eğer araba görünmezse scale değerini artır. Çok büyükse düşür.
  // 'hero.glb' dosyasının public klasöründe olduğundan emin ol.
  const { scene } = useGLTF('/hero.glb');
  const carModel = useMemo(() => scene.clone(), [scene]);

  // Farlar için hedef
  const leftTarget = useRef();
  const rightTarget = useRef();
  if (!leftTarget.current) { leftTarget.current = new THREE.Object3D(); leftTarget.current.position.set(-0.5, -0.5, -150); }
  if (!rightTarget.current) { rightTarget.current = new THREE.Object3D(); rightTarget.current.position.set(0.5, -0.5, -150); }

  const targetX = (lane - 1) * 4.5; 

  useFrame((state, delta) => {
    if (gameOver) return;
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, targetX, delta * 10);
    const tilt = (group.current.position.x - targetX) * 0.1;
    group.current.rotation.z = tilt; 
    group.current.rotation.x = -speed * 0.0002; 

    enemies.forEach(enemy => {
      const enemyX = (enemy.lane - 1) * 4.5;
      const dx = Math.abs(group.current.position.x - enemyX);
      const dz = Math.abs(enemy.z - (-2)); 
      if (dz < 4.0 && dx < 2.0) setGameOver();
      if (!enemy.passed && dz < 7.0 && dx > 2.2 && dx < 5.0) {
        enemy.passed = true; 
        triggerNearMiss();   
      }
    });
  });

  return (
    <group ref={group} position={[0, 0, -2]}>
      <primitive object={leftTarget.current} />
      <primitive object={rightTarget.current} />
      {/* FARLAR */}
      <spotLight position={[0.5, 0.8, -1.0]} target={rightTarget.current} angle={0.3} penumbra={0.5} intensity={150} color="#fff" distance={300} />
      <spotLight position={[-0.5, 0.8, -1.0]} target={leftTarget.current} angle={0.3} penumbra={0.5} intensity={150} color="#fff" distance={300} />
      <pointLight position={[0, 3, 0]} intensity={3} distance={10} />

      {/* --- MODEL AYARLARI --- */}
      {/* SCALE: 1.0 çok küçük gelirse 100 yap, çok büyükse 0.01 yap */}
      {/* ROTATION: [0, Math.PI, 0] arabayı 180 derece döndürür. Araba tersse [0,0,0] yap. */}
      <primitive object={carModel} scale={1.0} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

// --- 3. TRAFİK ARAÇLARI (TRUCK.GLB & SEDAN.GLB) ---
function Traffic() {
  const enemies = useGameStore(state => state.enemies);
  const truckGltf = useGLTF('/truck.glb');
  const sedanGltf = useGLTF('/sedan.glb');

  return (
    <>
      {enemies.map(enemy => {
        const x = (enemy.lane - 1) * 4.5;
        let scene = enemy.type === 'truck' ? truckGltf.scene : sedanGltf.scene;
        let clone = useMemo(() => scene.clone(), [scene, enemy.type]);

        return (
          <group key={enemy.id} position={[x, 0, enemy.z]}>
             {/* TRAFİK ARAÇLARI BOYUT VE YÖN AYARI */}
             <primitive object={clone} scale={enemy.type === 'truck' ? 1.5 : 1.2} rotation={[0, 0, 0]} />
             <pointLight position={[0, 1, 2]} color="red" intensity={3} distance={8} />
          </group>
        );
      })}
    </>
  );
}

// --- 4. ÇEVRE VE YOL (KODLA ÇİZİM - SABİT) ---
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

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
         <planeGeometry args={[20, 1000]} /> 
         <meshStandardMaterial color="#444" roughness={0.8} />
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
      {/* Bariyerler */}
      <mesh position={[-10.5, 0.5, 0]}><boxGeometry args={[0.5, 1, 1000]} /><meshStandardMaterial color="#888" metalness={0.8} /></mesh>
      <mesh position={[10.5, 0.5, 0]}><boxGeometry args={[0.5, 1, 1000]} /><meshStandardMaterial color="#888" metalness={0.8} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}><planeGeometry args={[2000, 2000]} /><meshStandardMaterial color="#080808" /></mesh>
    </group>
  );
}

function SpeedLines() {
  const { speed } = useGameStore();
  const lines = useMemo(() => new Array(150).fill(0).map(() => ({
    x: (Math.random() - 0.5) * 80, y: Math.random() * 30, z: (Math.random() - 0.5) * 300, len: Math.random() * 30 + 10
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
         <mesh key={i} position={[l.x, l.y, l.z]}><boxGeometry args={[0.05, 0.05, l.len]} /><meshBasicMaterial color="white" transparent opacity={0.15} /></mesh>
      ))}
    </group>
  );
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
      <Suspense fallback={<div style={{color:'white', fontSize:'30px', position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)'}}>YENİ ARAÇLAR YÜKLENİYOR...</div>}>
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
          <ambientLight intensity={1.5} color="#ffffff" /> 
          <hemisphereLight skyColor="#88ccff" groundColor="#444444" intensity={1.0} />
          <SpeedLines />
          <PlayerCar />
          <Traffic />
          <RoadEnvironment />
        </Canvas>
      </Suspense>
    </div>
  );
}
