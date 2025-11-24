import React, { useRef, useEffect, useState, Suspense, useMemo, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

// ==================== ERROR BOUNDARY ====================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Game Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          flexDirection: 'column',
          gap: '20px',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ff0000', fontSize: '36px' }}>⚠️ Oyun Hatası</h1>
          <p style={{ fontSize: '18px' }}>Bir hata oluştu. Lütfen sayfayı yenileyin.</p>
          <button 
            onClick={() => window.location.reload()}
            style={{ 
              padding: '15px 30px', 
              fontSize: '18px', 
              background: '#00ff00', 
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Yeniden Başlat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==================== SES SİSTEMİ ====================
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
    
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
}

const audioSystem = new AudioSystem();

// ==================== OYUN VERİ MERKEZİ ====================
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
  
  nitro: 100,
  maxNitro: 100,
  isNitroActive: false,
  nitroRegenRate: 5,
  
  selectedCar: 'default',
  availableCars: ['default', 'sport', 'muscle'],
  upgrades: {
    speed: 1,
    control: 1,
    durability: 1
  },
  
  useGyroscope: false,
  gyroPermission: false,
  
  roadSegments: [],
  currentRoadType: 'straight',
  roadTransition: 0,
  
  updateCounter: 0,
  
  // ✅ FIX: Timer cleanup için ref
  countdownTimer: null,
  
  startGame: () => {
    audioSystem.init();
    
    // ✅ FIX: Önceki timer'ı temizle
    const state = get();
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }
    
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
        set({ gameState: 'playing', countdown: null, speed: 110, targetSpeed: 110, countdownTimer: null });
      }
    }, 1000);
    
    set({ countdownTimer: timer });
  },

  quitGame: () => {
    const state = get();
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }
    
    set({ 
      gameState: 'menu', 
      gameOver: false, 
      score: 0, 
      speed: 0,
      targetSpeed: 110,
      currentX: 0,
      targetX: 0,
      cameraShake: 0,
      countdownTimer: null
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
    newX = Math.max(-5.0, Math.min(5.0, newX));
    return { targetX: newX };
  }),
  
  setGyroX: (x) => set((state) => {
    if (state.gameState !== 'playing' || !state.useGyroscope) return {};
    let newX = x * 5;
    newX = Math.max(-5.0, Math.min(5.0, newX));
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
    setTimeout(() => set({ message: "" }), 600);
  },

  triggerNearMiss: (position) => {
    const { combo, score, nearMissCount } = get();
    audioSystem.playNearMiss();
    
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
    
    setTimeout(() => set({ message: "" }), 600);
  },

  addExplosion: (x, y, z) => {
    const newParticles = [];
    for (let i = 0; i < 20; i++) {
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

    const newUpdateCounter = (state.updateCounter || 0) + 1;

    let newNitro = state.nitro;
    let newTargetSpeed = 110;
    
    if (state.isNitroActive && state.nitro > 0) {
      newNitro = Math.max(0, state.nitro - delta * 25);
      const speedBonus = state.upgrades.speed * 5;
      newTargetSpeed = 150 + speedBonus;
      
      if (newNitro <= 0) {
        set({ isNitroActive: false });
      }
    } else {
      newNitro = Math.min(state.maxNitro, state.nitro + delta * state.nitroRegenRate);
      newTargetSpeed = 110;
    }

    const newSpeed = THREE.MathUtils.lerp(state.speed, newTargetSpeed, delta * 2);
    const newScore = state.score + (newSpeed * delta * 0.2);
    const newDistance = state.totalDistance + (newSpeed * delta * 0.1);

    const newShake = Math.max(0, state.cameraShake - delta * 5);

    let newParticles = state.particles.map(p => ({
      ...p,
      x: p.x + p.vx * delta,
      y: p.y + p.vy * delta - 9.8 * delta,
      z: p.z + p.vz * delta,
      vy: p.vy - 9.8 * delta,
      life: p.life - delta * 3
    })).filter(p => p.life > 0);

    // ✅ FIX: Immutable enemy update
    let newEnemies = state.enemies;
    if (newUpdateCounter % 2 === 0) {
      newEnemies = state.enemies.map(e => {
        let updated = { ...e };
        
        if (!e.isChanging && Math.random() < 0.003) {
          const currentLane = e.lane;
          let possibleLanes = [];
          
          if (currentLane === -1) {
            possibleLanes = [0];
          } else if (currentLane === 0) {
            possibleLanes = [-1, 1];
          } else if (currentLane === 1) {
            possibleLanes = [0];
          }
          
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
            updated = {
              ...updated,
              isChanging: true,
              targetLane: newLane,
              changeProgress: 0
            };
          }
        }
        
        if (updated.isChanging) {
          const newProgress = updated.changeProgress + delta * 2;
          const startX = updated.lane * 4.5;
          const endX = updated.targetLane * 4.5;
          const newX = THREE.MathUtils.lerp(startX, endX, Math.min(newProgress, 1));
          
          if (newProgress >= 1) {
            updated = {
              ...updated,
              isChanging: false,
              lane: updated.targetLane,
              x: updated.targetLane * 4.5,
              changeProgress: 0,
              z: e.z + (newSpeed - e.ownSpeed * 0.5) * delta * 0.5
            };
          } else {
            updated = {
              ...updated,
              x: newX,
              changeProgress: newProgress,
              z: e.z + (newSpeed - e.ownSpeed * 0.5) * delta * 0.5
            };
          }
        } else {
          updated.z = e.z + (newSpeed - e.ownSpeed * 0.5) * delta * 0.5;
        }
        
        return updated;
      }).filter(e => e.z < 50);
    } else {
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

    if (Math.random() < 0.02 && newCoins.length < 3) {
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

// ==================== PARTIKÜL SİSTEMİ ====================
const ParticleSystem = memo(() => {
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
});

ParticleSystem.displayName = 'ParticleSystem';

// ==================== MOBİL KONTROLLER ====================
const MobileControls = memo(() => {
  const { steer, activateNitro, deactivateNitro } = useGameStore();
  const intervalRef = useRef(null);

  // ✅ FIX: Cleanup function
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startSteering = useCallback((direction) => {
    if (intervalRef.current) return;
    steer(direction);
    intervalRef.current = setInterval(() => {
      steer(direction);
    }, 50);
  }, [steer]);

  const stopSteering = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const preventAll = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, []);

  const handlers = useCallback((direction) => ({
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
  }), [startSteering, stopSteering, preventAll]);

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
      
      <div
        onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); activateNitro(); }}
        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); deactivateNitro(); }}
        onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onContextMenu={preventAll}
        onSelectStart={preventAll}
        onDragStart={preventAll}
        style={{
          position: 'fixed',
          bottom: window.innerWidth < 768 ? '15px' : '30px',
          right: window.innerWidth < 768 ? '15px' : '30px',
          width: window.innerWidth < 768 ? '55px' : '100px',
          height: window.innerWidth < 768 ? '55px' : '100px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)',
          border: window.innerWidth < 768 ? '3px solid #fff' : '5px solid #fff',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: window.innerWidth < 768 ? '10px' : '18px',
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
});

MobileControls.displayName = 'MobileControls';

// ==================== GYROSCOPE ====================
const GyroscopeHandler = memo(() => {
  const useGyroscope = useGameStore(state => state.useGyroscope);
  const gameState = useGameStore(state => state.gameState);
  const setGyroX = useGameStore(state => state.setGyroX);
  
  useEffect(() => {
    if (!useGyroscope || gameState !== 'playing') return;
    
    const handleOrientation = (event) => {
      if (event.gamma !== null) {
        const tilt = event.gamma / 45;
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
  }, [useGyroscope, gameState, setGyroX]);
  
  return null;
});

GyroscopeHandler.displayName = 'GyroscopeHandler';

// ==================== HIZ GÖSTERGESİ ====================
const Speedometer = memo(({ speed }) => {
  const maxSpeed = 200;
  const angle = -135 + (speed / maxSpeed) * 270;
  
  const marks = useMemo(() => {
    const result = [];
    for (let i = 0; i <= maxSpeed; i += 20) {
      const markAngle = -135 + (i / maxSpeed) * 270;
      const isMajor = i % 40 === 0;
      result.push(
        <div key={`line-${i}`} style={{ position: 'absolute', bottom: '50%', left: '50%', width: isMajor?'3px':'2px', height: '100px', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${markAngle}deg)` }}>
          <div style={{ width: '100%', height: isMajor?'15px':'10px', background: i>=140?'#ff3333':'#00ff00', position: 'absolute', top: 0 }}></div>
        </div>
      );
      if (isMajor) {
        const rad = (markAngle - 90) * (Math.PI / 180);
        result.push(<div key={`num-${i}`} style={{ position: 'absolute', top: `calc(50% + ${Math.sin(rad)*70}px)`, left: `calc(50% + ${Math.cos(rad)*70}px)`, transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 'bold', color: i>=140?'#ff3333':'#00ff00' }}>{i}</div>);
      }
    }
    return result;
  }, [maxSpeed]);
  
  return (
    <div style={{ position: 'relative', width: '200px', height: '200px', background: 'radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 70%)', borderRadius: '50%', border: '5px solid #2e2e4e', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Arial' }}>
      {marks}
      <div style={{ position: 'absolute', top: '65%', textAlign: 'center' }}><div style={{ fontSize: '32px', fontWeight: 'bold', textShadow: '0 0 10px #00ff00' }}>{Math.floor(speed)}</div><div style={{ fontSize: '12px', color: '#aaa' }}>km/h</div></div>
      <div style={{ position: 'absolute', bottom: '50%', left: '50%', width: '6px', height: '85px', background: 'linear-gradient(to top, #ff3333, #ff6666)', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${angle}deg)`, borderRadius: '50% 50% 0 0', zIndex: 2 }}></div>
      <div style={{ position: 'absolute', width: '20px', height: '20px', background: '#333', borderRadius: '50%', border: '3px solid #ff3333', zIndex: 3 }}></div>
    </div>
  );
});

Speedometer.displayName = 'Speedometer';

// ==================== OYUNCU ARABASI ====================
// ✅ FIX: Çarpışma boyutları araç geometrisiyle eşleştirildi
const VEHICLE_DIMENSIONS = {
  player: { width: 1.8, length: 4.2, height: 1.5 },
  truck: { width: 2.6, length: 7.5, height: 5.2 },
  bus: { width: 2.7, length: 10.0, height: 6.8 },
  sedan: { width: 2.0, length: 4.2, height: 1.5 },
  police: { width: 2.0, length: 4.2, height: 1.5 },
  ambulance: { width: 2.2, length: 5.0, height: 4.3 },
  sport: { width: 1.8, length: 4.0, height: 1.5 }
};

function PlayerCar() {
  const { targetX, enemies, coins, setGameOver, gameOver, triggerNearMiss, collectCoin, speed, selectedCar, upgrades, gameState } = useGameStore();
  const group = useRef();
  const wheels = useRef([]);
  const leftTarget = useRef();
  const rightTarget = useRef();

  if (!leftTarget.current) { leftTarget.current = new THREE.Object3D(); leftTarget.current.position.set(-0.5, -0.5, -100); }
  if (!rightTarget.current) { rightTarget.current = new THREE.Object3D(); rightTarget.current.position.set(0.5, -0.5, -100); }

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

    // ✅ FIX: Geliştirilmiş çarpışma algılama - boyutlar düzeltildi
    const durabilityBonus = upgrades.durability * 0.15;
    const playerWidth = VEHICLE_DIMENSIONS.player.width + durabilityBonus;
    const playerLength = VEHICLE_DIMENSIONS.player.length + durabilityBonus;

    // ✅ FIX: Immutable enemy marking for near miss
    const updatedEnemies = [];
    let hasCollision = false;
    
    enemies.forEach(enemy => {
      const dx = Math.abs(group.current.position.x - enemy.x);
      const dz = Math.abs(enemy.z - (-2));
      
      const enemyDim = VEHICLE_DIMENSIONS[enemy.type] || VEHICLE_DIMENSIONS.sedan;
      const crashWidthThreshold = (playerWidth + enemyDim.width) / 2 - 0.2;
      const crashDepthThreshold = (playerLength + enemyDim.length) / 2;
      
      if (dz < crashDepthThreshold && dx < crashWidthThreshold) {
        hasCollision = true;
      }
      
      const nearMissWidthThreshold = crashWidthThreshold + 1.5;
      const nearMissDepthThreshold = crashDepthThreshold + 2.0;
      
      if (!enemy.passed && dz < nearMissDepthThreshold && dz > 1.5 && dx >= crashWidthThreshold && dx < nearMissWidthThreshold) {
        updatedEnemies.push({ ...enemy, passed: true });
        triggerNearMiss({ x: enemy.x, y: 1, z: enemy.z });
      } else {
        updatedEnemies.push(enemy);
      }
    });

    if (hasCollision) {
      setGameOver();
    }

    coins.forEach(coin => {
      const dx = Math.abs(group.current.position.x - coin.x);
      const dz = Math.abs(coin.z - (-2));
      if (dz < 2.5 && dx < 2.0) collectCoin(coin.id);
    });
  });

  const carColors = useMemo(() => ({
    default: '#aaaaaa',
    sport: '#ff0000',
    muscle: '#000000'
  }), []);

  // ✅ FIX: Materials with useMemo and proper disposal
  const materials = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: carColors[selectedCar] || '#aaaaaa', metalness: 0.9, roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1 }),
    neon: new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 2 }),
    tailLight: new THREE.MeshBasicMaterial({color: 'red'}),
    wheel: new THREE.MeshStandardMaterial({color:'#111', roughness:0.8})
  }), [selectedCar, carColors]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

  return (
    <group ref={group} position={[0, 0.1, -2]}>
      <primitive object={leftTarget.current} />
      <primitive object={rightTarget.current} />
      <spotLight position={[0.8, 0.6, -1.5]} target={rightTarget.current} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} />
      <spotLight position={[-0.8, 0.6, -1.5]} target={leftTarget.current} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} />
      
      <mesh position={[0, 0.4, 0]} material={materials.body}><boxGeometry args={[1.8, 0.5, 4.2]} /></mesh>
      <mesh position={[-0.95, 0.3, 1.2]} material={materials.body}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[0.95, 0.3, 1.2]} material={materials.body}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[-0.95, 0.3, -1.2]} material={materials.body}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[0.95, 0.3, -1.2]} material={materials.body}><boxGeometry args={[0.4, 0.4, 1.2]} /></mesh>
      <mesh position={[0, 0.8, -0.3]} material={materials.glass}><boxGeometry args={[1.4, 0.5, 2.0]} /></mesh>
      <mesh position={[0, 0.9, 1.9]} material={materials.body}><boxGeometry args={[1.8, 0.1, 0.4]} /></mesh>
      <mesh position={[-0.7, 0.6, 1.9]} material={materials.body}><boxGeometry args={[0.1, 0.4, 0.2]} /></mesh>
      <mesh position={[0.7, 0.6, 1.9]} material={materials.body}><boxGeometry args={[0.1, 0.4, 0.2]} /></mesh>
      <mesh position={[0, 0.2, 0]} material={materials.neon}><boxGeometry args={[1.7, 0.05, 4.1]} /></mesh>
      <mesh position={[-0.6, 0.5, 2.11]} material={materials.tailLight}><boxGeometry args={[0.4, 0.15, 0.1]} /></mesh>
      <mesh position={[0.6, 0.5, 2.11]} material={materials.tailLight}><boxGeometry args={[0.4, 0.15, 0.1]} /></mesh>

      {[[-1.0, -1.2], [1.0, -1.2], [-1.0, 1.4], [1.0, 1.4]].map((pos, i) => (
        <mesh key={i} ref={el => wheels.current[i] = el} position={[pos[0], 0.35, pos[1]]} rotation={[0, 0, Math.PI/2]} material={materials.wheel}>
          <cylinderGeometry args={[0.4, 0.4, 0.4, 24]} />
        </mesh>
      ))}
    </group>
  );
}

// ==================== ALTINLAR ====================
const SingleCoin = memo(({ x, z }) => {
  const group = useRef();
  const material = useMemo(() => 
    new THREE.MeshStandardMaterial({ 
      color: "#FFD700", 
      metalness: 0.8, 
      roughness: 0.2, 
      emissive: "#FFD700", 
      emissiveIntensity: 0.4 
    }), []
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((state, delta) => {
    if(group.current) group.current.rotation.y += delta * 3; 
  });

  return (
    <group ref={group} position={[x, 1, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.1, 32]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
});

SingleCoin.displayName = 'SingleCoin';

const Coins = memo(() => {
  const coins = useGameStore(state => state.coins);
  return (
    <>
      {coins.map(coin => <SingleCoin key={coin.id} x={coin.x} z={coin.z} />)}
    </>
  );
});

Coins.displayName = 'Coins';

// ==================== TRAFİK ====================
const Traffic = memo(() => {
  const enemies = useGameStore(state => state.enemies);
  
  // ✅ FIX: Materials properly memoized and disposed
  const materials = useMemo(() => ({
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
  }), []);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

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
                <mesh position={[0, 0.9, 0.5]} material={materials.sedan}><boxGeometry args={[1.4, 0.4, 1.5]} /></mesh>
                <mesh position={[-0.7, 0.5, 2.1]} material={materials.tailLight}><boxGeometry args={[0.3, 0.2, 0.1]} /></mesh>
                <mesh position={[0.7, 0.5, 2.1]} material={materials.tailLight}><boxGeometry args={[0.3, 0.2, 0.1]} /></mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
});

Traffic.displayName = 'Traffic';

// ==================== ÇEVRE ====================
const Building = memo(({ width, height, side, type }) => {
  const isApartment = type === 'apartment';
  
  const materials = useMemo(() => ({
    building: new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.9 }),
    window: new THREE.MeshStandardMaterial({ color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 3 }),
    roof: new THREE.MeshStandardMaterial({ color: '#444' })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);
  
  const wins = useMemo(() => {
    if (!isApartment) return [];
    const w = [];
    const floors = Math.floor(height / 3);
    for (let i = 1; i < floors; i++) {
      if (Math.random() > 0.75) {
        const offsetDirection = side > 0 ? -1 : 1;
        w.push([0, i * 3, offsetDirection * (width / 2 + 0.1)]); 
      }
    }
    return w;
  }, [height, isApartment, side, width]);

  return (
    <group>
      <mesh position={[0, height / 2, 0]} material={materials.building}>
        <boxGeometry args={[width, height, width]} />
      </mesh>
      {wins.map((pos, i) => (
        <mesh key={i} position={pos} material={materials.window} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <planeGeometry args={[width * 0.6, 1.5]} />
        </mesh>
      ))}
      {type === 'small_house' && (
        <mesh position={[0, height + 1, 0]} rotation={[0, Math.PI/4, 0]}>
          <coneGeometry args={[width*0.8, 3, 4]} />
          <primitive object={materials.roof} attach="material" />
        </mesh>
      )}
    </group>
  );
});

Building.displayName = 'Building';

const SideObjects = memo(({ side }) => {
  const { speed } = useGameStore();
  const objects = useMemo(() => new Array(15).fill(0).map((_, i) => {
    const rand = Math.random();
    let type = 'empty', height = 0, width = 0;
    if (rand > 0.8) { type = 'apartment'; height = 30 + Math.random() * 40; width = 12; }
    else if (rand > 0.5) { type = 'small_house'; height = 6; width = 8; } 
    else if (rand > 0.2) { type = 'tree'; } 
    return { z: -i * 50, type, height, width, offset: (Math.random() - 0.5) * 20 };
  }), []);

  const groupRef = useRef();
  const itemsRef = useRef(objects);

  const treeMaterials = useMemo(() => ({
    leaves: new THREE.MeshStandardMaterial({ color: '#224422', roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#443322', roughness: 1 })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(treeMaterials).forEach(mat => mat.dispose());
    };
  }, [treeMaterials]);

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

  return (
    <group ref={groupRef}>
      {objects.map((obj, i) => (
        <group key={i} position={[side * (45 + obj.offset), 0, obj.z]}>
          {(obj.type === 'apartment' || obj.type === 'small_house') && <Building width={obj.width} height={obj.height} side={side} type={obj.type} />}
          <group visible={obj.type === 'tree'}>
            <mesh position={[0, 2, 0]} material={treeMaterials.trunk}><cylinderGeometry args={[0.8, 1.2, 4]} /></mesh>
            <mesh position={[0, 8, 0]} material={treeMaterials.leaves}><coneGeometry args={[4, 10, 8]} /></mesh>
          </group>
        </group>
      ))}
    </group>
  );
});

SideObjects.displayName = 'SideObjects';

// ==================== YOL VE ZEMİN ====================
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

  const Barrier = memo(({ x }) => {
    const barrierMaterials = useMemo(() => ({
      post: new THREE.MeshStandardMaterial({color: '#999'}),
      rail: new THREE.MeshStandardMaterial({color: '#B0C4DE', metalness: 0.6, roughness: 0.4})
    }), []);

    useEffect(() => {
      return () => {
        Object.values(barrierMaterials).forEach(mat => mat.dispose());
      };
    }, [barrierMaterials]);

    return (
      <group position={[x, 0, 0]}>
        {Array.from({length: 40}).map((_, i) => (
          <mesh key={i} position={[0, 0.5, -i * 10]} material={barrierMaterials.post}>
            <boxGeometry args={[0.2, 1.0, 0.2]} />
          </mesh>
        ))}
        <mesh position={[0, 0.8, -200]} material={barrierMaterials.rail}>
          <boxGeometry args={[0.3, 0.4, 1000]} />
        </mesh>
      </group>
    );
  });

  Barrier.displayName = 'Barrier';

  const roadMaterials = useMemo(() => ({
    road: new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.8 }),
    stripe: new THREE.MeshBasicMaterial({ color: "#fff" }),
    ground: new THREE.MeshStandardMaterial({ color: "#2e5a2e", roughness: 1.0 })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(roadMaterials).forEach(mat => mat.dispose());
    };
  }, [roadMaterials]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 1000]} /> 
        <primitive object={roadMaterials.road} attach="material" />
      </mesh>
      <group ref={stripesRef}>
        {[-2.25, 2.25].map((x) => Array.from({ length: 30 }).map((_, j) => (
          <mesh key={`${x}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -j * 20]}>
            <planeGeometry args={[0.25, 6]} /> 
            <primitive object={roadMaterials.stripe} attach="material" />
          </mesh>
        )))}
      </group>
      <Barrier x={-10.5} />
      <Barrier x={10.5} />
      <SideObjects side={1} />
      <SideObjects side={-1} />
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <primitive object={roadMaterials.ground} attach="material" />
      </mesh>
    </group>
  );
}

// ==================== KAMERA SHAKE ====================
const CameraShake = memo(() => {
  const { cameraShake, gameState } = useGameStore();
  const { camera } = useThree();
  const isMobile = window.innerWidth < 768;
  const originalPosition = useRef({ 
    x: 0, 
    y: isMobile ? 4 : 6, 
    z: isMobile ? 8 : 14 
  });
  
  useEffect(() => {
    if (gameState === 'playing') {
      const posY = window.innerWidth < 768 ? 4 : 6;
      const posZ = window.innerWidth < 768 ? 8 : 14;
      camera.position.set(0, posY, posZ);
      camera.rotation.set(0, 0, 0);
      originalPosition.current = { x: 0, y: posY, z: posZ };
    }
  }, [gameState, camera]);
  
  useFrame(() => {
    if (cameraShake > 0) {
      camera.position.x = originalPosition.current.x + (Math.random() - 0.5) * cameraShake * 0.5;
      camera.position.y = originalPosition.current.y + (Math.random() - 0.5) * cameraShake * 0.5;
    } else {
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, originalPosition.current.x, 0.1);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, originalPosition.current.y, 0.1);
    }
  });
  
  return null;
});

CameraShake.displayName = 'CameraShake';

// ==================== GÖKYÜZÜ ====================
const SkyEnvironment = memo(() => {
  const moonMaterial = useMemo(() => 
    new THREE.MeshBasicMaterial({ color: "#ffffff" }), []
  );

  useEffect(() => {
    return () => {
      moonMaterial.dispose();
    };
  }, [moonMaterial]);

  return (
    <group>
      <Stars radius={150} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <mesh position={[50, 80, -200]}>
        <sphereGeometry args={[10, 32, 32]} />
        <primitive object={moonMaterial} attach="material" />
      </mesh>
      <pointLight position={[50, 80, -180]} intensity={1.5} color="#aabbff" distance={500} />
    </group>
  );
});

SkyEnvironment.displayName = 'SkyEnvironment';

// ==================== ANA UYGULAMA ====================
function Game() {
  const { 
    speed, score, combo, message, gameOver, gameState, countdown, 
    startGame, quitGame, steer,
    totalDistance, nearMissCount, nitro, maxNitro, isNitroActive,
    selectedCar, selectCar, availableCars, upgrades, upgradeStat,
    useGyroscope, toggleGyroscope, activateNitro, deactivateNitro
  } = useGameStore();
  
  const [showGarage, setShowGarage] = useState(false);
  
  // ✅ FIX: iOS Tam Ekran Meta Tags - Cleanup added
  useEffect(() => {
    let metaViewport = document.querySelector('meta[name=viewport]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.name = 'viewport';
      document.head.appendChild(metaViewport);
    }
    const originalContent = metaViewport.getAttribute('content');
    metaViewport.setAttribute('content', 
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
    
    let metaApple = document.querySelector('meta[name=apple-mobile-web-app-capable]');
    if (!metaApple) {
      metaApple = document.createElement('meta');
      metaApple.name = 'apple-mobile-web-app-capable';
      metaApple.content = 'yes';
      document.head.appendChild(metaApple);
    }
    
    let metaStatus = document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]');
    if (!metaStatus) {
      metaStatus = document.createElement('meta');
      metaStatus.name = 'apple-mobile-web-app-status-bar-style';
      metaStatus.content = 'black-translucent';
      document.head.appendChild(metaStatus);
    }
    
    let metaMobile = document.querySelector('meta[name=mobile-web-app-capable]');
    if (!metaMobile) {
      metaMobile = document.createElement('meta');
      metaMobile.name = 'mobile-web-app-capable';
      metaMobile.content = 'yes';
      document.head.appendChild(metaMobile);
    }
    
    const preventScroll = (e) => {
      e.preventDefault();
      window.scrollTo(0, 0);
    };
    
    window.addEventListener('scroll', preventScroll, { passive: false });
    document.body.addEventListener('touchmove', preventScroll, { passive: false });
    
    return () => {
      if (originalContent) {
        metaViewport.setAttribute('content', originalContent);
      }
      window.removeEventListener('scroll', preventScroll);
      document.body.removeEventListener('touchmove', preventScroll);
    };
  }, []);
  
  // ✅ FIX: Keyboard controls cleanup
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') steer(-1);
      if (e.key === 'ArrowRight') steer(1);
      if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault();
        activateNitro();
      }
    };
    
    const handleKeyUp = (e) => { 
      if (e.key === ' ') {
        e.preventDefault();
        deactivateNitro();
      }
    };
    
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
  }, [gameState, steer, activateNitro, deactivateNitro]);

  const isGoldMessage = message.includes("GOLD");
  const messageColor = isGoldMessage ? '#00ffff' : '#ff0000'; 
  const messageShadow = isGoldMessage ? '0 0 20px #00ffff' : '0 0 30px red';

  const scoreStyle = useMemo(() => ({
    color: '#00ffff',
    textShadow: '0 0 20px #00ffff',
    fontWeight: 'bold'
  }), []);

  // ✅ FIX: Fullscreen API düzeltildi
  const handleStart = useCallback(() => {
    const elem = document.documentElement;
    
    const metaViewport = document.querySelector('meta[name=viewport]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }
    
    // ✅ FIX: Proper fullscreen request
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
    
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    
    startGame();
  }, [startGame]);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh',
      height: '100dvh',
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
      padding: 0
    }}>
      
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
        
        @supports (-webkit-touch-callout: none) {
          body {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
            -webkit-overflow-scrolling: touch;
          }
        }
        
        canvas {
          display: block;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          position: fixed;
          top: 0;
          left: 0;
        }
        
        input, textarea {
          display: none !important;
        }
        
        ::selection {
          background: transparent !important;
        }
        
        ::-moz-selection {
          background: transparent !important;
        }

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
      
      <GyroscopeHandler />
      
      {gameState === 'playing' && <MobileControls />}

      {gameState === 'countdown' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <h1 style={{ fontSize: window.innerWidth < 768 ? '80px' : '150px', color: '#00ff00', textShadow: '0 0 30px #fff', fontStyle: 'italic', fontFamily: 'Arial', userSelect: 'none' }}>{countdown}</h1>
        </div>
      )}

      {gameState === 'menu' && (
        <div style={{ position: 'absolute', zIndex: 60, inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', gap: window.innerWidth < 768 ? '15px' : '20px', userSelect: 'none', WebkitUserSelect: 'none', padding: '20px' }}>
          <h1 style={{ fontSize: window.innerWidth < 768 ? '36px' : '60px', color: '#00ffff', textShadow: '0 0 30px #00ffff', marginBottom: window.innerWidth < 768 ? '10px' : '20px', userSelect: 'none', textAlign: 'center' }}>HIGHWAY RACER</h1>
          
          <button onClick={handleStart} style={{ padding: window.innerWidth < 768 ? '15px 40px' : '20px 60px', fontSize: window.innerWidth < 768 ? '20px' : '30px', background: '#00ff00', color:'#000', border: 'none', borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px #00ff00', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>
            START RACE
          </button>
          
          <button onClick={() => setShowGarage(!showGarage)} style={{ padding: window.innerWidth < 768 ? '12px 30px' : '15px 40px', fontSize: window.innerWidth < 768 ? '16px' : '20px', background: '#ff00ff', color:'#fff', border: 'none', borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px #ff00ff', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>
            {showGarage ? 'CLOSE GARAGE' : 'GARAGE & UPGRADES'}
          </button>
          
          <button onClick={toggleGyroscope} style={{ padding: window.innerWidth < 768 ? '8px 20px' : '10px 30px', fontSize: window.innerWidth < 768 ? '14px' : '16px', background: useGyroscope ? '#00ff00' : '#666', color:'#fff', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>
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

      {/* HUD */}
      <div style={{ position: 'absolute', top: window.innerWidth < 768 ? 3 : 20, left: window.innerWidth < 768 ? 3 : 20, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ transform: window.innerWidth < 768 ? 'scale(0.35)' : 'scale(1)', transformOrigin: 'top left' }}>
          <Speedometer speed={speed} />
        </div>
      </div>
      
      <div style={{ 
        position: 'fixed',
        top: window.innerWidth < 768 ? 5 : 20, 
        right: window.innerWidth < 768 ? 5 : 20, 
        background: 'linear-gradient(135deg, #333 0%, #000 100%)',
        border: '2px solid #555', 
        borderRadius: window.innerWidth < 768 ? '5px' : '10px', 
        padding: window.innerWidth < 768 ? '3px 8px' : '10px 30px',
        transform: 'skewX(-15deg)', 
        zIndex: 10, 
        color: '#fff', 
        textAlign: 'right', 
        boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
        fontSize: window.innerWidth < 768 ? '0.6em' : '1em'
      }}>
        <div style={{ fontSize: window.innerWidth < 768 ? '8px' : '12px', ...scoreStyle, transform: 'skewX(15deg)' }}>SCORE</div>
        <div style={{ fontSize: window.innerWidth < 768 ? '16px' : '40px', ...scoreStyle, transform: 'skewX(15deg)' }}>{Math.floor(score)}</div>
      </div>

      {gameState === 'playing' && (
        <>
          <div style={{ 
            position: 'fixed',
            top: window.innerWidth < 768 ? 35 : 120, 
            right: window.innerWidth < 768 ? 5 : 20, 
            zIndex: 10
          }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)',
              border: '2px solid #00ffff', 
              borderRadius: window.innerWidth < 768 ? '4px' : '10px', 
              padding: window.innerWidth < 768 ? '3px 8px' : '8px 20px',
              transform: 'skewX(-15deg)',
              boxShadow: '0 5px 15px rgba(0,255,255,0.3)'
            }}>
              <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
                <div style={{ fontSize: window.innerWidth < 768 ? '7px' : '10px', color: '#00ffff', fontWeight: 'bold' }}>DISTANCE</div>
                <div style={{ fontSize: window.innerWidth < 768 ? '12px' : '24px', color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #00ffff' }}>{Math.floor(totalDistance)}m</div>
              </div>
            </div>
          </div>
          
          <div style={{ 
            position: 'fixed',
            top: window.innerWidth < 768 ? 62 : 190, 
            right: window.innerWidth < 768 ? 5 : 20, 
            zIndex: 10
          }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #2e1a1a 0%, #1a0f0f 100%)',
              border: '2px solid #ff00ff', 
              borderRadius: window.innerWidth < 768 ? '4px' : '10px', 
              padding: window.innerWidth < 768 ? '3px 8px' : '8px 20px',
              transform: 'skewX(-15deg)',
              boxShadow: '0 5px 15px rgba(255,0,255,0.3)'
            }}>
              <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
                <div style={{ fontSize: window.innerWidth < 768 ? '7px' : '10px', color: '#ff00ff', fontWeight: 'bold' }}>NEAR MISS</div>
                <div style={{ fontSize: window.innerWidth < 768 ? '12px' : '24px', color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #ff00ff' }}>{nearMissCount}</div>
              </div>
            </div>
          </div>

          <div style={{
            position: 'fixed',
            top: window.innerWidth < 768 ? 5 : 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <div style={{
              width: window.innerWidth < 768 ? '140px' : '300px',
              height: window.innerWidth < 768 ? '35px' : '70px',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
              border: nitro >= 100 ? '2px solid #ff6600' : '2px solid #ff9933',
              borderRadius: window.innerWidth < 768 ? '18px' : '35px',
              padding: window.innerWidth < 768 ? '2px' : '5px',
              boxShadow: nitro >= 100 
                ? '0 5px 30px rgba(255,102,0,0.9), 0 0 40px rgba(255,69,0,0.7)' 
                : '0 5px 20px rgba(255,153,51,0.6)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: window.innerWidth < 768 ? '14px' : '30px',
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
              
              <div style={{
                width: `${(nitro / maxNitro) * 100}%`,
                height: '100%',
                background: nitro >= 100
                  ? 'linear-gradient(90deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)' 
                  : isNitroActive 
                    ? 'linear-gradient(90deg, #ff9933 0%, #ffaa55 100%)'
                    : 'linear-gradient(90deg, #ff9933 0%, #ff7722 100%)',
                borderRadius: window.innerWidth < 768 ? '15px' : '30px',
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
        </>
      )}

      {combo > 1 && (
        <div style={{ 
          position: 'absolute', 
          top: window.innerWidth < 768 ? 15 : 25, 
          right: window.innerWidth < 768 ? 10 : 20, 
          fontSize: window.innerWidth < 768 ? '18px' : '32px', 
          color: '#00ff00', 
          fontWeight: 'bold', 
          zIndex: 10, 
          textShadow: '0 0 15px lime', 
          userSelect: 'none', 
          WebkitUserSelect: 'none', 
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.5)',
          padding: window.innerWidth < 768 ? '5px 10px' : '8px 15px',
          borderRadius: '10px',
          border: '2px solid #00ff00'
        }}>
          {combo}x COMBO
        </div>
      )}
      
      {message && <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', color: messageColor, fontSize: window.innerWidth < 768 ? 'clamp(16px, 5vw, 36px)' : 'clamp(30px, 8vw, 80px)', fontWeight: 'bold', fontStyle: 'italic', zIndex: 15, textShadow: messageShadow, textTransform: 'uppercase', letterSpacing: '2px', whiteSpace: 'nowrap', userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'none' }}>{message}</div>}

      {gameOver && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(50,0,0,0.95)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'Arial', userSelect: 'none', WebkitUserSelect: 'none', padding: '20px' }}>
          <h1 style={{ fontSize: window.innerWidth < 768 ? 'clamp(30px, 8vw, 50px)' : 'clamp(40px, 10vw, 80px)', color: '#ff0000', margin: '0 0 20px 0', textShadow: '0 0 30px red', textTransform: 'uppercase', textAlign: 'center', userSelect: 'none' }}>YOU CRASHED</h1>
          <h2 style={{ color: '#fff', fontSize: window.innerWidth < 768 ? '20px' : '30px', marginBottom: window.innerWidth < 768 ? '15px' : '20px', userSelect: 'none' }}>FINAL SCORE: {Math.floor(score)}</h2>
          <div style={{ color: '#00ffff', fontSize: window.innerWidth < 768 ? '16px' : '20px', marginBottom: window.innerWidth < 768 ? '30px' : '40px', userSelect: 'none', textAlign: 'center' }}>
            <div>Distance: {Math.floor(totalDistance)}m</div>
            <div>Near Misses: {nearMissCount}</div>
          </div>
          
          <div style={{ display: 'flex', gap: window.innerWidth < 768 ? '15px' : '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={startGame} style={{ padding: window.innerWidth < 768 ? '15px 30px' : '20px 40px', fontSize: window.innerWidth < 768 ? '18px' : '24px', cursor: 'pointer', background: '#fff', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', boxShadow: '0 0 20px white', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>RESTART</button>
            <button onClick={quitGame} style={{ padding: window.innerWidth < 768 ? '15px 30px' : '20px 40px', fontSize: window.innerWidth < 768 ? '18px' : '24px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #666', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>QUIT</button>
          </div>
        </div>
      )}

      <Canvas 
        shadows={{ type: THREE.PCFSoftShadowMap, shadowMapSize: [512, 512] }}
        dpr={[1, 1.5]} 
        gl={{ antialias: false, powerPreference: "high-performance" }}
        frameloop="always"
      >
        <PerspectiveCamera 
          makeDefault 
          position={window.innerWidth < 768 ? [0, 4, 8] : [0, 6, 14]} 
          fov={window.innerWidth < 768 ? 65 : 55} 
        />
        <ambientLight intensity={0.6} color="#ffffff" /> 
        <hemisphereLight skyColor="#445566" groundColor="#223344" intensity={0.6} />
        <Suspense fallback={null}>
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

export default function App() {
  return (
    <ErrorBoundary>
      <Game />
    </ErrorBoundary>
  );
}
