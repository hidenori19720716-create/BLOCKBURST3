import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Html, Edges } from '@react-three/drei';
import { Trophy, Zap, RotateCcw, Play } from 'lucide-react';
import { useGameStore, GRID_SIZE, Point3D } from './store/gameStore';
import { ShapeDefinition } from './lib/shapes';

import * as THREE from 'three';
import { loginAnonymously, getLeaderboard, submitScore, LeaderboardEntry } from './lib/firebase';

export const envState = { weather: 'clear', wetness: 0 };

let globalAudioCtx: AudioContext | null = null;

export const playRainSound = (intensity: number) => {
    // Sound disabled per user request
};

const ShootingStars = () => {
    const groupRef = useRef<THREE.Group>(null);
    const starRefs = useRef<{ mesh: THREE.Mesh, delay: number, life: number, speed: number, dx: number, dy: number, dz: number }[]>([]);
    
    useFrame(({ clock }, delta) => {
        if (envState.weather !== 'clear') return; // Only show on clear nights
        
        // Let's assume day/night cycle based on sun position in DynamicEnvironment. 
        // We'll just rely on the fact that if it's clear, they might appear.
        if (starRefs.current.length < 1 && Math.random() < 0.0005) {
            const startX = (Math.random() - 0.5) * 80;
            const startY = 20 + Math.random() * 30;
            const startZ = (Math.random() - 0.5) * 80;
            
            const geo = new THREE.CylinderGeometry(0, 0.1, 4, 3);
            geo.rotateX(-Math.PI / 2); // point along Z
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            
            mesh.position.set(startX, startY, startZ);
            
            // direction
            const dx = (Math.random() - 0.5) * 2;
            const dy = -1 - Math.random() * 2;
            const dz = (Math.random() - 0.5) * 2;
            
            mesh.lookAt(startX + dx, startY + dy, startZ + dz);
            
            if (groupRef.current) {
                groupRef.current.add(mesh);
            }
            
            starRefs.current.push({
                mesh,
                delay: 0,
                life: 1.0,
                speed: 15 + Math.random() * 20,
                dx, dy, dz
            });
        }
        
        for (let i = starRefs.current.length - 1; i >= 0; i--) {
            const star = starRefs.current[i];
            
            star.mesh.position.x += star.dx * star.speed * delta;
            star.mesh.position.y += star.dy * star.speed * delta;
            star.mesh.position.z += star.dz * star.speed * delta;
            
            star.life -= delta * 1.5;
            if (star.mesh.material instanceof THREE.MeshBasicMaterial) {
               star.mesh.material.opacity = star.life;
            }
            
            if (star.life <= 0) {
                if (groupRef.current) {
                    groupRef.current.remove(star.mesh);
                }
                starRefs.current.splice(i, 1);
            }
        }
    });

    return <group ref={groupRef} />;
}

const DynamicEnvironment = () => {
    const { scene, camera } = useThree();
    const sunRef = useRef<THREE.DirectionalLight>(null);
    const sunMeshRef = useRef<THREE.Mesh>(null);
    const moonRef = useRef<THREE.DirectionalLight>(null);
    const moonMeshRef = useRef<THREE.Mesh>(null);
    const ambientRef = useRef<THREE.AmbientLight>(null);
    const rainRef = useRef<THREE.InstancedMesh>(null);
    const flashRef = useRef<THREE.PointLight>(null);
    const starsRef = useRef<THREE.Points>(null);

    const timeRef = useRef(14); // start at 2 PM
    const weatherRef = useRef<'clear' | 'rain' | 'storm'>('clear');
    const weatherTimerRef = useRef(30);

    const rainCount = 100;
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const rainData = useMemo(() => {
        const data = [];
        for(let i=0; i<rainCount; i++) {
            data.push({
                x: (Math.random() - 0.5) * 60,
                y: Math.random() * 40,
                z: (Math.random() - 0.5) * 60,
                v: 25 + Math.random() * 20
            });
        }
        return data;
    }, [rainCount]);

    const starsData = useMemo(() => {
        const starCount = 3000;
        const pos = new Float32Array(starCount * 3);
        for(let i=0; i<starCount; i++) {
            const r = 40 + Math.random() * 20;
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(1 - 2 * Math.random());
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);
            pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
        }
        return pos;
    }, []);

    useFrame((state, delta) => {
        timeRef.current = (timeRef.current + delta * 0.025) % 24; // ~16 mins per day
        const t = timeRef.current;

        const sunAngle = ((t - 6) / 24) * Math.PI * 2;
        const sunX = Math.cos(sunAngle) * 40;
        const sunY = Math.sin(sunAngle) * 40;
        const sunZ = Math.cos(sunAngle) * 15;

        const moonAngle = sunAngle + Math.PI;
        const moonX = Math.cos(moonAngle) * 40;
        const moonY = Math.sin(moonAngle) * 40;
        const moonZ = Math.cos(moonAngle) * 15;

        if (sunRef.current) {
            sunRef.current.position.set(sunX, sunY, sunZ);
            let baseIntensity = Math.max(0, Math.sin(sunAngle)) * 3.5;
            if (weatherRef.current !== 'clear') baseIntensity *= 0.6; // Was 0.3
            sunRef.current.intensity = baseIntensity;
        }

        if (sunMeshRef.current) {
            sunMeshRef.current.visible = sunY > -5; // hide below horizon
        }

        if (moonRef.current) {
            moonRef.current.position.set(moonX, moonY, moonZ);
            let moonIntensity = Math.max(0, Math.sin(moonAngle)) * 1.0;
            if (weatherRef.current !== 'clear') moonIntensity *= 0.5; // Was 0.2
            moonRef.current.intensity = moonIntensity;
        }

        if (moonMeshRef.current) {
            moonMeshRef.current.visible = moonY > -5; // hide below horizon
        }

        const isDay = t > 6 && t < 18;
        
        let skyHex = 0x08102a; // night (slightly brighter)
        if (t > 6 && t < 18) skyHex = 0x87CEEB; // day
        if (t > 5 && t <= 7) skyHex = 0xffa07a; // sunrise
        else if (t > 17 && t <= 19) skyHex = 0xff7f50; // sunset

        const currentColor = new THREE.Color(skyHex);
        const overCastColor = new THREE.Color(isDay ? 0x445566 : 0x112233);
        if (weatherRef.current !== 'clear') {
             currentColor.lerp(overCastColor, 1.0); // full overcast
        }
        
        scene.background = scene.background || new THREE.Color();
        (scene.background as THREE.Color).lerp(currentColor, 0.05);

        if (starsRef.current) {
            const mat = starsRef.current.material as THREE.PointsMaterial;
            // moonAngle 0->PI during night, so sin is positive.
            const targetOpacity = (!isDay && weatherRef.current === 'clear') ? Math.min(1, Math.sin(moonAngle) * 2) : 0;
            if (mat) {
                mat.opacity = THREE.MathUtils.lerp(mat.opacity || 0, targetOpacity, 0.05);
            }
        }

        if (ambientRef.current) {
            const ambientColor = new THREE.Color(isDay ? 0xffffff : 0xaaabdb); // brighter night
            let targetIntensity = isDay ? 1.0 : 1.2;
            
            if (weatherRef.current !== 'clear') {
                ambientColor.lerp(new THREE.Color(isDay ? 0xccddff : 0xaaaaaa), 0.5); // Brighter rain ambient
                targetIntensity = isDay ? 1.1 : 1.3;
            }
            ambientRef.current.color.lerp(ambientColor, 0.05);
            
            const isTwilight = (t > 5.5 && t <= 6.5) || (t > 17.5 && t <= 18.5);
            if (isTwilight && weatherRef.current === 'clear') targetIntensity = 1.0;
            
            ambientRef.current.intensity = THREE.MathUtils.lerp(ambientRef.current.intensity, targetIntensity, 0.05);
        }

        // --- Sun Glare & Color ---
        if (sunRef.current) {
            const sunColor = new THREE.Color();
            if (sunY > 10) {
                sunColor.setHex(0xffffee);
            } else if (sunY > 0) {
                sunColor.setHex(0xffaa50).lerp(new THREE.Color(0xffffee), sunY / 10);
            } else {
                sunColor.setHex(0xffaa50);
            }
            sunRef.current.color.copy(sunColor);
            if (sunMeshRef.current) {
                (sunMeshRef.current.material as THREE.MeshBasicMaterial).color.copy(sunColor);
                sunMeshRef.current.lookAt(0, 0, 0);
            }
        }
        if (moonMeshRef.current) {
            moonMeshRef.current.lookAt(0, 0, 0);
        }
        // ---

        weatherTimerRef.current -= delta;
        if (weatherTimerRef.current <= 0) {
            const r = Math.random();
            if (r < 0.6) {
                weatherRef.current = 'clear';
                weatherTimerRef.current = 60 + Math.random() * 60; // 1 to 2 mins
            } else if (r < 0.85) {
                weatherRef.current = 'rain';
                weatherTimerRef.current = 20 + Math.random() * 20;
            } else {
                weatherRef.current = 'storm';
                weatherTimerRef.current = 20 + Math.random() * 20;
            }
        }

        envState.weather = weatherRef.current;
        const targetWetness = weatherRef.current !== 'clear' ? 1 : 0;
        envState.wetness = THREE.MathUtils.lerp(envState.wetness, targetWetness, delta * 0.5);

        const currentWetness = envState.wetness;
        Object.values(sharedMaterials).forEach(mat => {
            mat.roughness = THREE.MathUtils.lerp(0.08, 0.02, currentWetness);
            mat.metalness = THREE.MathUtils.lerp(0.4, 0.7, currentWetness);
        });

        const isRaining = weatherRef.current === 'rain' || weatherRef.current === 'storm';
        
        // Update Rain Audio
        const rainIntensity = weatherRef.current === 'storm' ? 1.0 : (weatherRef.current === 'rain' ? 0.5 : 0);
        playRainSound(rainIntensity * Math.min(1, envState.wetness * 2));

        if (rainRef.current) {
            rainRef.current.visible = isRaining;
            if (isRaining) {
                const camPos = camera.position;
                for(let i=0; i<rainCount; i++) {
                    const rd = rainData[i];
                    rd.y -= rd.v * delta;
                    if (rd.y < -5) {
                        rd.y = 30 + Math.random() * 10;
                        rd.x = Math.max(-30, Math.min(30, camPos.x + (Math.random() - 0.5) * 40));
                        rd.z = Math.max(-30, Math.min(30, camPos.z + (Math.random() - 0.5) * 40));
                    }
                    dummy.position.set(rd.x, rd.y, rd.z);
                    dummy.scale.set(1, Math.min(4, rd.v / 10), 1);
                    dummy.updateMatrix();
                    rainRef.current.setMatrixAt(i, dummy.matrix);
                }
                rainRef.current.instanceMatrix.needsUpdate = true;
            }
        }

        if (flashRef.current) {
            if (weatherRef.current === 'storm' && Math.random() < 0.02) {
                flashRef.current.intensity = 80 + Math.random() * 80;
                flashRef.current.position.set((Math.random()-0.5)*40, 15, (Math.random()-0.5)*40);
            } else {
                flashRef.current.intensity = THREE.MathUtils.lerp(flashRef.current.intensity, 0, 0.2);
            }
        }
    });

    return (
        <group>
            <ambientLight ref={ambientRef} />
            <directionalLight ref={sunRef} castShadow shadow-mapSize={[512, 512]} shadow-normalBias={0.05} intensity={0}>
                <orthographicCamera attach="shadow-camera" args={[-20, 20, 20, -20, 0.1, 100]} />
                <mesh ref={sunMeshRef} position={[0, 0, 0]}>
                    <planeGeometry args={[5, 5]} />
                    <meshBasicMaterial color="#ffffee" side={THREE.DoubleSide} transparent opacity={0.9} />
                </mesh>
            </directionalLight>

            <directionalLight ref={moonRef} intensity={0} color="#88aaff">
                <mesh ref={moonMeshRef} position={[0, 0, 0]}>
                    <planeGeometry args={[3.5, 3.5]} />
                    <meshBasicMaterial color="#ccddff" side={THREE.DoubleSide} transparent opacity={0.9} />
                </mesh>
            </directionalLight>

            <pointLight ref={flashRef} color="#eef5ff" distance={150} decay={2} intensity={0} />
            
            <points ref={starsRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={1500} array={starsData} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial size={0.3} color="#ffffff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
            </points>

            <instancedMesh ref={rainRef} args={[undefined, undefined, rainCount]} visible={false}>
                <boxGeometry args={[0.015, 0.8, 0.015]} />
                <meshBasicMaterial color="#aaddff" transparent opacity={0.4} />
            </instancedMesh>
        </group>
    );
}

const LensDrops = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropsRef = useRef<{x: number, y: number, r: number, life: number}[]>([]);

    useFrame(({ camera, size }) => {
        const isRaining = envState.weather === 'rain' || envState.weather === 'storm';
        if (!isRaining && dropsRef.current.length === 0) return;

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            const w = canvasRef.current.width = size.width;
            const h = canvasRef.current.height = size.height;
            
            ctx.clearRect(0, 0, w, h);

            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const upStrength = Math.max(0, dir.y);

            // Spawn drops only when looking up
            if (isRaining && upStrength > 0.1 && Math.random() < upStrength * 0.4) {
                dropsRef.current.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 8 + Math.random() * 20,
                    life: 1.0,
                });
            }

            for (let i = dropsRef.current.length - 1; i >= 0; i--) {
                const drop = dropsRef.current[i];
                drop.life -= 0.015; // Quick fade
                
                drop.y += upStrength * 2; // slow slide

                if (drop.life <= 0) {
                    dropsRef.current.splice(i, 1);
                } else {
                    // Very simple, subtle water ring
                    ctx.beginPath();
                    ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(200, 225, 255, ${drop.life * 0.15})`;
                    ctx.lineWidth = 1 + drop.life * 2;
                    ctx.stroke();
                    
                    // Inner very subtle highlight
                    ctx.beginPath();
                    ctx.arc(drop.x - drop.r * 0.2, drop.y - drop.r * 0.2, drop.r * 0.2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${drop.life * 0.1})`;
                    ctx.fill();
                }
            }
        }
    });

    return (
        <Html fullscreen zIndexRange={[50, 0]} className="pointer-events-none">
            <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
        </Html>
    );
}

export const sharedMaterials: Record<string, THREE.MeshStandardMaterial> = {};

export const getSharedMaterial = (color: string) => {
    if (!sharedMaterials[color]) {
        sharedMaterials[color] = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.15,
            metalness: 0.2
        });
    }
    return sharedMaterials[color];
};

const GameBlock = ({ color, userData, ...props }: any) => {
    return (
        <RoundedBox args={[0.96, 0.96, 0.96]} radius={0.08} smoothness={1} castShadow receiveShadow userData={userData} {...props}>
            <primitive object={getSharedMaterial(color)} attach="material" />
        </RoundedBox>
    );
}

const MainMenu = () => {
    const setAppState = useGameStore(s => s.setAppState);
    const resetGame = useGameStore(s => s.resetGame);
    const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
    const [name, setName] = useState('');

    useEffect(() => {
        loginAnonymously().then(() => getLeaderboard().then(setLeaders));
        const savedName = localStorage.getItem('playername');
        if (savedName) setName(savedName);
        else setName('Player_' + Math.floor(Math.random() * 1000));
    }, []);

    const handleStart = () => {
        localStorage.setItem('playername', name);
        resetGame();
        setAppState('playing');
    };

    return (
        <div className="absolute inset-0 z-50 bg-gradient-to-b from-[#161a35] to-[#04050e] flex p-6 md:p-12 gap-8 flex-col md:flex-row shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
            <div className="flex-1 flex flex-col justify-center items-center md:items-start space-y-8 glass-card p-12 rounded-3xl animate-in fade-in slide-in-from-bottom flex-shrink min-h-0">
                <div className="flex flex-col items-center md:items-start">
                    <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-400 drop-shadow-lg leading-tight">
                        BLOCK<br/>BURST 3
                    </h1>
                    <p className="text-slate-400 font-bold tracking-widest uppercase mt-4 text-sm md:text-base drop-shadow-sm">Spatial Puzzle Evolved</p>
                </div>

                <div className="w-full max-w-sm space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nickname</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-cyan-300 font-bold tracking-wide outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={15}
                        />
                    </div>
                </div>

                <button 
                    onClick={handleStart}
                    className="w-full max-w-sm py-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:from-cyan-600 active:to-blue-700 text-white font-black tracking-widest text-lg rounded-2xl flex items-center justify-center gap-3 transition-colors active:scale-95 shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)]"
                >
                    <Play className="w-6 h-6 fill-current" />
                    PLAY NOW
                </button>
            </div>

            <div className="w-full md:w-80 glass-card p-6 md:p-8 rounded-3xl shrink-0 flex flex-col min-h-0 overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-black text-slate-200 tracking-wider">GLOBAL TOP</h2>
                    <Trophy className="w-6 h-6 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]" />
                </div>
                
                <div className="flex-1 flex flex-col gap-3">
                    {leaders.length === 0 ? (
                        <div className="text-center text-slate-500 font-medium py-10 my-auto text-sm">No scores yet.<br/>Be the first!</div>
                    ) : (
                        leaders.slice(0, 3).map((l, i) => (
                            <div key={i} className="flex justify-between items-center bg-slate-900/50 px-4 py-3 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <span className={`font-black text-lg ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-slate-600'}`}>{i + 1}</span>
                                    <span className="font-bold text-slate-300 font-mono text-sm">{l.displayName}</span>
                                </div>
                                <span className="font-mono font-bold text-cyan-400">{l.score}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

// Shared camera position without React state overhead
export const sharedCameraPos = { x: 8, y: 6, z: 8 };

// Generate offset so grid is centered around (0,0,0)
const offset = (GRID_SIZE - 1) / 2; // 2 for GRID_SIZE=5
const R3F_CANVAS_ID = 'r3f-canvas-container';

const SyncMainCamera = () => {
    useFrame((state) => {
        sharedCameraPos.x = state.camera.position.x;
        sharedCameraPos.y = state.camera.position.y;
        sharedCameraPos.z = state.camera.position.z;
    });
    return null;
}

const SyncHandCamera = () => {
    useFrame((state) => {
        state.camera.position.set(sharedCameraPos.x, sharedCameraPos.y, sharedCameraPos.z);
        state.camera.lookAt(0,0,0);
    });
    return null;
}

const PlacementTargets = () => {
   return (
      <group>
         <mesh userData={{ isTarget: true }} visible={false}>
             <boxGeometry args={[GRID_SIZE + 4, GRID_SIZE + 4, GRID_SIZE + 4]} />
             <meshBasicMaterial side={THREE.DoubleSide} />
         </mesh>
      </group>
   )
}

// Fallback static shapes for initial clouds if player hasn't cleared any blocks
const DEFAULT_CLOUDS = [
  [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:0, y:1, z:0}, {x:0, y:0, z:1}],
  [{x:0, y:0, z:0}, {x:0, y:1, z:0}, {x:0, y:2, z:0}],
  [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:2, y:0, z:0}, {x:1, y:1, z:0}],
  [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:0, y:0, z:1}, {x:1, y:0, z:1}],
  [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:2, y:0, z:0}, {x:3, y:0, z:0}],
  [{x:0, y:0, z:0}, {x:0, y:1, z:0}, {x:1, y:1, z:0}, {x:1, y:2, z:0}],
  [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:1, y:0, z:1}, {x:2, y:0, z:1}],
  [{x:0, y:0, z:0}, {x:0, y:1, z:0}, {x:0, y:2, z:0}, {x:1, y:2, z:0}],
  [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:0, y:1, z:0}, {x:1, y:1, z:0}, {x:0, y:2, z:0}, {x:1, y:2, z:0}],
  [{x:1, y:0, z:0}, {x:0, y:1, z:0}, {x:1, y:1, z:0}, {x:2, y:1, z:0}, {x:1, y:2, z:0}]
];

const BlockClouds = () => {
    const storeClouds = useGameStore(s => s.recentShapesForClouds);
    const clouds = [...DEFAULT_CLOUDS, ...storeClouds].slice(-8); // Show max 8 clouds for performance
    const cloudRefs = useRef<{group: THREE.Group, speed: number, offset: number, yOffset: number, zOffset: number}[]>([]);

    useEffect(() => {
        cloudRefs.current = clouds.map((_, i) => {
            const existing = cloudRefs.current[i];
            if (existing && existing.speed !== undefined) return existing;
            return {
                group: existing?.group || new THREE.Group(),
                speed: 0.2 + Math.random() * 1.5,
                offset: Math.random() * 400,
                yOffset: (Math.random() > 0.5 ? 20 + Math.random() * 30 : -30 - Math.random() * 30),
                zOffset: -200 + Math.random() * 400
            };
        });
    }, [clouds]);

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        cloudRefs.current.forEach((c, i) => {
            if (c.group) {
                // drift clouds across the sky
                const x = ((t * c.speed + c.offset) % 400) - 200;
                c.group.position.set(x, c.yOffset, c.zOffset);
            }
        });
    });

    return (
        <group>
            {clouds.map((snapshot, i) => (
                <group key={i} scale={[3, 3, 3]} ref={(el) => { if(el) cloudRefs.current[i] = { ...cloudRefs.current[i], group: el }}}>
                    {snapshot.map((pt, j) => (
                        <group key={j} position={[pt.x - 2, pt.y - 2, pt.z - 2]}>
                            <mesh>
                                <boxGeometry args={[0.96, 0.96, 0.96]} />
                                <meshBasicMaterial colorWrite={false} depthWrite={true} />
                            </mesh>
                            <mesh>
                                <boxGeometry args={[0.96, 0.96, 0.96]} />
                                <meshStandardMaterial color="#ffffff" transparent opacity={0.6} roughness={0.15} metalness={0.2} depthWrite={false} />
                            </mesh>
                        </group>
                    ))}
                </group>
            ))}
        </group>
    );
}

const RoomBounds = () => {
   const offset = (GRID_SIZE - 1) / 2;
   return (
       <group>
           {/* Minecraft style dirt/grass island base */}
           <mesh position={[0, -offset - 1.0, 0]} receiveShadow>
               <boxGeometry args={[GRID_SIZE, 1, GRID_SIZE]} />
               <meshStandardMaterial color="#3e2723" roughness={1} />
               <Edges color="#1a1005" />
           </mesh>
           <mesh position={[0, -offset - 0.45, 0]} receiveShadow>
               <boxGeometry args={[GRID_SIZE, 0.1, GRID_SIZE]} />
               <meshStandardMaterial color="#2e7d32" roughness={1} />
               <Edges color="#153e16" />
           </mesh>
           {/* 5x5x5 Outer Frame Boundaries */}
           <mesh position={[0, 0, 0]}>
               <boxGeometry args={[GRID_SIZE, GRID_SIZE, GRID_SIZE]} />
               <meshBasicMaterial transparent opacity={0.05} color="#ffffff" depthWrite={false} side={THREE.DoubleSide} />
               <Edges color="#ffffff" transparent opacity={0.8} />
           </mesh>
       </group>
   )
}

const RaycastManager = () => {
    const { raycaster, camera, scene } = useThree();
    const dragPos = useGameStore(s => s.dragPos);
    const dragState = useGameStore(s => s.dragState);
    const setHoveredCell = useGameStore(s => s.setHoveredCell);

    useFrame(() => {
        if (!dragState || !dragPos) {
           return;
        }
        
        const canvasContainer = document.getElementById(R3F_CANVAS_ID);
        if (!canvasContainer) return;

        const rect = canvasContainer.getBoundingClientRect();
        
        // Match the -150% translateY of the 120px hand icon UI.
        // The div is 120px high. translate(y - 150%) = y - 180. Center of div is y - 180 + 60 = y - 120.
        const inputX = dragPos.x;
        const inputY = dragPos.y - 120;

        if (inputX < rect.left - 100 || inputX > rect.right + 100 || inputY < rect.top - 100 || inputY > rect.bottom + 100) {
            setHoveredCell(null);
            return;
        }

        const x = ((inputX - rect.left) / rect.width) * 2 - 1;
        const y = -((inputY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        const targets: THREE.Object3D[] = [];
        scene.traverse((child) => {
            if (child.userData?.isTarget) targets.push(child);
        });
        
        const intersects = raycaster.intersectObjects(targets, false);
        
        let p: THREE.Vector3 | null = null;
        let worldNormal = new THREE.Vector3(0, 1, 0);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
            if (hit.face) {
                 worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
            }
            p = hit.point.clone().add(worldNormal.clone().multiplyScalar(0.1));
        } else if (dragState) {
            // Fallback: intersect with a plane at the grid center facing the camera
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            const plane = new THREE.Plane(camDir.negate(), 0);
            const hitPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, hitPoint)) {
                p = hitPoint;
            }
        }

        if (p) {
            let cx = 0, cy = 0, cz = 0;

            if (dragState) {
                const shape = dragState.shape;
                let minX = shape.points[0].x, minY = shape.points[0].y, minZ = shape.points[0].z;
                let maxX = shape.points[0].x, maxY = shape.points[0].y, maxZ = shape.points[0].z;
                shape.points.forEach(pt => {
                    minX = Math.min(minX, pt.x);
                    minY = Math.min(minY, pt.y);
                    minZ = Math.min(minZ, pt.z);
                    maxX = Math.max(maxX, pt.x);
                    maxY = Math.max(maxY, pt.y);
                    maxZ = Math.max(maxZ, pt.z);
                });
                
                const sx = (maxX + minX) / 2;
                const sy = (maxY + minY) / 2;
                const sz = (maxZ + minZ) / 2;

                let bestCell = null;
                let minScore = Infinity;
                const canPlace = useGameStore.getState().canPlace;

                for (let x = 0; x < GRID_SIZE; x++) {
                    for (let y = 0; y < GRID_SIZE; y++) {
                        for (let z = 0; z < GRID_SIZE; z++) {
                            if (canPlace(shape, {x, y, z})) {
                                const worldCX = (x + sx) - offset;
                                const worldCY = (y + sy) - offset;
                                const worldCZ = (z + sz) - offset;
                                const centerPoint = new THREE.Vector3(worldCX, worldCY, worldCZ);
                                
                                // Distance from pointer's ray to the visual center of the shape
                                const distSq = raycaster.ray.distanceSqToPoint(centerPoint);
                                // Tie-breaker: prioritize placements closer to the camera
                                const depth = camera.position.distanceToSquared(centerPoint);

                                const score = distSq * 1000 + depth;
                                
                                if (score < minScore) {
                                    minScore = score;
                                    bestCell = {x, y, z};
                                }
                            }
                        }
                    }
                }

                if (bestCell && minScore < 3000) { // generous distance parameter
                    cx = bestCell.x;
                    cy = bestCell.y;
                    cz = bestCell.z;
                } else if (p) {
                    // Fallback to invalid red preview using p as reference point for visual
                    const targetX = p.x + offset;
                    const targetY = p.y + offset;
                    const targetZ = p.z + offset;

                    cx = Math.round(targetX - sx);
                    cy = Math.round(targetY - sy);
                    cz = Math.round(targetZ - sz);
                    
                    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
                    cx = clamp(cx, -minX, GRID_SIZE - 1 - maxX);
                    cy = clamp(cy, -minY, GRID_SIZE - 1 - maxY);
                    cz = clamp(cz, -minZ, GRID_SIZE - 1 - maxZ);
                }

            } else if (p) {
                cx = Math.round(p.x + offset);
                cy = Math.round(p.y + offset);
                cz = Math.round(p.z + offset);
            }

            setHoveredCell({ x: cx, y: cy, z: cz });
        } else {
            setHoveredCell(null);
        }
    });

    return null;
}

const PlacedBlocks = () => {
  const grid = useGameStore(s => s.grid);
  return (
    <group position={[-offset, -offset, -offset]}>
      {Object.entries(grid).map(([key, color]) => {
         const [x,y,z] = key.split(',').map(Number);
         return (
            <group key={key} position={[x, y, z]}>
               {/* Invisible sharp box for raycasting target */}
               <mesh userData={{ isTarget: true }} visible={false}>
                   <boxGeometry args={[1, 1, 1]} />
               </mesh>
               {/* Visible rounded box */}
               <GameBlock color={color} />
            </group>
         )
      })}
    </group>
  );
}

const PreviewBlock = ({ hoveredCell, isDragging }: { hoveredCell: Point3D | null, isDragging: boolean }) => {
  const dragState = useGameStore(s => s.dragState);
  const selectedShape = dragState ? dragState.shape : null;
  const canPlace = useGameStore(s => s.canPlace);
  
  if (!selectedShape || !hoveredCell) return null;
  
  const valid = canPlace(selectedShape, hoveredCell);
  
  if (!valid) return null;
  
  return (
     <group position={[-offset, -offset, -offset]}>
        {selectedShape.points.map((pt, i) => (
            <RoundedBox 
               key={i} 
               position={[hoveredCell.x + pt.x, hoveredCell.y + pt.y, hoveredCell.z + pt.z]} 
               args={[0.96, 0.96, 0.96]}
               radius={0.08}
               smoothness={1}
            >
               <meshStandardMaterial 
                  color={selectedShape.color} 
                  transparent 
                  opacity={isDragging ? 0.9 : 0.4}
                  roughness={0.15} metalness={0.2}
               />
            </RoundedBox>
        ))}
     </group>
  )
}

const ExplodingBlock = ({ data }: { data: any }) => {
    const ref = useRef<THREE.Group>(null);
    const [start] = useState(Date.now());
    
    // Only 4 particles to be extremely lightweight
    const particles = useMemo(() => {
        return Array.from({ length: 4 }).map((_, i) => {
            const angle = (i / 4) * Math.PI * 2;
            const xDir = Math.cos(angle) * 15;
            const yDir = 5.0 + Math.random() * 5;
            const zDir = Math.sin(angle) * 15;
            const rx = Math.random() * Math.PI * 2;
            const ry = Math.random() * Math.PI * 2;
            const rz = Math.random() * Math.PI * 2;
            return { xDir, yDir, zDir, rx, ry, rz };
        });
    }, []);

    useFrame(() => {
        if (!ref.current) return;
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed > 0.3) return; // Snappy 0.3s
        
        const progress = elapsed / 0.3;
        const easeOut = 1 - Math.pow(1 - progress, 4);
        
        ref.current.children.forEach((child, i) => {
            const p = particles[i];
            child.position.x = p.xDir * easeOut;
            child.position.y = p.yDir * easeOut - (elapsed * elapsed * 80); // Very fast gravity
            child.position.z = p.zDir * easeOut;
            child.rotation.x = p.rx + elapsed * 20;
            child.rotation.y = p.ry + elapsed * 20;
            child.rotation.z = p.rz + elapsed * 20;
            
            const scale = Math.max(0, 1 - progress); // Shrink quickly
            child.scale.setScalar(scale);
        });
    });

    return (
        <group ref={ref} position={[data.x, data.y, data.z]}>
            {particles.map((_, i) => (
                <mesh key={i}>
                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                    <meshStandardMaterial color={data.color} transparent opacity={1.0} roughness={0.1} metalness={0.5} emissive={data.color} emissiveIntensity={2.5} />
                </mesh>
            ))}
        </group>
    );
}

const Explosions = () => {
    const destructions = useGameStore(s => s.recentDestructions);
    return (
        <group position={[-offset, -offset, -offset]}>
            {destructions.map((d) => <ExplodingBlock key={d.id} data={d} />)}
        </group>
    )
}

const GameScene = () => {
   const hoveredCell = useGameStore(s => s.hoveredCell);
   const dragState = useGameStore(s => s.dragState);

   return (
      <group>
         <SyncMainCamera />
         <RaycastManager />
         <PlacementTargets />
         <RoomBounds />
         <BlockClouds />
         <PlacedBlocks />
         <Explosions />
         <PreviewBlock hoveredCell={hoveredCell} isDragging={!!dragState} />
      </group>
   )
}

const StaticShape = ({ shape }: { shape: ShapeDefinition }) => {
   // offset points to center of the shape
   const xs = shape.points.map(p=>p.x);
   const ys = shape.points.map(p=>p.y);
   const zs = shape.points.map(p=>p.z);
   const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
   const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
   const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
   
   return (
      <group position={[-cx, -cy, -cz]}>
         {shape.points.map((pt, i) => (
             <GameBlock key={i} position={[pt.x, pt.y, pt.z]} color={shape.color} />
         ))}
      </group>
   )
}

const HandCanvas = ({ shape, index }: { shape: ShapeDefinition | null, index: number }) => {
   const setDragState = useGameStore(s => s.setDragState);
   const setDragPos = useGameStore(s => s.setDragPos);
   const isDragging = useGameStore(s => s.dragState?.index === index);
   
   return (
      <div 
         className={`w-[26vw] max-w-[160px] max-h-[160px] aspect-square sm:w-24 sm:h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 cursor-pointer rounded-2xl transition-all duration-300 glass-card flex flex-col justify-between overflow-hidden relative shrink-0 ${
            isDragging 
            ? 'opacity-30 scale-95 border-amber-400 bg-slate-800/90 shadow-[0_0_30px_rgba(251,191,36,0.5)] z-20 ring-4 ring-amber-500/30' 
            : 'hover:border-white/30 hover:bg-slate-800/80 z-10 active:scale-95'
         } ${!shape ? 'opacity-0 pointer-events-none' : ''}`}
         onPointerDown={(e) => {
            if (shape) {
               e.preventDefault();
               e.currentTarget.setPointerCapture(e.pointerId);
               setDragState({ index, shape });
               setDragPos({ x: e.clientX, y: e.clientY });
            }
         }}
      >
         {shape && (
            <Canvas camera={{ position: [3, 2.5, 3], fov: 50 }} dpr={[1, 1]}>
               <ambientLight intensity={0.7} />
               <directionalLight position={[10, 10, 10]} intensity={1.5} />
               <SyncHandCamera />
               <StaticShape shape={shape} />
            </Canvas>
         )}
      </div>
   )
}

const FloatingTextsOverlay = () => {
   const floatingTexts = useGameStore(s => s.floatingTexts);
   
   return (
       <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-50">
           {floatingTexts.map((ft) => (
               <div
                   key={ft.id}
                   className="font-black italic text-6xl md:text-8xl my-2 text-center drop-shadow-2xl opacity-0"
                   style={{ 
                       color: ft.color, 
                       WebkitTextStroke: '3px white',
                       textShadow: `0px 8px 0px #000000, 0px 10px 15px rgba(0,0,0,0.8), 0 0 30px ${ft.color}`, 
                       animation: 'blockBlastPop 1.5s ease-out forwards' 
                   }}
               >
                   {ft.text}
               </div>
           ))}
       </div>
   );
}

const FloatingPreview = () => {
    const dragState = useGameStore(s => s.dragState);
    const dragPos = useGameStore(s => s.dragPos);
    const hoveredCell = useGameStore(s => s.hoveredCell);
    const canPlace = useGameStore(s => s.canPlace);
    
    if (!dragState || !dragPos) return null;

    const isPlaceable = hoveredCell && canPlace(dragState.shape, hoveredCell);

    return (
        <div 
           className="fixed pointer-events-none z-50 flex items-center justify-center top-0 left-0"
           style={{
               transform: `translate(${dragPos.x}px, ${dragPos.y}px) translate(-50%, -150%)`,
               width: '120px',
               height: '120px',
               opacity: isPlaceable ? 0 : 0.9,
               transition: 'opacity 0.1s ease-out'
           }}
        >
            <Canvas camera={{ position: [4, 3.5, 4], fov: 50 }} dpr={[1, 1.5]}>
               <ambientLight intensity={0.7} />
               <directionalLight position={[10, 10, 10]} intensity={1.5} />
               <SyncHandCamera />
               <StaticShape shape={dragState.shape} />
            </Canvas>
        </div>
    );
}

export default function App() {
  const { appState, setAppState, score, highScore, cumulativeScore, combo, status, resetGame, hand, showPerfectClear, dragState, setDragState, setDragPos, setHoveredCell, hoveredCell, placeBlock } = useGameStore();

  useEffect(() => {
     if ((cumulativeScore || highScore) > 0) {
         const nameToSave = localStorage.getItem('player_name') || 'Anonymous';
         submitScore(nameToSave, cumulativeScore || highScore).catch(console.error);
     }
  }, [cumulativeScore, highScore]);

  const handlePointerMove = (e: React.PointerEvent) => {
      if (dragState) {
          setDragPos({ x: e.clientX, y: e.clientY });
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (dragState && hoveredCell) {
          placeBlock(hoveredCell);
      }
      setDragState(null);
      setDragPos(null);
      setHoveredCell(null);
  };

  if (appState === 'menu') {
      return <MainMenu />;
  }

  const handlePointerDown = (e: React.PointerEvent) => {
      if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
          globalAudioCtx.resume();
      }
  };

  return (
    <div 
       className="flex flex-col h-[100dvh] bg-[#11142b] text-slate-50 font-sans p-3 sm:p-4 md:p-8 select-none overflow-hidden touch-none relative"
       onPointerMove={handlePointerMove}
       onPointerDown={handlePointerDown}
       onPointerUp={handlePointerUp}
       onPointerCancel={handlePointerUp}
    >
       <FloatingPreview />
       <FloatingTextsOverlay />
       
       {/* Perfect Clear Overlay */}
       {showPerfectClear && (
           <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
               <div className="bg-gradient-to-r from-cyan-400 via-blue-500 to-amber-400 text-transparent bg-clip-text font-black italic text-6xl md:text-9xl drop-shadow-[0_10px_20px_rgba(34,211,238,0.5)] text-center leading-tight opacity-0"
                    style={{ WebkitTextStroke: '2px white', filter: 'drop-shadow(0px 8px 0px #000) drop-shadow(0px 10px 15px rgba(0,0,0,0.8))', animation: 'blockBlastPop 2.5s ease-out forwards' }}
               >
                   PERFECT<br/>CLEAR!
               </div>
           </div>
       )}

       {/* UI Header */}
       <header className="flex justify-between items-start mb-4 md:mb-8 z-10 relative shrink-0">
          <div className="flex flex-col">
             <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-400 drop-shadow-lg">
                BLOCK BURST 3
             </h1>
             <p className="hidden md:block text-slate-400 text-sm font-bold tracking-widest uppercase mt-2">Spatial Puzzle Evolved</p>
          </div>
          
          <div className="flex gap-3 sm:gap-4 md:gap-8 items-end">
             {combo > 0 && (
                <div className="h-full flex items-center mb-0.5 md:mb-1">
                    <div className="glass-card px-2 md:px-4 py-1 flex-col sm:py-2 rounded-lg sm:rounded-xl border border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.2)] animate-pulse flex items-center justify-center">
                        <span className="text-cyan-400 font-bold tracking-widest uppercase text-[10px] md:text-xs">Combos x{combo}</span>
                    </div>
                </div>
             )}
             <div className="text-right">
                <p className="text-cyan-200/60 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-0.5 md:mb-1">Score</p>
                <p className="text-3xl md:text-5xl font-extrabold font-mono leading-none drop-shadow-md">{score}</p>
             </div>
             <div className="text-right">
                <p className="text-slate-500 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-0.5 md:mb-1">Total</p>
                <p className="text-3xl md:text-5xl font-extrabold font-mono text-slate-500/80 leading-none">{cumulativeScore || highScore}</p>
             </div>
          </div>
       </header>

       {/* Main Game Area */}
       <main className="flex-1 relative flex flex-col md:flex-row gap-4 md:gap-8 justify-center min-h-0">
          <section id={R3F_CANVAS_ID} className="w-full h-full min-h-[35vh] md:min-h-0 relative rounded-3xl overflow-hidden glass-card shadow-[0_0_40px_rgba(0,0,0,0.5)] flex-1 ring-1 ring-white/10">
             <Canvas camera={{ position: [7, 5, 7], fov: 35 }} shadows dpr={[1, 1.5]} performance={{ min: 0.5 }}>
                <LensDrops />
                <DynamicEnvironment />
                <ShootingStars />
                <OrbitControls 
                   makeDefault 
                   enablePan={false} 
                   enableRotate={!dragState} // Disable rotation while dragging shape
                   minDistance={5} maxDistance={25} 
                />
                <GameScene />
             </Canvas>
          </section>

          {/* Game Over Screen */}
          {status === 'gameover' && (
             <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xl flex items-center justify-center z-50">
                <div className="glass-card p-10 rounded-3xl flex flex-col items-center gap-8 max-w-sm w-full mx-4 transform transition-all scale-100 ring-2 ring-rose-500/30 shadow-[0_0_50px_rgba(244,63,94,0.3)]">
                   <div className="text-center">
                      <h2 className="text-4xl font-black text-rose-500 tracking-tighter mb-2">GAME OVER</h2>
                      <p className="text-rose-200/60 font-medium">No more moves available</p>
                   </div>
                   
                   <div className="flex flex-col items-center w-full bg-slate-900/80 py-6 px-4 rounded-2xl border border-white/5">
                      <span className="text-slate-500 text-xs font-bold tracking-widest uppercase mb-1">Final Score</span>
                      <span className="text-6xl font-mono font-black text-cyan-400 drop-shadow-lg">{score}</span>
                   </div>
                   
                   <button 
                      onClick={resetGame}
                      className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black tracking-wide rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-lg"
                   >
                      <RotateCcw className="w-4 h-4" />
                      SHUFFLE & RETRY
                   </button>
                   <button 
                      onClick={() => setAppState('menu')}
                      className="w-full py-4 glass-card bg-slate-900/50 hover:bg-slate-800 text-slate-300 font-bold tracking-wide rounded-xl transition-colors active:scale-95 shadow-sm"
                   >
                      MAIN MENU
                   </button>
                </div>
             </div>
          )}

          {/* Next Cube Side - adapting to Hand Area */}
          <aside className="w-full md:w-64 glass-card p-3 sm:p-4 md:p-6 rounded-3xl flex flex-col justify-between shrink-0 mb-8 md:mb-0 md:h-full md:max-h-[600px] z-20 ring-1 ring-white/10">
              <h3 className="hidden md:block text-xs font-bold text-cyan-400 uppercase tracking-widest text-center mb-6 drop-shadow-sm">Available Blocks</h3>
              <div className="flex flex-row md:flex-col items-center gap-3 sm:gap-4 md:gap-6 justify-center flex-1 overflow-visible md:py-4">
                 {hand.map((shape, index) => (
                     <HandCanvas 
                        key={index} 
                        shape={shape} 
                        index={index} 
                     />
                 ))}
              </div>
              <div className="hidden md:block mt-6">
                  <p className="text-xs text-slate-400 italic text-center leading-relaxed">
                      1. Long-press a block below.<br/>
                      2. Drag it over the grid.<br/>
                      3. Release to place.
                  </p>
              </div>
          </aside>
       </main>

       <footer className="mt-2 text-xs md:mt-8 flex justify-between items-center border-t border-slate-800/50 pt-3 md:pt-6 shrink-0 z-10 relative">
           <div className="flex gap-4 md:gap-6 text-[10px] md:text-xs text-slate-500 uppercase tracking-widest font-bold">
               <span className="text-blue-400">Level {Math.floor(score / 1000) + 1}</span>
               <span className="hidden sm:inline">Volume 80%</span>
               <span className="hidden sm:inline">Haptic On</span>
           </div>
           <div className="hidden md:flex flex-col md:flex-row gap-4 text-[10px] md:text-xs text-slate-400 font-medium items-end md:items-center">
              <span><strong className="text-slate-300">Rotate View:</strong> Background Swipe (when no block is selected)</span>
              <span className="hidden md:inline text-slate-600">•</span>
              <span><strong className="text-slate-300">Place:</strong> Select Block &rarr; Swipe on Grid</span>
           </div>
       </footer>
    </div>
  )
}

