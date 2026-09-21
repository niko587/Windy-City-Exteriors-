/**
 * Look inside the wall.
 *
 * The same one-bay section, drawn five times over: each layer is its own group
 * travelling along z, so separating the assembly is a single eased value per
 * layer rather than a canned animation. The outer layers trail the inner ones
 * slightly, which is what makes the move read as a stack coming apart rather
 * than five things sliding at once.
 *
 * The stage lives in the same scene as the house — same canvas, same camera
 * rig, same renderer — and simply takes over the lighting as the house fades
 * out. Nothing is torn down and rebuilt, so going in and coming back out costs
 * nothing and never stutters.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { assemblySize, buildAssembly, buildAssemblyWindow } from './build/assembly';
import {
  createAssemblyMaterials,
  disposeAssemblyMaterials,
  setAssemblyFinish,
  setLayerEmphasis,
} from './materials/assembly';
import { studioEnvironment } from './materials/textures';
import { experience, getState, useExperience } from './store';
import { stagePresence, wallProjected } from './wallLayers';
import type { SidingProfile } from './materials/textures';

/** The stack straddles the camera target once it is separated. */
const ORIGIN: [number, number, number] = [-assemblySize.bay / 2, 0, -0.45];

/** Soft radial falloff, used for the pool of light and the contact shadow. */
function radial(inner: number, feather: number): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size * feather);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const _v = new THREE.Vector3();

export function WallAssembly(): React.JSX.Element | null {
  const gl = useThree((s) => s.gl);
  const active = useExperience((s) => s.mode === 'wall');
  const colour = useExperience((s) => s.sidingColour);
  const profile = useExperience((s) => s.sidingProfile);
  const reduced = useExperience((s) => s.reducedMotion);

  // Nothing is built until the viewer asks to look inside; after that the
  // stage stays in the scene, invisible, so coming back is instant.
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    if (active) setBuilt(true);
  }, [active]);

  return built ? <Stage gl={gl} colour={colour} profile={profile} reduced={reduced} /> : null;
}

interface StageProps {
  gl: THREE.WebGLRenderer;
  colour: string;
  profile: string;
  reduced: boolean;
}

function Stage({ gl, colour, profile, reduced }: StageProps): React.JSX.Element {
  const root = useRef<THREE.Group>(null);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const key = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);

  const { layers, window: sashes, materials, floorFade, pool, shadow } = useMemo(() => {
    const env = studioEnvironment(gl);
    return {
      ...buildAssembly(),
      window: buildAssemblyWindow(),
      materials: createAssemblyMaterials(env),
      floorFade: radial(0.06, 0.48),
      pool: radial(0.02, 0.44),
      shadow: radial(0.01, 0.38),
    };
  }, [gl]);

  useEffect(
    () => () => {
      for (const layer of layers) for (const g of layer.parts.values()) g.dispose();
      for (const g of sashes.values()) g.dispose();
      floorFade.dispose();
      pool.dispose();
      shadow.dispose();
      disposeAssemblyMaterials();
    },
    [layers, sashes, floorFade, pool, shadow],
  );

  /* The outermost layer wears whatever was chosen in the studio. */
  useEffect(() => {
    setAssemblyFinish(colour, profile as SidingProfile);
  }, [colour, profile]);

  /* -- motion ------------------------------------------------------------ */

  const separation = useRef(layers.map(() => 0));
  const emphasis = useRef(layers.map(() => 1));
  const lift = useRef(layers.map(() => 0));

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 0.05);
    const state = getState();
    const on = state.mode === 'wall';

    // Presence: the house dims, the stage comes up. One value, read by the
    // backdrop and the house rig too, so the three can never disagree.
    const toward = on ? 1 : 0;
    stagePresence.value = reduced
      ? toward
      : stagePresence.value + (toward - stagePresence.value) * (1 - Math.exp(-6.5 * dt));
    const p = stagePresence.value;

    const group = root.current;
    if (group) group.visible = p > 0.008;
    if (key.current) key.current.intensity = 2.1 * p;
    if (rim.current) rim.current.intensity = 1.5 * p;
    if (fill.current) fill.current.intensity = 0.34 * p;
    if (ambient.current) ambient.current.intensity = 0.46 * p;
    if (!group?.visible) return;

    const target = on ? state.wallSeparation : 0;
    const selected = on ? state.wallLayer : null;
    // A closed wall has no layers to point at, so the flags go with them.
    const spread = THREE.MathUtils.clamp((separation.current[layers.length - 1] - 0.1) / 0.3, 0, 1);

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const node = groups.current[i];
      if (!node) continue;

      // Outer layers trail the inner ones: the stack comes apart in order,
      // the way it would if you lifted it off by hand.
      const rate = 5.6 - i * 0.6;
      const boost = selected === layer.key ? 0.15 : 0;
      const wanted = selected === null ? 1 : selected === layer.key ? 1 : 0.14;

      if (reduced) {
        separation.current[i] = target;
        lift.current[i] = boost;
        emphasis.current[i] = wanted;
      } else {
        separation.current[i] += (target - separation.current[i]) * (1 - Math.exp(-rate * dt));
        lift.current[i] += (boost - lift.current[i]) * (1 - Math.exp(-7 * dt));
        emphasis.current[i] += (wanted - emphasis.current[i]) * (1 - Math.exp(-5.5 * dt));
      }

      const z = layer.travel * separation.current[i] + lift.current[i];
      node.position.z = z;
      setLayerEmphasis(layer.key, emphasis.current[i] * p + (1 - p));

      // Project the label anchor for the DOM overlay.
      const proj = wallProjected[i];
      _v.set(layer.anchor[0] + ORIGIN[0], layer.anchor[1] + ORIGIN[1], layer.anchor[2] + ORIGIN[2] + z);
      _v.project(camera);
      const onScreen = _v.z < 1 && _v.x > -1.06 && _v.x < 1.06 && _v.y > -1.06 && _v.y < 1.06;
      proj.x = (_v.x * 0.5 + 0.5) * size.width;
      proj.y = (-_v.y * 0.5 + 0.5) * size.height;
      proj.visible = onScreen ? p * spread : 0;
    }
  });

  /* -- scene ------------------------------------------------------------- */

  const floorZ = layers[layers.length - 1].travel / 2 + ORIGIN[2];

  return (
    <group ref={root} visible={false}>
      <ambientLight ref={ambient} color="#27436b" intensity={0} />
      <directionalLight ref={key} position={[3.4, 5.2, 4.6]} color="#fff3e4" intensity={0} />
      <directionalLight ref={rim} position={[-4.6, 2.8, -3.8]} color="#8fb6ef" intensity={0} />
      <directionalLight ref={fill} position={[-3.2, 1.4, 4.2]} color="#cfe0ff" intensity={0} />

      {/* The floor dissolves into the backdrop rather than ending at an edge,
          with a low pool of light on it and the shadow the assembly sits in. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, floorZ]}>
        <circleGeometry args={[9.5, 48]} />
        <meshBasicMaterial color="#07172b" alphaMap={floorFade} transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, floorZ]} renderOrder={1}>
        <planeGeometry args={[6.2, 4.4]} />
        <meshBasicMaterial
          color="#3d6398"
          alphaMap={pool}
          transparent
          opacity={0.26}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.009, floorZ]} renderOrder={2}>
        <planeGeometry args={[4.2, 3.4]} />
        <meshBasicMaterial color="#01060d" alphaMap={shadow} transparent opacity={0.72} depthWrite={false} />
      </mesh>

      <group position={ORIGIN}>
        {layers.map((layer, i) => (
          <group
            key={layer.key}
            ref={(el) => {
              groups.current[i] = el;
            }}
            onClick={(e) => {
              if (e.delta > 6) return;
              e.stopPropagation();
              const state = getState();
              experience.selectWallLayer(state.wallLayer === layer.key ? null : layer.key);
            }}
          >
            {[...layer.parts.entries()].map(([name, geometry]) => {
              const material = (materials as unknown as Record<string, THREE.Material>)[name];
              if (!material) return null;
              return <mesh key={name} geometry={geometry} material={material} />;
            })}
            {layer.key === 'cladding' &&
              [...sashes.entries()].map(([name, geometry]) => (
                <mesh
                  key={name}
                  geometry={geometry}
                  material={(materials as unknown as Record<string, THREE.Material>)[name]}
                />
              ))}
          </group>
        ))}
      </group>
    </group>
  );
}
