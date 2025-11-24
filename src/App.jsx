import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// --- SES SİSTEMİ ---
class AudioSystem {
  constructor() {
    this.context = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.log('Audio not supported');
    }
  }

  playCrash() {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'square';
    osc.frequency.value = 100;
    gain.gain.value = 0.5;
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);
    osc.stop(this.context.currentTime + 0.5);
    
    // Titreşim
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  }

  playNearMiss() {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(1200, this.context.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.2);
    osc.stop(this.context.currentTime + 0.2);
    
    // Hafif titreşim
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
}

const audioSystem = new AudioSystem();

// --- OYUN VERİ MERKEZİ ---
const useGameStore = create((set, get) => ({
  gameState: 'menu',
  countdown: 3,
  speed: 0,
  targetSpeed: 60,
  currentX: 0,
  targetX: 0,
  score: 0,
  combo: 1,
  gameOver: false,
  enemies: [],
  coins: [],
  particles: [],
  message: "",
  cameraShake: 0,
  totalDistance: 0,
  nearMissCount: 0,
  
  // Nitro sistemi
  nitro: 100,
  maxNitro: 100,
  isNitroActive: false,
  nitroRegenRate: 5, // saniyede 5 birim
  
  // Araç özelleştirme
  selectedCar: 'default',
  availableCars: ['default', 'sport', 'muscle'],
  upgrades: {
    speed: 1,
    control: 1,
    durability: 1
  },
  
  // Gyroscope
  useGyroscope: false,
  gyroPermission: false,
  
  // Yol tipleri
  roadSegments: [],
  currentRoadType: 'straight',
  roadTransition: 0,
  
  // Update optimizasyonu
  updateCounter: 0,
  
  startGame: () => {
    audioSystem.init();
    set({ 
      gameState: 'countdown', 
      countdown: 3, 
      speed: 0, 
      targetSpeed: 0, 
      score: 0, 
      combo: 1, 
      enemies: [], 
      coins: [],
      particles: [],
      message: "", 
      currentX: 0,
      targetX: 0,
      gameOver: false,
      totalDistance: 0,
      nearMissCount: 0,
      roadSegments: [],
      currentRoadType: 'straight',
      nitro: 100,
      isNitroActive: false,
      updateCounter: 0
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
        // Oyun başlangıcı - yavaş başla
        set({ gameState: 'playing', countdown: null, speed: 60, targetSpeed: 110 });
      }
    }, 1000);
  },

  quitGame: () => {
    set({ 
      gameState: 'menu', 
      gameOver: false, 
      score: 0, 
      speed: 0,
      targetSpeed: 110,
      currentX: 0,
      targetX: 0,
      cameraShake: 0
    });
  },
  
  selectCar: (carType) => set({ selectedCar: carType }),
  
  upgradeStat: (stat) => set((state) => {
    const cost = state.upgrades[stat] * 1000;
    if (state.score >= cost && state.upgrades[stat] < 5) {
      return {
        upgrades: { ...state.upgrades, [stat]: state.upgrades[stat] + 1 },
        score: state.score - cost
      };
    }
    return {};
  }),
  
  steer: (direction) => set((state) => {
    if (state.gameState !== 'playing') return {};
    const controlBonus = state.upgrades.control * 0.2;
    const step = 1.25 + controlBonus;
    let newX = state.targetX + (direction * step);
    if (newX > 5.0) newX = 5.0;
    if (newX < -5.0) newX = -5.0;
    return { targetX: newX };
  }),
  
  setGyroX: (x) => set((state) => {
    if (state.gameState !== 'playing' || !state.useGyroscope) return {};
    let newX = x * 5;
    if (newX > 5.0) newX = 5.0;
    if (newX < -5.0) newX = -5.0;
    return { targetX: newX };
  }),
  
  toggleGyroscope: () => set((state) => ({ useGyroscope: !state.useGyroscope })),
  
  activateNitro: () => set((state) => {
    if (state.gameState !== 'playing' || state.nitro <= 0) return {};
    return { isNitroActive: true };
  }),
  
  deactivateNitro: () => set({ isNitroActive: false }),
  
  collectCoin: (id) => {
    set((state) => ({
      score: state.score + 100,
      coins: state.coins.filter(c => c.id !== id),
      message: "+100 GOLD"
    }));
    setTimeout(() => set({ message: "" }), 600); // 1000'den 600'e düşürüldü
  },

  triggerNearMiss: (position) => {
    const { combo, score, nearMissCount } = get();
    audioSystem.playNearMiss();
    
    // Spark partikül efektleri - 5'e düşürüldü (performans)
    const newParticles = [];
    for (let i = 0; i < 5; i++) {
      newParticles.push({
        id: Math.random(),
        type: 'spark',
        x: position.x + (Math.random() - 0.5) * 2,
        y: position.y + Math.random() * 2,
        z: position.z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * 5,
        vz: (Math.random() - 0.5) * 5,
        life: 1.0
      });
    }
    
    set((state) => ({ 
      combo: Math.min(combo + 1, 10), 
      score: score + (500 * combo), 
      message: `NEAR MISS! ${combo}x`,
      nearMissCount: nearMissCount + 1,
      particles: [...state.particles, ...newParticles]
    }));
    
    setTimeout(() => set({ message: "" }), 600); // 1000'den 600'e düşürüldü
  },

  addExplosion: (x, y, z) => {
    const newParticles = [];
    for (let i = 0; i < 20; i++) { // 50'den 20'ye düşürüldü (performans)
      newParticles.push({
        id: Math.random(),
        type: 'explosion',
        x: x + (Math.random() - 0.5) * 2,
        y: y + Math.random() * 2,
        z: z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 10,
        vy: Math.random() * 10 + 5,
        vz: (Math.random() - 0.5) * 10,
        life: 1.0,
        size: Math.random() * 0.5 + 0.3
      });
    }
    set((state) => ({ particles: [...state.particles, ...newParticles] }));
  },

  updateGame: (delta) => set((state) => {
    if (state.gameState !== 'playing') return { speed: 0 };

    // Update counter için
    const newUpdateCounter = (state.updateCounter || 0) + 1;

    // Nitro sistemi
    let newNitro = state.nitro;
    let newTargetSpeed = 110; // Nitrosuz max hız 110
    
    if (state.isNitroActive && state.nitro > 0) {
      // Nitro aktif - tüket ve hızlan
      newNitro = Math.max(0, state.nitro - delta * 25); // saniyede 25 birim tüketim
      const speedBonus = state.upgrades.speed * 5;
      newTargetSpeed = 150 + speedBonus; // Nitrolu max hız 150
      
      if (newNitro <= 0) {
        set({ isNitroActive: false });
      }
    } else {
      // Nitro pasif - yenile
      newNitro = Math.min(state.maxNitro, state.nitro + delta * state.nitroRegenRate);
      newTargetSpeed = 110; // Nitrosuz max hız 110
    }

    const newSpeed = THREE.MathUtils.lerp(state.speed, newTargetSpeed, delta * 2);
    const newScore = state.score + (newSpeed * delta * 0.2);
    const newDistance = state.totalDistance + (newSpeed * delta * 0.1);

    // Kamera shake azaltma
    const newShake = Math.max(0, state.cameraShake - delta * 5);

    // Partikül güncelleme - daha hızlı yok olma (performans)
    let newParticles = state.particles.map(p => ({
      ...p,
      x: p.x + p.vx * delta,
      y: p.y + p.vy * delta - 9.8 * delta,
      z: p.z + p.vz * delta,
      vy: p.vy - 9.8 * delta,
      life: p.life - delta * 3 // 2'den 3'e çıkarıldı - daha hızlı yok olma
    })).filter(p => p.life > 0);

    // Düşman AI ve güncelleme - HER 2 FRAME'DE BİR (performans)
    let newEnemies = state.enemies;
    if (newUpdateCounter % 2 === 0) {
      newEnemies = state.enemies.map(e => {
        let updated = { ...e };
        
        // Daha az sık rastgele şerit değiştirme (0.008 -> 0.003)
        if (!e.isChanging && Math.random() < 0.003) {
          // Sadece yan şerite geçiş
          const currentLane = e.lane;
          let possibleLanes = [];
          
          // Sol şeritte (-1): sadece ortaya (0)
          // Orta şeritte (0): sağa (1) veya sola (-1)
          // Sağ şeritte (1): sadece ortaya (0)
          if (currentLane === -1) {
            possibleLanes = [0];
          } else if (currentLane === 0) {
            possibleLanes = [-1, 1];
          } else if (currentLane === 1) {
            possibleLanes = [0];
          }
          
          // Güvenli şeritleri filtrele
          const safeLanes = possibleLanes.filter(l => {
            const targetX = l * 4.5;
            const isSafe = !state.enemies.some(other => 
              other.id !== e.id && 
              Math.abs(other.x - targetX) < 3 && 
              Math.abs(other.z - e.z) < 25
            );
            return isSafe;
          });
          
          if (safeLanes.length > 0) {
            const newLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
            updated.isChanging = true;
            updated.targetLane = newLane;
            updated.changeProgress = 0;
          }
        }
        
        if (updated.isChanging) {
          updated.changeProgress += delta * 2;
          const startX = updated.lane * 4.5;
          const endX = updated.targetLane * 4.5;
          updated.x = THREE.MathUtils.lerp(startX, endX, Math.min(updated.changeProgress, 1));
          
          if (updated.changeProgress >= 1) {
            updated.isChanging = false;
            updated.lane = updated.targetLane;
            updated.x = updated.targetLane * 4.5;
          }
        }
        
        updated.z = e.z + (newSpeed - e.ownSpeed * 0.5) * delta * 0.5;
        
        return updated;
      }).filter(e => e.z < 50);
    } else {
      // Sadece pozisyon güncelle
      newEnemies = state.enemies.map(e => ({
        ...e,
        z: e.z + (newSpeed - e.ownSpeed * 0.5) * delta * 0.5
      })).filter(e => e.z < 50);
    }

    let newCoins = state.coins.map(c => ({
      ...c,
      z: c.z + newSpeed * delta * 0.5
    })).filter(c => c.z < 50);

    const difficulty = Math.min(state.score / 15000, 1.0);
    const spawnRate = 0.015 + (difficulty * 0.03);

    // Geliştirilmiş spawn algoritması - max 10 araç (performans)
    if (Math.random() < spawnRate && newEnemies.length < 10) {
      const lanes = [-1, 0, 1];
      const availableLanes = lanes.filter(lane => {
        const laneX = lane * 4.5;
        return !newEnemies.some(e => 
          Math.abs(e.lane - lane) < 0.5 && Math.abs(e.z - -400) < 80
        );
      });

      if (availableLanes.length > 0) {
        const randomLane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        const laneX = randomLane * 4.5;
        
        const r = Math.random();
        let type = 'sedan';
        if (r > 0.9) type = 'police';
        else if (r > 0.8) type = 'ambulance';
        else if (r > 0.7) type = 'sport';
        else if (r > 0.5) type = 'truck';
        else if (r > 0.4) type = 'bus';
        
        newEnemies.push({ 
          id: Math.random(), 
          lane: randomLane,
          targetLane: randomLane,
          x: laneX, 
          z: -400 - Math.random() * 100, 
          type, 
          ownSpeed: 80 + Math.random() * 60,
          passed: false,
          isChanging: false,
          changeProgress: 0
        });
      }
    }

    if (Math.random() < 0.02 && newCoins.length < 3) { // 5'ten 3'e düşürüldü (performans)
      const coinLane = Math.floor(Math.random() * 3) - 1;
      const coinX = coinLane * 4.5;
      const isSafeCar = !newEnemies.some(e => Math.abs(e.x - coinX) < 2 && Math.abs(e.z - -400) < 40);
      const isSafeCoin = !newCoins.some(c => Math.abs(c.x - coinX) < 2 && Math.abs(c.z - -400) < 40);

      if (isSafeCar && isSafeCoin) {
        newCoins.push({ id: Math.random(), x: coinX, z: -400 - Math.random() * 50 });
      }
    }

    return { 
      speed: newSpeed, 
      score: newScore, 
      enemies: newEnemies, 
      coins: newCoins,
      particles: newParticles,
      totalDistance: newDistance,
      cameraShake: newShake,
      nitro: newNitro,
      targetSpeed: newTargetSpeed,
      updateCounter: newUpdateCounter
    };
  }),

  setGameOver: () => {
    const state = get();
    audioSystem.playCrash();
    
    // Patlama efekti
    state.addExplosion(state.currentX, 1, -2);
    
    set({ 
      gameOver: true, 
      gameState: 'gameover', 
      speed: 0, 
      targetSpeed: 0,
      cameraShake: 3.0
    });
  }
}));

// --- PARTIKÜL SİSTEMİ ---
function ParticleSystem() {
  const particles = useGameStore(state => state.particles);
  
  return (
    <group>
      {particles.map(p => {
        const color = p.type === 'spark' ? '#ffff00' : (p.life > 0.5 ? '#ff4500' : '#333');
        const size = p.type === 'spark' ? 0.1 : (p.size || 0.3);
        
        return (
          <mesh key={p.id} position={[p.x, p.y, p.z]}>
            <sphereGeometry args={[size, 4, 4]} />
            <meshBasicMaterial 
              color={color} 
              transparent 
              opacity={p.life}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// --- MOBİL KONTROLLER ---
function MobileControls() {
  const { steer, activateNitro, deactivateNitro } = useGameStore();
  const intervalRef = useRef(null);

  const startSteering = (direction) => {
    if (intervalRef.current) return;
    steer(direction);
    intervalRef.current = setInterval(() => {
      steer(direction);
    }, 50);
  };

  const stopSteering = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Tüm olayları engelle
  const preventAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  const handlers = (direction) => ({
    onTouchStart: (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      startSteering(direction); 
    },
    onTouchEnd: (e) => { 
      e.preventDefault(); 
      e.stopPropagation();
      stopSteering(); 
    },
    onTouchMove: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: preventAll,
    onSelectStart: preventAll,
    onDragStart: preventAll,
  });

  return (
    <>
      <div
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '50%', 
          height: '100%', 
          zIndex: 40, 
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto'
        }}
        {...handlers(-1)}
      />
      <div
        style={{ 
          position: 'absolute', 
          top: 0, 
          right: 0, 
          width: '50%', 
          height: '100%', 
          zIndex: 40, 
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto'
        }}
        {...handlers(1)}
      />
      
      {/* NITRO BUTTON */}
      <div
        onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); activateNitro(); }}
        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); deactivateNitro(); }}
        onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onContextMenu={preventAll}
        onSelectStart={preventAll}
        onDragStart={preventAll}
        style={{
          position: 'fixed',
          top: isPortrait ? '180px' : 'auto',
          bottom: isLandscape ? '10px' : (isPortrait ? 'auto' : '30px'),
          right: isLandscape ? '10px' : (isPortrait ? '5px' : '30px'),
          width: isLandscape ? '40px' : (isPortrait ? '55px' : '100px'),
          height: isLandscape ? '40px' : (isPortrait ? '55px' : '100px'),
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)',
          border: `${isLandscape ? '2px' : '3px'} solid #fff`,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isLandscape ? '8px' : (isPortrait ? '10px' : '18px'),
          color: '#fff',
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 5px 30px rgba(255,69,0,0.9)',
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          animation: 'pulseNitro 1.5s ease-in-out infinite',
          pointerEvents: 'auto'
        }}
      >
        🔥<br/>NITRO
      </div>
      
      <style>{`
        @keyframes pulseNitro {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0 5px 20px rgba(255,69,0,0.9);
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 0 8px 30px rgba(255,69,0,1);
          }
        }
      `}</style>
    </>
  );
}

// --- GYROSCOPE ---
function GyroscopeHandler() {
  const { useGyroscope, setGyroX, gameState } = useGameStore();
  
  useEffect(() => {
    if (!useGyroscope || gameState !== 'playing') return;
    
    const handleOrientation = (event) => {
      if (event.gamma !== null) {
        const tilt = event.gamma / 45; // -1 to 1
        setGyroX(-tilt);
      }
    };
    
    const requestPermission = async () => {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (e) {
          console.log('Gyro permission denied');
        }
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    };
    
    requestPermission();
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [useGyroscope, gameState]);
  
  return null;
}

// --- HIZ GÖSTERGESİ ---
function Speedometer({ speed }) {
  const maxSpeed = 200;
  const angle = -135 + (speed / maxSpeed) * 270;
  const renderMarks = () => {
    const marks = [];
    for (let i = 0; i <= maxSpeed; i += 20) {
      const markAngle = -135 + (i / maxSpeed) * 270;
      const isMajor = i % 40 === 0;
      marks.push(
        <div key={`line-${i}`} style={{ position: 'absolute', bottom: '50%', left: '50%', width: isMajor?'3px':'2px', height: '100px', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${markAngle}deg)` }}>
          <div style={{ width: '100%', height: isMajor?'15px':'10px', background: i>=140?'#ff3333':'#00ff00', position: 'absolute', top: 0 }}></div>
        </div>
      );
      if (isMajor) {
        const rad = (markAngle - 90) * (Math.PI / 180);
        marks.push(<div key={`num-${i}`} style={{ position: 'absolute', top: `calc(50% + ${Math.sin(rad)*70}px)`, left: `calc(50% + ${Math.cos(rad)*70}px)`, transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 'bold', color: i>=140?'#ff3333':'#00ff00' }}>{i}</div>);
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

// --- OYUNCU ARABASI (GELİŞTİRİLMİŞ) ---
function PlayerCar() {
  const { targetX, enemies, coins, setGameOver, gameOver, triggerNearMiss, collectCoin, speed, selectedCar, upgrades, gameState } = useGameStore();
  const group = useRef();
  const wheels = useRef([]);
  const leftTarget = useRef();
  const rightTarget = useRef();

  if (!leftTarget.current) { leftTarget.current = new THREE.Object3D(); leftTarget.current.position.set(-0.5, -0.5, -100); }
  if (!rightTarget.current) { rightTarget.current = new THREE.Object3D(); rightTarget.current.position.set(0.5, -0.5, -100); }

  // Restart sonrası pozisyon ve rotasyon sıfırlama
  useEffect(() => {
    if (group.current && gameState === 'playing') {
      group.current.position.set(0, 0.1, -2);
      group.current.rotation.set(0, 0, 0);
    }
  }, [gameState]);

  useFrame((state, delta) => {
    if (gameOver || !group.current) return;
    
    const currentX = group.current.position.x;
    const lerpSpeed = 5 + (upgrades.control * 1);
    group.current.position.x = THREE.MathUtils.lerp(currentX, targetX, delta * lerpSpeed); 
    
    const moveDiff = (group.current.position.x - currentX) / delta;
    group.current.rotation.z = -moveDiff * 0.002; 
    group.current.rotation.x = -speed * 0.0002; 

    wheels.current.forEach(w => { if(w) w.rotation.x += speed * delta * 0.1; });

    // Geliştirilmiş çarpışma algılama
    const durabilityBonus = upgrades.durability * 0.1;
    const crashThresholdX = 1.8 + durabilityBonus; 
    const crashThresholdZ = 3.5 + durabilityBonus; 
    const nearMissThresholdX = 2.9; 
    const nearMissThresholdZ = 5.0; 

    enemies.forEach(enemy => {
      const dx = Math.abs(group.current.position.x - enemy.x);
      const dz = Math.abs(enemy.z - (-2)); 
      
      // Araç tipine göre çarpışma mesafesi
      let crashWidthThreshold = crashThresholdX;
      let crashDepthThreshold = crashThresholdZ;
      
      if (enemy.type === 'truck') {
        crashWidthThreshold = 2.3; // Kamyon daha geniş
        crashDepthThreshold = 5.5; // Kamyon daha uzun
      } else if (enemy.type === 'bus') {
        crashWidthThreshold = 2.4; // Otobüs daha geniş
        crashDepthThreshold = 6.5; // Otobüs çok uzun
      } else if (enemy.type === 'sedan' || enemy.type === 'sport' || enemy.type === 'police') {
        crashWidthThreshold = 1.8; // Normal araçlar daha dar
        crashDepthThreshold = 3.5;
      } else if (enemy.type === 'ambulance') {
        crashWidthThreshold = 2.1;
        crashDepthThreshold = 4.5;
      }
      
      // ÇARPISMA kontrolü - daha hassas
      if (dz < crashDepthThreshold && dx < crashWidthThreshold) {
        setGameOver();
      }
      
      // NEAR MISS kontrolü - sadece geçerken ve çarpmadan
      if (!enemy.passed && dz < nearMissThresholdZ && dz > 1.5 && dx >= crashWidthThreshold && dx < nearMissThresholdX) {
        enemy.passed = true; 
        triggerNearMiss({ x: enemy.x, y: 1, z: enemy.z });   
      }
    });

    coins.forEach(coin => {
      const dx = Math.abs(group.current.position.x - coin.x);
      const dz = Math.abs(coin.z - (-2));
      if (dz < 2.5 && dx < 2.0) collectCoin(coin.id);
    });
  });

  // Araç modeline göre renk
  const carColors = {
    default: '#aaaaaa',
    sport: '#ff0000',
    muscle: '#000000'
  };

  const bodyMat = new THREE.MeshStandardMaterial({ color: carColors[selectedCar] || '#aaaaaa', metalness: 0.9, roughness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1 });
  const neonMat = new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 2 });

  return (
    <group ref={group} position={[0, 0.1, -2]}>
      <primitive object={leftTarget.current} />
      <primitive object={rightTarget.current} />
      <spotLight position={[0.8, 0.6, -1.5]} target={rightTarget.current} angle={0.3} penumbra={0.3} intensity={5} color="#ffffee" distance={80} decay={2} />
      <spotLight position={[-0.8, 0.6, -1.5]} target={leftTarget.current} angle={0.3} penumbra={0.3} intensity={5} color="#ffffee" distance={80} decay={2} />
      
      {/* Shadow casting kaldırıldı - performans */}
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

// --- ALTINLAR ---
function SingleCoin({ x, z }) {
  const group = useRef();
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

// --- TRAFİK (YENİ ARAÇ TİPLERİ) ---
function Traffic() {
  const enemies = useGameStore(state => state.enemies);
  
  const materials = {
    truck: new THREE.MeshStandardMaterial({ color: '#335577', roughness: 0.5 }),
    container: new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.8 }),
    bus: new THREE.MeshStandardMaterial({ color: '#ddaa00', roughness: 0.5 }),
    sedan: new THREE.MeshStandardMaterial({ color: '#ccc', roughness: 0.3 }),
    police: new THREE.MeshStandardMaterial({ color: '#000', roughness: 0.3 }),
    ambulance: new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.3 }),
    sport: new THREE.MeshStandardMaterial({ color: '#ff0000', metalness: 0.8, roughness: 0.2 }),
    tailLight: new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 4 }),
    policeLight: new THREE.MeshStandardMaterial({ color: '#0000ff', emissive: '#0000ff', emissiveIntensity: 5 }),
    ambulanceLight: new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 5 })
  };

  return (
    <>
      {enemies.map(enemy => {
        const x = enemy.x; 
        const tilt = enemy.isChanging ? (enemy.targetLane > enemy.lane ? -0.1 : 0.1) : 0;
        
        return (
          <group key={enemy.id} position={[x, 0, enemy.z]} rotation={[0, 0, tilt]}>
            {enemy.type === 'truck' && (
              <group>
                <mesh position={[0, 2.0, 0]} material={materials.container}><boxGeometry args={[2.6, 3.2, 7.5]} /></mesh>
                <mesh position={[0, 1.2, -4.2]} material={materials.truck}><boxGeometry args={[2.6, 2.2, 2.0]} /></mesh>
                <mesh position={[-1, 1.0, 3.8]} material={materials.tailLight}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                <mesh position={[1, 1.0, 3.8]} material={materials.tailLight}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
              </group>
            )}
            {enemy.type === 'bus' && (
              <group>
                <mesh position={[0, 2.0, 0]} material={materials.bus}><boxGeometry args={[2.7, 3.4, 10.0]} /></mesh>
                <mesh position={[-1, 1.0, 5.1]} material={materials.tailLight}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                <mesh position={[1, 1.0, 5.1]} material={materials.tailLight}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
              </group>
            )}
            {enemy.type === 'sedan' && (
              <group>
                <mesh position={[0, 0.7, 0]} material={materials.sedan}><boxGeometry args={[2.0, 0.8, 4.2]} /></mesh>
                <mesh position={[-0.8, 0.6, 2.2]} material={materials.tailLight}><boxGeometry args={[0.4, 0.2, 0.1]} /></mesh>
                <mesh position={[0.8, 0.6, 2.2]} material={materials.tailLight}><boxGeometry args={[0.4, 0.2, 0.1]} /></mesh>
              </group>
            )}
            {enemy.type === 'police' && (
              <group>
                <mesh position={[0, 0.7, 0]} material={materials.police}><boxGeometry args={[2.0, 0.8, 4.2]} /></mesh>
                <mesh position={[-0.8, 0.6, 2.2]} material={materials.tailLight}><boxGeometry args={[0.4, 0.2, 0.1]} /></mesh>
                <mesh position={[0.8, 0.6, 2.2]} material={materials.tailLight}><boxGeometry args={[0.4, 0.2, 0.1]} /></mesh>
                <mesh position={[0, 1.2, -0.5]} material={materials.policeLight}><boxGeometry args={[0.3, 0.2, 0.3]} /></mesh>
              </group>
            )}
            {enemy.type === 'ambulance' && (
              <group>
                <mesh position={[0, 1.5, 0]} material={materials.ambulance}><boxGeometry args={[2.2, 2.5, 5.0]} /></mesh>
                <mesh position={[-0.9, 1.0, 2.6]} material={materials.tailLight}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                <mesh position={[0.9, 1.0, 2.6]} material={materials.tailLight}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
                <mesh position={[0, 2.8, 0]} material={materials.ambulanceLight}><boxGeometry args={[0.4, 0.3, 0.4]} /></mesh>
              </group>
            )}
            {enemy.type === 'sport' && (
              <group>
                <mesh position={[0, 0.5, 0]} material={materials.sport}><boxGeometry args={[1.8, 0.6, 4.0]} /></mesh>
                <mesh position={[0, 0.9, 0.5]} material={new THREE.MeshStandardMaterial({color:'#111'})}><boxGeometry args={[1.4, 0.4, 1.5]} /></mesh>
                <mesh position={[-0.7, 0.5, 2.1]} material={materials.tailLight}><boxGeometry args={[0.3, 0.2, 0.1]} /></mesh>
                <mesh position={[0.7, 0.5, 2.1]} material={materials.tailLight}><boxGeometry args={[0.3, 0.2, 0.1]} /></mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

// --- ÇEVRE (YENİ YOL TİPLERİ İLE) ---
const Building = ({ width, height, side, type }) => {
  const isApartment = type === 'apartment';
  const buildingMat = new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.9 });
  const winLitMat = new THREE.MeshStandardMaterial({ color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 3 });
  
  const wins = useMemo(() => {
    if (!isApartment) return [];
    const w = [];
    const floors = Math.floor(height / 3);
    for (let i = 1; i < floors; i++) {
      if (Math.random() > 0.75) { // 0.6'dan 0.75'e çıkarıldı - daha az pencere (performans)
        // Her iki taraf için de görünür pencereler
        const offsetDirection = side > 0 ? -1 : 1; // Sol taraf için sağa, sağ taraf için sola
        w.push([0, i * 3, offsetDirection * (width / 2 + 0.1)]); 
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
        <mesh key={i} position={pos} material={winLitMat} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
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
  const objects = useMemo(() => new Array(15).fill(0).map((_, i) => { // 30'dan 15'e düşürüldü (performans)
    const rand = Math.random();
    let type = 'empty', height = 0, width = 0;
    if (rand > 0.8) { type = 'apartment'; height = 30 + Math.random() * 40; width = 12; }
    else if (rand > 0.5) { type = 'small_house'; height = 6; width = 8; } 
    else if (rand > 0.2) { type = 'tree'; } 
    return { z: -i * 50, type, height, width, offset: (Math.random() - 0.5) * 20 };
  }), []);

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

// --- YOL VE ZEMİN ---
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
        {[-2.25, 2.25].map((x) => Array.from({ length: 30 }).map((_, j) => (
          <mesh key={`${x}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -j * 20]}>
            <planeGeometry args={[0.25, 6]} /> 
            <meshBasicMaterial color="#fff" />
          </mesh>
        )))}
      </group>
      <Barrier x={-10.5} />
      <Barrier x={10.5} />
      <SideObjects side={1} />
      <SideObjects side={-1} />
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#2e5a2e" roughness={1.0} />
      </mesh>
    </group>
  );
}

// SpeedLines kaldırıldı - performans iyileştirmesi için

// --- KAMERA SHAKE ---
function CameraShake() {
  const { cameraShake, gameState } = useGameStore();
  const { camera } = useThree();
  
  const isMobile = window.innerWidth < 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isLandscape = window.innerWidth > window.innerHeight && isMobile;
  
  const getCameraPos = () => {
    if (!isMobile) return { x: 0, y: 6, z: 14 };
    if (isLandscape) return { x: 0, y: 3.5, z: 7 };
    return { x: 0, y: 4, z: 8 };
  };
  
  const originalPosition = useRef(getCameraPos());
  
  // Restart sonrası kamera pozisyonunu sıfırla - responsive
  useEffect(() => {
    if (gameState === 'playing') {
      const pos = getCameraPos();
      camera.position.set(pos.x, pos.y, pos.z);
      camera.rotation.set(0, 0, 0);
      originalPosition.current = pos;
    }
  }, [gameState, camera]);
  
  useFrame(() => {
    if (cameraShake > 0) {
      camera.position.x = originalPosition.current.x + (Math.random() - 0.5) * cameraShake * 0.5;
      camera.position.y = originalPosition.current.y + (Math.random() - 0.5) * cameraShake * 0.5;
    } else {
      // Shake yoksa orijinal pozisyona dön
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, originalPosition.current.x, 0.1);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, originalPosition.current.y, 0.1);
    }
  });
  
  return null;
}

// --- SCENE SETUP ---
function SceneSetup() {
  const { scene, gl } = useThree();
  
  useEffect(() => {
    // Force set background
    scene.background = new THREE.Color('#0a0a15');
    scene.fog = new THREE.Fog('#0a0a15', 50, 300);
    gl.setClearColor('#0a0a15', 1);
    
    // Tone mapping ayarları
    gl.toneMapping = THREE.NoToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [scene, gl]);
  
  // Test mesh - her zaman görünen
  return (
    <mesh position={[0, 2, -10]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ff0000" />
    </mesh>
  );
}

// --- GÖKYÜZÜ ---
function SkyEnvironment() {
  return (
    <group>
      <Stars radius={150} depth={50} count={3000} factor={4} saturation={0.2} fade speed={1} />
      <mesh position={[50, 80, -200]}>
        <sphereGeometry args={[10, 32, 32]} />
        <meshBasicMaterial color="#ffffdd" emissive="#ffffaa" emissiveIntensity={0.3} />
      </mesh>
      <pointLight position={[50, 80, -180]} intensity={0.3} color="#ffffdd" distance={300} decay={2} />
    </group>
  );
}

// --- LOADING SCENE ---
function LoadingScene() {
  return (
    <group>
      <ambientLight intensity={0.3} />
      <mesh position={[0, 0, -5]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshBasicMaterial color="#00ffff" />
      </mesh>
    </group>
  );
}

// --- ANA UYGULAMA ---
export default function App() {
  const { 
    speed, score, combo, message, gameOver, gameState, countdown, 
    startGame, quitGame, steer,
    totalDistance, nearMissCount, nitro, maxNitro, isNitroActive,
    selectedCar, selectCar, availableCars, upgrades, upgradeStat,
    useGyroscope, toggleGyroscope, activateNitro, deactivateNitro
  } = useGameStore();
  
  const [showGarage, setShowGarage] = useState(false);
  const [orientation, setOrientation] = useState(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
  
  // Orientation değişimini dinle
  useEffect(() => {
    const handleResize = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
  
  // Responsive helper
  const isMobile = window.innerWidth < 768;
  const isPortrait = orientation === 'portrait' && isMobile;
  const isLandscape = orientation === 'landscape' && isMobile;
  
  // Responsive değerler
  const getResponsiveValue = (desktop, mobileLandscape, mobilePortrait) => {
    if (!isMobile) return desktop;
    if (isLandscape) return mobileLandscape;
    return mobilePortrait;
  };
  
  // iOS Tam Ekran Meta Tags
  useEffect(() => {
    // Viewport meta tag
    let metaViewport = document.querySelector('meta[name=viewport]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.name = 'viewport';
      document.head.appendChild(metaViewport);
    }
    metaViewport.setAttribute('content', 
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
    
    // Apple mobile web app capable
    let metaApple = document.querySelector('meta[name=apple-mobile-web-app-capable]');
    if (!metaApple) {
      metaApple = document.createElement('meta');
      metaApple.name = 'apple-mobile-web-app-capable';
      metaApple.content = 'yes';
      document.head.appendChild(metaApple);
    }
    
    // Apple status bar style
    let metaStatus = document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]');
    if (!metaStatus) {
      metaStatus = document.createElement('meta');
      metaStatus.name = 'apple-mobile-web-app-status-bar-style';
      metaStatus.content = 'black-translucent';
      document.head.appendChild(metaStatus);
    }
    
    // Mobile web app capable
    let metaMobile = document.querySelector('meta[name=mobile-web-app-capable]');
    if (!metaMobile) {
      metaMobile = document.createElement('meta');
      metaMobile.name = 'mobile-web-app-capable';
      metaMobile.content = 'yes';
      document.head.appendChild(metaMobile);
    }
    
    // iOS scroll engelleme
    const preventScroll = (e) => {
      e.preventDefault();
      window.scrollTo(0, 0);
    };
    
    window.addEventListener('scroll', preventScroll, { passive: false });
    document.body.addEventListener('touchmove', preventScroll, { passive: false });
    
    return () => {
      window.removeEventListener('scroll', preventScroll);
      document.body.removeEventListener('touchmove', preventScroll);
    };
  }, []);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') steer(-1);
      if (e.key === 'ArrowRight') steer(1);
      if (e.key === ' ' && gameState === 'playing') activateNitro();
    };
    const handleKeyUp = (e) => { 
      if (e.key === ' ') deactivateNitro();
    };
    
    // Tüm input olaylarını engelle (tablet uyarıları için)
    const preventDefaults = (e) => {
      if (e.target.tagName !== 'BUTTON') {
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('contextmenu', preventDefaults);
    window.addEventListener('selectstart', preventDefaults);
    window.addEventListener('gesturestart', preventDefaults);
    window.addEventListener('gesturechange', preventDefaults);
    window.addEventListener('gestureend', preventDefaults);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('contextmenu', preventDefaults);
      window.removeEventListener('selectstart', preventDefaults);
      window.removeEventListener('gesturestart', preventDefaults);
      window.removeEventListener('gesturechange', preventDefaults);
      window.removeEventListener('gestureend', preventDefaults);
    };
  }, [gameState]);

  const isGoldMessage = message.includes("GOLD");
  const messageColor = isGoldMessage ? '#00ffff' : '#ff0000'; 
  const messageShadow = isGoldMessage ? '0 0 20px #00ffff' : '0 0 30px red';

  const scoreStyle = {
    color: '#00ffff',
    textShadow: '0 0 20px #00ffff',
    fontWeight: 'bold'
  };

  const handleStart = () => {
    const elem = document.documentElement;
    
    // iOS Safari için özel viewport ayarı
    const metaViewport = document.querySelector('meta[name=viewport]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, minimal-ui'
      );
    }
    
    // Fullscreen request
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log(err));
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.webkitEnterFullscreen) {
      // iOS için
      elem.webkitEnterFullscreen();
    }
    
    // iOS için scroll engelleme
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    
    startGame();
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh',
      height: '100dvh', // Dynamic viewport height for mobile
      background: '#0a0a15', 
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      touchAction: 'manipulation',
      position: 'fixed',
      top: 0,
      left: 0,
      margin: 0,
      padding: 0,
      zIndex: 0
    }}>
      
      {/* Background guard - beyaz ekranı kesinlikle engelle */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#0a0a15',
        zIndex: 0
      }} />
      
      <style>{`
        * {
          user-select: none !important;
          -webkit-user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        
        body, html {
          overscroll-behavior: none;
          touch-action: manipulation;
          overflow: hidden;
          position: fixed;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }
        
        /* iOS tam ekran ve home indicator gizleme */
        @supports (-webkit-touch-callout: none) {
          body {
            /* iOS için safe area padding */
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
            
            /* Home indicator gizleme */
            -webkit-overflow-scrolling: touch;
          }
        }
        
        /* Canvas tam ekran */
        canvas {
          display: block;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important; /* Dynamic viewport height for mobile */
          position: fixed;
          top: 0;
          left: 0;
        }
        
        input, textarea {
          display: none !important;
        }
        
        /* Tablet/mobil klavye engellemeleri */
        ::selection {
          background: transparent !important;
        }
        
        ::-moz-selection {
          background: transparent !important;
        }
      `}</style>
      
      <GyroscopeHandler />
      
      {gameState === 'playing' && <MobileControls />}

      {gameState === 'countdown' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <h1 style={{ 
            fontSize: isLandscape ? '60px' : (isPortrait ? '80px' : '150px'),
            color: '#00ff00', 
            textShadow: '0 0 30px #fff', 
            fontStyle: 'italic', 
            fontFamily: 'Arial', 
            userSelect: 'none' 
          }}>
            {countdown}
          </h1>
        </div>
      )}

      {gameState === 'menu' && (
        <div style={{ 
          position: 'absolute', 
          zIndex: 60, 
          inset: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'rgba(0,0,0,0.8)', 
          gap: isLandscape ? '10px' : (isPortrait ? '15px' : '20px'),
          userSelect: 'none', 
          WebkitUserSelect: 'none', 
          padding: '20px',
          overflowY: 'auto'
        }}>
          <h1 style={{ 
            fontSize: isLandscape ? '28px' : (isPortrait ? '36px' : '60px'),
            color: '#00ffff', 
            textShadow: '0 0 30px #00ffff', 
            marginBottom: isLandscape ? '5px' : (isPortrait ? '10px' : '20px'),
            userSelect: 'none', 
            textAlign: 'center' 
          }}>
            HIGHWAY RACER
          </h1>
          
          <button onClick={handleStart} style={{ 
            padding: isLandscape ? '10px 25px' : (isPortrait ? '15px 40px' : '20px 60px'),
            fontSize: isLandscape ? '16px' : (isPortrait ? '20px' : '30px'),
            background: '#00ff00', 
            color:'#000', 
            border: 'none', 
            borderRadius: '50px', 
            fontWeight: 'bold', 
            cursor: 'pointer', 
            boxShadow: '0 0 20px #00ff00', 
            userSelect: 'none', 
            WebkitUserSelect: 'none', 
            WebkitTouchCallout: 'none', 
            touchAction: 'manipulation' 
          }}>
            START RACE
          </button>
          
          <button onClick={() => setShowGarage(!showGarage)} style={{ 
            padding: isLandscape ? '8px 20px' : (isPortrait ? '12px 30px' : '15px 40px'),
            fontSize: isLandscape ? '14px' : (isPortrait ? '16px' : '20px'),
            background: '#ff00ff', 
            color:'#fff', 
            border: 'none', 
            borderRadius: '50px', 
            fontWeight: 'bold', 
            cursor: 'pointer', 
            boxShadow: '0 0 20px #ff00ff', 
            userSelect: 'none', 
            WebkitUserSelect: 'none', 
            WebkitTouchCallout: 'none', 
            touchAction: 'manipulation' 
          }}>
            {showGarage ? 'CLOSE GARAGE' : 'GARAGE & UPGRADES'}
          </button>
          
          <button onClick={toggleGyroscope} style={{ 
            padding: isLandscape ? '6px 15px' : (isPortrait ? '8px 20px' : '10px 30px'),
            fontSize: isLandscape ? '12px' : (isPortrait ? '14px' : '16px'),
            background: useGyroscope ? '#00ff00' : '#666', 
            color:'#fff', 
            border: 'none', 
            borderRadius: '20px', 
            fontWeight: 'bold', 
            cursor: 'pointer', 
            userSelect: 'none', 
            WebkitUserSelect: 'none', 
            WebkitTouchCallout: 'none', 
            touchAction: 'manipulation' 
          }}>
            GYROSCOPE: {useGyroscope ? 'ON' : 'OFF'}
          </button>
          
          {showGarage && (
            <div style={{ 
              background: 'rgba(0,0,0,0.9)', 
              padding: window.innerWidth < 768 ? '15px' : '30px', 
              borderRadius: '20px', 
              maxWidth: window.innerWidth < 768 ? '90%' : '800px',
              width: window.innerWidth < 768 ? '90%' : 'auto',
              maxHeight: window.innerWidth < 768 ? '70vh' : 'auto',
              overflowY: window.innerWidth < 768 ? 'auto' : 'visible',
              border: '2px solid #00ffff', 
              userSelect: 'none', 
              WebkitUserSelect: 'none' 
            }}>
              <h2 style={{ color: '#00ffff', marginBottom: window.innerWidth < 768 ? '10px' : '20px', userSelect: 'none', fontSize: window.innerWidth < 768 ? '18px' : '24px' }}>SELECT CAR</h2>
              <div style={{ display: 'flex', gap: window.innerWidth < 768 ? '10px' : '20px', marginBottom: window.innerWidth < 768 ? '15px' : '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {availableCars.map(car => (
                  <button 
                    key={car} 
                    onClick={() => selectCar(car)}
                    style={{ 
                      padding: window.innerWidth < 768 ? '10px 20px' : '15px 30px',
                      fontSize: window.innerWidth < 768 ? '14px' : '16px',
                      background: selectedCar === car ? '#00ffff' : '#333', 
                      color: selectedCar === car ? '#000' : '#fff',
                      border: '2px solid #00ffff',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                      touchAction: 'manipulation'
                    }}
                  >
                    {car}
                  </button>
                ))}
              </div>
              
              <h2 style={{ color: '#00ffff', marginBottom: window.innerWidth < 768 ? '10px' : '20px', userSelect: 'none', fontSize: window.innerWidth < 768 ? '18px' : '24px' }}>UPGRADES</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: window.innerWidth < 768 ? '10px' : '15px' }}>
                {['speed', 'control', 'durability'].map(stat => (
                  <div key={stat} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    background: 'rgba(255,255,255,0.1)', 
                    padding: window.innerWidth < 768 ? '10px' : '15px',
                    borderRadius: '10px', 
                    userSelect: 'none',
                    flexWrap: window.innerWidth < 768 ? 'wrap' : 'nowrap',
                    gap: window.innerWidth < 768 ? '10px' : '0'
                  }}>
                    <div>
                      <span style={{ color: '#fff', textTransform: 'uppercase', fontWeight: 'bold', userSelect: 'none', fontSize: window.innerWidth < 768 ? '14px' : '16px' }}>{stat}</span>
                      <span style={{ color: '#00ff00', marginLeft: '10px', userSelect: 'none', fontSize: window.innerWidth < 768 ? '12px' : '14px' }}>Level {upgrades[stat]}/5</span>
                    </div>
                    <button 
                      onClick={() => upgradeStat(stat)}
                      disabled={upgrades[stat] >= 5}
                      style={{ 
                        padding: window.innerWidth < 768 ? '8px 15px' : '10px 20px',
                        fontSize: window.innerWidth < 768 ? '12px' : '14px',
                        background: upgrades[stat] >= 5 ? '#666' : '#00ff00',
                        color: '#000',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: upgrades[stat] >= 5 ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                        touchAction: 'manipulation'
                      }}
                    >
                      {upgrades[stat] >= 5 ? 'MAX' : `UPGRADE (${upgrades[stat] * 1000})`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* HUD - SPEEDOMETER */}
      <div style={{ 
        position: 'absolute', 
        top: getResponsiveValue(20, 3, 3), 
        left: getResponsiveValue(20, 3, 3), 
        zIndex: 10, 
        pointerEvents: 'none' 
      }}>
        <div style={{ 
          transform: `scale(${getResponsiveValue(1, 0.25, 0.35)})`, 
          transformOrigin: 'top left' 
        }}>
          <Speedometer speed={speed} />
        </div>
      </div>
      
      {/* SCORE PANEL */}
      <div style={{ 
        position: 'fixed',
        top: getResponsiveValue(20, 3, 5), 
        right: getResponsiveValue(20, 3, 5), 
        background: 'linear-gradient(135deg, #333 0%, #000 100%)',
        border: '2px solid #555', 
        borderRadius: getResponsiveValue(10, 4, 5), 
        padding: isLandscape ? '2px 5px' : (isPortrait ? '3px 8px' : '10px 30px'),
        transform: 'skewX(-15deg)', 
        zIndex: 10, 
        color: '#fff', 
        textAlign: 'right', 
        boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
        fontSize: getResponsiveValue('1em', '0.5em', '0.6em')
      }}>
        <div style={{ fontSize: getResponsiveValue(12, 6, 8), ...scoreStyle, transform: 'skewX(15deg)' }}>SCORE</div>
        <div style={{ fontSize: getResponsiveValue(40, 14, 16), ...scoreStyle, transform: 'skewX(15deg)' }}>{Math.floor(score)}</div>
      </div>

      {/* DISTANCE PANEL */}
      {gameState === 'playing' && (
        <div style={{ 
          position: 'fixed',
          top: isLandscape ? 3 : (isPortrait ? 80 : 120),
          right: getResponsiveValue(20, 3, 5), 
          zIndex: 10
        }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)',
            border: '2px solid #00ffff', 
            borderRadius: getResponsiveValue(10, 3, 4), 
            padding: isLandscape ? '2px 5px' : (isPortrait ? '3px 8px' : '8px 20px'),
            transform: 'skewX(-15deg)',
            boxShadow: '0 5px 15px rgba(0,255,255,0.3)'
          }}>
            <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
              <div style={{ fontSize: getResponsiveValue(10, 5, 7), color: '#00ffff', fontWeight: 'bold' }}>DISTANCE</div>
              <div style={{ fontSize: getResponsiveValue(24, 10, 12), color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #00ffff' }}>{Math.floor(totalDistance)}m</div>
            </div>
          </div>
        </div>
      )}
      
      {/* NEAR MISS PANEL */}
      {gameState === 'playing' && (
        <div style={{ 
          position: 'fixed',
          top: isLandscape ? 25 : (isPortrait ? 130 : 190),
          right: getResponsiveValue(20, 3, 5), 
          zIndex: 10
        }}>
          <div style={{ 
            background: 'linear-gradient(135deg, #2e1a1a 0%, #1a0f0f 100%)',
            border: '2px solid #ff00ff', 
            borderRadius: getResponsiveValue(10, 3, 4), 
            padding: isLandscape ? '2px 5px' : (isPortrait ? '3px 8px' : '8px 20px'),
            transform: 'skewX(-15deg)',
            boxShadow: '0 5px 15px rgba(255,0,255,0.3)'
          }}>
            <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
              <div style={{ fontSize: getResponsiveValue(10, 5, 7), color: '#ff00ff', fontWeight: 'bold' }}>NEAR MISS</div>
              <div style={{ fontSize: getResponsiveValue(24, 10, 12), color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #ff00ff' }}>{nearMissCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* NITRO BAR - N2O */}
      {gameState === 'playing' && (
        <div style={{
          position: 'fixed',
          top: getResponsiveValue(20, 3, 5),
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          <div style={{
            width: isLandscape ? '100px' : (isPortrait ? '140px' : '300px'),
            height: isLandscape ? '24px' : (isPortrait ? '35px' : '70px'),
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
            border: `2px solid ${nitro >= 100 ? '#ff6600' : '#ff9933'}`,
            borderRadius: isLandscape ? '12px' : (isPortrait ? '18px' : '35px'),
            padding: isLandscape ? '1px' : (isPortrait ? '2px' : '5px'),
            boxShadow: nitro >= 100 
              ? '0 5px 30px rgba(255,102,0,0.9), 0 0 40px rgba(255,69,0,0.7)' 
              : '0 5px 20px rgba(255,153,51,0.6)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* N2O Text */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: isLandscape ? '10px' : (isPortrait ? '14px' : '30px'),
              fontWeight: 'bold',
              color: nitro >= 100 ? '#fff' : '#666',
              zIndex: 2,
              textShadow: nitro >= 100 ? '0 0 10px #fff, 0 0 20px #ff6600' : 'none',
              fontFamily: 'Impact, Arial Black, sans-serif',
              letterSpacing: '2px',
              userSelect: 'none',
              pointerEvents: 'none'
            }}>
              N2O
            </div>
            
            {/* Fill Bar */}
            <div style={{
              width: `${(nitro / maxNitro) * 100}%`,
              height: '100%',
              background: nitro >= 100
                ? 'linear-gradient(90deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)' 
                : isNitroActive 
                  ? 'linear-gradient(90deg, #ff9933 0%, #ffaa55 100%)'
                  : 'linear-gradient(90deg, #ff9933 0%, #ff7722 100%)',
              borderRadius: isLandscape ? '10px' : (isPortrait ? '15px' : '30px'),
              transition: 'width 0.1s ease-out, background 0.3s ease',
              boxShadow: nitro >= 100
                ? '0 0 30px rgba(255,102,0,1), inset 0 0 20px rgba(255,69,0,0.8)'
                : isNitroActive 
                  ? '0 0 20px rgba(255,153,51,0.8)' 
                  : '0 0 10px rgba(255,153,51,0.5)',
              animation: nitro >= 100 
                ? 'fireGlow 0.5s ease-in-out infinite' 
                : isNitroActive 
                  ? 'nitroFlash 0.3s ease-in-out infinite' 
                  : 'none',
              zIndex: 1
            }} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes nitroFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes fireGlow {
          0%, 100% { 
            filter: brightness(1.2);
            box-shadow: 0 0 30px rgba(255,102,0,1), inset 0 0 20px rgba(255,69,0,0.8);
          }
          50% { 
            filter: brightness(1.5);
            box-shadow: 0 0 50px rgba(255,69,0,1), inset 0 0 30px rgba(255,140,0,1);
          }
        }
      `}</style>

      {/* COMBO */}
      {combo > 1 && (
        <div style={{ 
          position: 'absolute', 
          top: isLandscape ? 3 : (isPortrait ? 48 : 25),
          left: isLandscape ? '55%' : 'auto',
          right: isLandscape ? 'auto' : getResponsiveValue(20, 60, 5),
          fontSize: isLandscape ? '12px' : (isPortrait ? '18px' : '32px'),
          color: '#00ff00', 
          fontWeight: 'bold', 
          zIndex: 10, 
          textShadow: '0 0 15px lime', 
          userSelect: 'none', 
          WebkitUserSelect: 'none', 
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.5)',
          padding: isLandscape ? '3px 6px' : (isPortrait ? '5px 10px' : '8px 15px'),
          borderRadius: getResponsiveValue(10, 5, 10),
          border: '2px solid #00ff00'
        }}>
          {combo}x COMBO
        </div>
      )}
      
      {message && (
        <div style={{ 
          position: 'absolute', 
          top: '30%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)', 
          color: messageColor, 
          fontSize: isLandscape ? 'clamp(14px, 4vw, 28px)' : (isPortrait ? 'clamp(16px, 5vw, 36px)' : 'clamp(30px, 8vw, 80px)'),
          fontWeight: 'bold', 
          fontStyle: 'italic', 
          zIndex: 15, 
          textShadow: messageShadow, 
          textTransform: 'uppercase', 
          letterSpacing: '2px', 
          whiteSpace: 'nowrap', 
          userSelect: 'none', 
          WebkitUserSelect: 'none', 
          pointerEvents: 'none' 
        }}>
          {message}
        </div>
      )}

      {gameOver && (
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'rgba(50,0,0,0.95)', 
          zIndex: 100, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'white', 
          fontFamily: 'Arial', 
          userSelect: 'none', 
          WebkitUserSelect: 'none', 
          padding: '20px' 
        }}>
          <h1 style={{ 
            fontSize: isLandscape ? 'clamp(24px, 6vw, 40px)' : (isPortrait ? 'clamp(30px, 8vw, 50px)' : 'clamp(40px, 10vw, 80px)'),
            color: '#ff0000', 
            margin: '0 0 20px 0', 
            textShadow: '0 0 30px red', 
            textTransform: 'uppercase', 
            textAlign: 'center', 
            userSelect: 'none' 
          }}>
            YOU CRASHED
          </h1>
          <h2 style={{ 
            color: '#fff', 
            fontSize: isLandscape ? '18px' : (isPortrait ? '20px' : '30px'),
            marginBottom: isLandscape ? '10px' : (isPortrait ? '15px' : '20px'),
            userSelect: 'none' 
          }}>
            FINAL SCORE: {Math.floor(score)}
          </h2>
          <div style={{ 
            color: '#00ffff', 
            fontSize: isLandscape ? '14px' : (isPortrait ? '16px' : '20px'),
            marginBottom: isLandscape ? '20px' : (isPortrait ? '30px' : '40px'),
            userSelect: 'none', 
            textAlign: 'center' 
          }}>
            <div>Distance: {Math.floor(totalDistance)}m</div>
            <div>Near Misses: {nearMissCount}</div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: isLandscape ? '10px' : (isPortrait ? '15px' : '20px'),
            flexWrap: 'wrap', 
            justifyContent: 'center' 
          }}>
            <button onClick={startGame} style={{ 
              padding: isLandscape ? '10px 20px' : (isPortrait ? '15px 30px' : '20px 40px'),
              fontSize: isLandscape ? '16px' : (isPortrait ? '18px' : '24px'),
              cursor: 'pointer', 
              background: '#fff', 
              color: '#000', 
              border: 'none', 
              borderRadius: '5px', 
              fontWeight: 'bold', 
              textTransform: 'uppercase', 
              boxShadow: '0 0 20px white', 
              userSelect: 'none', 
              WebkitUserSelect: 'none', 
              WebkitTouchCallout: 'none', 
              touchAction: 'manipulation' 
            }}>
              RESTART
            </button>
            <button onClick={quitGame} style={{ 
              padding: isLandscape ? '10px 20px' : (isPortrait ? '15px 30px' : '20px 40px'),
              fontSize: isLandscape ? '16px' : (isPortrait ? '18px' : '24px'),
              cursor: 'pointer', 
              background: '#333', 
              color: '#fff', 
              border: '1px solid #666', 
              borderRadius: '5px', 
              fontWeight: 'bold', 
              textTransform: 'uppercase', 
              userSelect: 'none', 
              WebkitUserSelect: 'none', 
              WebkitTouchCallout: 'none', 
              touchAction: 'manipulation' 
            }}>
              QUIT
            </button>
          </div>
        </div>
      )}

      <Canvas 
        shadows={{ type: THREE.PCFSoftShadowMap, shadowMapSize: [512, 512] }}
        dpr={[1, 1.5]} 
        gl={{ 
          antialias: false, 
          powerPreference: "high-performance",
          alpha: false,
          preserveDrawingBuffer: true
        }}
        frameloop="always"
        style={{ 
          background: '#0a0a15',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1
        }}
      >
        <PerspectiveCamera 
          makeDefault 
          position={
            isLandscape ? [0, 3.5, 7] : 
            (isPortrait ? [0, 4, 8] : [0, 6, 14])
          } 
          fov={
            isLandscape ? 70 : 
            (isPortrait ? 65 : 55)
          } 
        />
        <ambientLight intensity={0.2} color="#ffffff" /> 
        <hemisphereLight skyColor="#445566" groundColor="#223344" intensity={0.3} />
        <SceneSetup />
        <Suspense fallback={<LoadingScene />}>
          <SkyEnvironment />
          <CameraShake />
          <ParticleSystem />
          <PlayerCar />
          <Traffic />
          <Coins />
          <RoadEnvironment />
        </Suspense>
      </Canvas>
    </div>
  );
}
