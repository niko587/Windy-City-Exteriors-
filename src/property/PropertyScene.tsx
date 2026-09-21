/**
 * The WebGL layer: scene, light rig, static shadows, and the split renderer
 * that makes the siding comparison possible.
 *
 * The comparison is not two models, two images or a colour toggle. It is the
 * same scene drawn twice in one frame through a scissor rectangle, with a
 * single shared uniform switched between the passes. Camera, geometry, light,
 * shadows, environment and framing are therefore identical by construction —
 * there is no way for the two halves to drift apart.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { buildProperty } from './build/house';
import {
  createMaterials,
  setRenovation,
  setSidingColour,
  setSidingProfile,
  type HouseMaterials,
} from './materials/materials';
import { studioEnvironment, type SidingProfile } from './materials/textures';
import { projected } from './hotspotProjection';
import { hotspots } from './services';
import { experience, getState, useExperience } from './store';
import { WallAssembly } from './WallAssembly';
import { stagePresence } from './wallLayers';

const SUN = new THREE.Vector3(15.5, 19, 14.5);

/* -------------------------------------------------------------------------
   Backdrop: a studio gradient rather than a sky. The reference's ground is
   warm porcelain, and the house should sit on the page, not under a blue sky.
   ------------------------------------------------------------------------- */

function Backdrop(): React.JSX.Element {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHigh: { value: new THREE.Color('#9fb8da').convertSRGBToLinear() },
          uHorizon: { value: new THREE.Color('#f7f2ea').convertSRGBToLinear() },
          uLow: { value: new THREE.Color('#e4ddd0').convertSRGBToLinear() },
          // The daylight sky drains to a studio navy as the wall stage takes over.
          uStageHigh: { value: new THREE.Color('#050f1e').convertSRGBToLinear() },
          uStageHorizon: { value: new THREE.Color('#102943').convertSRGBToLinear() },
          uStageLow: { value: new THREE.Color('#03080f').convertSRGBToLinear() },
          uStage: { value: 0 },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uHigh; uniform vec3 uHorizon; uniform vec3 uLow;
          uniform vec3 uStageHigh; uniform vec3 uStageHorizon; uniform vec3 uStageLow;
          uniform float uStage;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 high = mix(uHigh, uStageHigh, uStage);
            vec3 horizon = mix(uHorizon, uStageHorizon, uStage);
            vec3 low = mix(uLow, uStageLow, uStage);
            vec3 c = h > 0.0
              ? mix(horizon, high, pow(clamp(h * 1.35, 0.0, 1.0), 0.62))
              : mix(horizon, low, pow(clamp(-h * 3.4, 0.0, 1.0), 0.95));
            // A little extra warmth low in the west, where the sun sits.
            float glow = smoothstep(0.55, 1.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), vec3(0.72, 0.0, 0.69)));
            c += glow * (1.0 - abs(h)) * vec3(0.045, 0.026, 0.004) * (1.0 - uStage);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.uniforms.uStage.value = stagePresence.value;
  });
  return (
    <mesh scale={400} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 24, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/* -------------------------------------------------------------------------
   The property itself
   ------------------------------------------------------------------------- */

const NO_SHADOW = new Set(['lawn', 'flatwork', 'mulch']);

function Property({ onBuilt }: { onBuilt: (triangles: number) => void }): React.JSX.Element {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const root = useRef<THREE.Group>(null);

  const { geometries, materials, triangles } = useMemo(() => {
    const env = studioEnvironment(gl);
    scene.environment = env;
    const mats = createMaterials(env) as HouseMaterials & Record<string, THREE.Material>;
    const built = buildProperty();
    return { geometries: built.geometries, materials: mats, triangles: built.triangles };
  }, [gl, scene]);

  useEffect(() => {
    onBuilt(triangles);
  }, [onBuilt, triangles]);

  useEffect(
    () => () => {
      for (const g of geometries.values()) g.dispose();
    },
    [geometries],
  );

  // The house leaves as the stage arrives; the swap happens behind the veil,
  // at the moment it is fully opaque.
  useFrame(() => {
    const g = root.current;
    if (g) g.visible = stagePresence.value < 0.5;
  });

  return (
    <group ref={root}>
      {[...geometries.entries()].map(([key, geometry]) => {
        const material = materials[key];
        if (!material) return null;
        return (
          <mesh
            key={key}
            geometry={geometry}
            material={material}
            castShadow={!NO_SHADOW.has(key)}
            receiveShadow
          />
        );
      })}
    </group>
  );
}

/* -------------------------------------------------------------------------
   Lighting
   ------------------------------------------------------------------------- */

function Lighting({ quality }: { quality: 1 | 2 | 3 }): React.JSX.Element {
  const gl = useThree((s) => s.gl);
  const sun = useRef<THREE.DirectionalLight>(null);
  const rig = useRef<THREE.Group>(null);
  const size = quality === 3 ? 3072 : quality === 2 ? 2048 : 1024;

  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    // A tight ortho frustum around the property keeps texel density high at a
    // modest map size — cheaper and crisper than a large loose one.
    const c = l.shadow.camera;
    c.left = -19;
    c.right = 19;
    c.top = 17;
    c.bottom = -13;
    c.near = 6;
    c.far = 72;
    c.updateProjectionMatrix();
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.028;
    l.target.position.set(-1, 2, -3);
    l.target.updateMatrixWorld();
    // The map is only ever resized during a shadow render, and shadow renders
    // are frozen. Asking for one here — after React has written the new map
    // size, and before the next frame — is what makes a quality drop actually
    // release the old render target instead of leaving the filter reading a
    // texel size the texture no longer has.
    gl.shadowMap.needsUpdate = true;
  }, [gl, size]);

  // Daylight has no business on the assembly stage, so the whole rig dims out
  // of it rather than being switched off at a threshold.
  useFrame(() => {
    const g = rig.current;
    if (!g) return;
    const daylight = 1 - stagePresence.value;
    g.visible = daylight > 0.004;
    for (const child of g.children) {
      if (!(child instanceof THREE.Light)) continue;
      const light = child as THREE.Light & { userData: { base?: number } };
      if (light.userData.base === undefined) light.userData.base = light.intensity;
      light.intensity = light.userData.base * daylight;
    }
  });

  return (
    <group ref={rig}>
      {/* Sky and ground bounce. Carries the shadow side, so the dark faces stay
          readable without flattening the whole model. */}
      <hemisphereLight args={['#c4d8f4', '#a99a7e', 0.56]} />
      <directionalLight
        ref={sun}
        position={[SUN.x, SUN.y, SUN.z]}
        intensity={2.32}
        color="#fff1dd"
        castShadow
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
      />
      {/* Bounce from the lawn and the driveway, no shadow cost. The rear one
          separates the roof from the sky; the front one opens up the eaves. */}
      <directionalLight position={[-14, 7, -16]} intensity={0.42} color="#dbe4f4" />
      <directionalLight position={[-6, 2.5, 20]} intensity={0.26} color="#fdf3e4" />
      <directionalLight position={[2, 14, -22]} intensity={0.2} color="#eef3ff" />
    </group>
  );
}

/** Nothing in the scene moves, so the shadow map is rendered once, not 120×/s. */
function StaticShadows(): null {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    if (frames.current < 4) {
      frames.current += 1;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
}

/* -------------------------------------------------------------------------
   Split renderer
   ------------------------------------------------------------------------- */

function SplitRenderer(): null {
  useFrame(({ gl, scene, camera, size }) => {
    const { split, mode } = getState();
    // Logical pixels, not device pixels: three multiplies the viewport and the
    // scissor by the pixel ratio itself. Passing device pixels here scales the
    // frame by the ratio squared, which is invisible at dpr 1 and wrecks the
    // comparison on every retina screen.
    const w = size.width;
    const h = size.height;

    if (mode !== 'transform') {
      setRenovation(1);
      gl.setScissorTest(false);
      gl.setViewport(0, 0, w, h);
      gl.autoClear = true;
      gl.render(scene, camera);
      return;
    }

    const x = THREE.MathUtils.clamp(split, 0, 1) * w;
    gl.setViewport(0, 0, w, h);
    gl.setScissorTest(false);
    gl.autoClear = true;
    gl.clear();
    gl.autoClear = false;
    gl.setScissorTest(true);

    if (x > 0) {
      setRenovation(0);
      gl.setScissor(0, 0, x, h);
      gl.render(scene, camera);
    }
    if (x < w) {
      setRenovation(1);
      gl.setScissor(x, 0, w - x, h);
      gl.render(scene, camera);
    }

    gl.setScissorTest(false);
    gl.autoClear = true;
  }, 1);

  return null;
}

/* -------------------------------------------------------------------------
   Adaptive quality — drop resolution before dropping frames.
   ------------------------------------------------------------------------- */

/** `?stills=1` pins full quality for the gallery capture in `scripts/`. */
function pinnedQuality(): boolean {
  return typeof location !== 'undefined' && location.search.includes('stills');
}

function Quality(): null {
  const samples = useRef<number[]>([]);
  const level = useRef<1 | 2 | 3>(3);
  const settled = useRef(0);

  useFrame((_, delta) => {
    if (pinnedQuality()) return;
    settled.current += 1;
    if (settled.current < 40) return; // ignore warm-up and shader compilation
    // Clamped, or one tab switch or one long garbage collection poisons the
    // mean and downgrades the session permanently for no reason.
    samples.current.push(Math.min(delta, 0.05));
    if (samples.current.length < 60) return;
    const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
    samples.current.length = 0;
    // Resolution follows `quality` through the canvas rather than being set on
    // the renderer here, so a resize cannot quietly restore it.
    if (avg > 0.026 && level.current > 1) {
      level.current = (level.current - 1) as 1 | 2;
      experience.setQuality(level.current);
    }
  });
  return null;
}

/** Projects the architectural hotspot anchors for the DOM overlay. */
const anchors = hotspots.map((h) => new THREE.Vector3(...h.at));
const normals = hotspots.map((h) => new THREE.Vector3(...h.facing).normalize());
const _v = new THREE.Vector3();
const _toCamera = new THREE.Vector3();

function HotspotProjector(): null {
  useFrame(({ camera, size }) => {
    for (let i = 0; i < anchors.length; i++) {
      _v.copy(anchors[i]);
      _toCamera.copy(camera.position).sub(_v).normalize();
      const facing = _toCamera.dot(normals[i]);
      const distance = camera.position.distanceTo(anchors[i]);

      _v.project(camera);
      const inFront = _v.z < 1;
      const onScreen = _v.x > -1.12 && _v.x < 1.12 && _v.y > -1.12 && _v.y < 1.12;

      const p = projected[i];
      p.x = (_v.x * 0.5 + 0.5) * size.width;
      p.y = (-_v.y * 0.5 + 0.5) * size.height;
      // Fade in over the last 25° rather than popping at the silhouette edge.
      p.visible = inFront && onScreen ? THREE.MathUtils.smoothstep(facing, 0.04, 0.34) : 0;
      p.scale = THREE.MathUtils.clamp(1.25 - distance / 90, 0.82, 1.12);
    }
  }, 2);
  return null;
}

/** The finish and profile chosen in the studio repaint the renovated cladding. */
function Finish(): null {
  const colour = useExperience((s) => s.sidingColour);
  const profile = useExperience((s) => s.sidingProfile);
  useEffect(() => setSidingColour(colour), [colour]);
  useEffect(() => setSidingProfile(profile as SidingProfile), [profile]);
  return null;
}

function ContextGuard(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      experience.fail();
    };
    el.addEventListener('webglcontextlost', lost);
    return () => el.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  return null;
}

/* -------------------------------------------------------------------------
   Canvas
   ------------------------------------------------------------------------- */

export interface PropertySceneProps {
  onBuilt: (triangles: number) => void;
}

export default function PropertyScene({ onBuilt }: PropertySceneProps): React.JSX.Element {
  const quality = useExperience((s) => s.quality);
  const reduced = useExperience((s) => s.reducedMotion);

  return (
    <Canvas
      /* R3F's bare `shadows` asks for PCFSoftShadowMap, which this version of
         three has removed; it silently falls back to PCF and warns three
         times a session. Asking for what we actually get is quieter and no
         different on screen. */
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={quality === 3 ? [1, 1.75] : quality === 2 ? [1, 1.25] : 1}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
      }}
      camera={{ fov: 20, near: 0.6, far: 420, position: [24, 9, 34] }}
      onCreated={({ gl, scene, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.03;
        scene.fog = new THREE.Fog(new THREE.Color('#eee8dc'), 58, 178);
        camera.lookAt(0, 3, -2);
        gl.domElement.tabIndex = 0;
        gl.domElement.setAttribute('aria-label', 'Interactive property model. Drag to orbit, arrow keys to rotate.');
        gl.domElement.style.outlineOffset = '-3px';
        // The build is synchronous and heavy; let the first frame land before
        // the opening sequence starts so it never begins mid-stutter.
        requestAnimationFrame(() => requestAnimationFrame(() => experience.ready(reduced)));
      }}
    >
      <Backdrop />
      <Lighting quality={quality} />
      <Property onBuilt={onBuilt} />
      <WallAssembly />
      <StaticShadows />
      <CameraRig />
      <SplitRenderer />
      <HotspotProjector />
      <Finish />
      <Quality />
      <ContextGuard />
    </Canvas>
  );
}

export { getState as getPropertyState };
