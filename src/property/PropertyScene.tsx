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
import { createMaterials, setRenovation, setSidingColour, type HouseMaterials } from './materials/materials';
import { studioEnvironment } from './materials/textures';
import { projected } from './hotspotProjection';
import { hotspots } from './services';
import { experience, getState, useExperience } from './store';

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
          uHigh: { value: new THREE.Color('#c8d5e6').convertSRGBToLinear() },
          uHorizon: { value: new THREE.Color('#f6f1e8').convertSRGBToLinear() },
          uLow: { value: new THREE.Color('#ded7c9').convertSRGBToLinear() },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uHigh; uniform vec3 uHorizon; uniform vec3 uLow;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0
              ? mix(uHorizon, uHigh, pow(clamp(h * 1.9, 0.0, 1.0), 0.78))
              : mix(uHorizon, uLow, pow(clamp(-h * 3.0, 0.0, 1.0), 0.9));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
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

  return (
    <group>
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
  const sun = useRef<THREE.DirectionalLight>(null);
  const size = quality === 3 ? 2048 : quality === 2 ? 1536 : 1024;

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
    l.shadow.bias = -0.0007;
    l.shadow.normalBias = 0.035;
    l.target.position.set(-1, 2, -3);
    l.target.updateMatrixWorld();
  }, [size]);

  return (
    <>
      <hemisphereLight args={['#cfe0f5', '#b0a288', 0.52]} />
      <directionalLight
        ref={sun}
        position={[SUN.x, SUN.y, SUN.z]}
        intensity={2.45}
        color="#fff3e2"
        castShadow
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
      />
      {/* Bounce from the lawn and the driveway, no shadow cost. */}
      <directionalLight position={[-14, 7, -16]} intensity={0.38} color="#dfe6f2" />
      <directionalLight position={[-6, 2.5, 20]} intensity={0.22} color="#fdf3e4" />
    </>
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
  const split = useExperience((s) => s.split);
  const active = useExperience((s) => s.mode === 'transform');
  const ref = useRef({ split, active });
  ref.current = { split, active };

  useFrame(({ gl, scene, camera, size }) => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(1, Math.round(size.width * dpr));
    const h = Math.max(1, Math.round(size.height * dpr));

    if (!ref.current.active) {
      setRenovation(1);
      gl.setScissorTest(false);
      gl.setViewport(0, 0, w, h);
      gl.autoClear = true;
      gl.render(scene, camera);
      return;
    }

    const x = Math.round(THREE.MathUtils.clamp(ref.current.split, 0, 1) * w);
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

function Quality(): null {
  const gl = useThree((s) => s.gl);
  const samples = useRef<number[]>([]);
  const level = useRef<1 | 2 | 3>(3);
  const settled = useRef(0);

  useFrame((_, delta) => {
    settled.current += 1;
    if (settled.current < 40) return; // ignore warm-up and shader compilation
    samples.current.push(delta);
    if (samples.current.length < 60) return;
    const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
    samples.current.length = 0;
    if (avg > 0.026 && level.current > 1) {
      level.current = (level.current - 1) as 1 | 2;
      gl.setPixelRatio(level.current === 2 ? Math.min(devicePixelRatio, 1.25) : 1);
      gl.shadowMap.needsUpdate = true;
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

/** The finish chosen in the comparison panel repaints the renovated cladding. */
function Finish(): null {
  const colour = useExperience((s) => s.sidingColour);
  useEffect(() => setSidingColour(colour), [colour]);
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
      shadows
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
      }}
      camera={{ fov: 20, near: 0.6, far: 420, position: [24, 9, 34] }}
      onCreated={({ gl, scene, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        scene.fog = new THREE.Fog(new THREE.Color('#f2ece1'), 62, 190);
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
