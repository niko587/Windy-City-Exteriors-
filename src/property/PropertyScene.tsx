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
import { skyDomeMaterial, studioEnvironment, type SidingProfile } from './materials/textures';
import { applyLeafAtlas } from './materials/foliage';
import { projected } from './hotspotProjection';
import { Post } from './post';
import { hotspots } from './services';
import { experience, getState, useExperience } from './store';
import { WallAssembly } from './WallAssembly';
import { stagePresence } from './wallLayers';

const SUN = new THREE.Vector3(15.5, 19, 14.5);

/* -------------------------------------------------------------------------
   Backdrop: the sky the house is actually lit by.

   This was a studio gradient — a warm porcelain wash meant to put the house
   on a page rather than under weather. It was also the loudest remaining
   tell that the frame was a render: the windows reflected one sky, the
   environment map lit the walls with a second, and the dome behind the roof
   showed a third that had no sun in it at all.

   There is now one sky. `skyDomeMaterial()` is the same shader that
   `studioEnvironment` prefilters into the environment map and that the
   glazing samples for its reflections, so the cloud in the window is the
   cloud behind the house, and the light on the siding comes from the sky you
   can see above it. Its `uStageMix` drains the daylight to studio navy for
   the wall stage — the dome, the reflections and the image-based light all
   drain together, instead of the windows staying sunny while the room goes
   dark.
   ------------------------------------------------------------------------- */

function Backdrop(): React.JSX.Element {
  const material = useMemo(() => skyDomeMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.uniforms.uStageMix.value = stagePresence.value;
  });
  return (
    // 300, not 400. The camera's far plane is 420 and the camera itself
    // stands ~43 m out, so a 400 m dome puts its far side at 443 — past the
    // far plane, which clipped the top of the sky away along a dead straight
    // line and left the treeline standing against black. At 300 the whole
    // dome is inside the frustum from anywhere the tour goes, and it is still
    // twice as far away as the farthest tree.
    //
    // Segments raised from 24x16: the sun disc and its aureole are small
    // enough that a coarse dome quantises the horizon band around them.
    <mesh scale={300} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
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
    // The planting is alpha-cut cards now, so the two materials that shade it
    // need the leaf atlas the cards are cut from. Applied here rather than in
    // the material library because the atlas belongs to the geometry: it is
    // what `house.ts` builds the cards against, and nothing else uses it.
    applyLeafAtlas(mats.shrub as THREE.MeshStandardMaterial);
    applyLeafAtlas(mats.foliage as THREE.MeshStandardMaterial);
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
    // The sun is half a degree wide, so nothing it casts has a razor edge.
    // VSM is the only filter left in this version of three that gives a real
    // penumbra, and it is safe here because the map is rendered once and the
    // blur is paid for exactly four times in a session.
    l.shadow.radius = 3.4;
    l.shadow.blurSamples = 10;
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
      {/* Sky and ground bounce. */}
      <hemisphereLight args={['#bcd3f2', '#9d8f74', 0.34]} />
      <directionalLight
        ref={sun}
        position={[SUN.x, SUN.y, SUN.z]}
        intensity={3.35}
        color="#fff2de"
        castShadow
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
      />
      {/*
        Two weak bounces, where there used to be three strong ones.

        The old rig ran the sun at 2.32 against 1.44 of fill — a ratio under
        two to one, which is overcast light, not a sunny day. Outdoors the sun
        beats the sky by something closer to six to one, and that ratio is most
        of what the eye reads as daylight. The fill was that heavy because
        nothing was opening up the eaves and the reveals; screen-space
        occlusion does that now, and does it where the geometry actually is
        rather than by flooding the whole model.
      */}
      <directionalLight position={[-14, 7, -16]} intensity={0.2} color="#d3e0f6" />
      <directionalLight position={[-6, 2.5, 20]} intensity={0.12} color="#fdf3e4" />
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
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const quality = useExperience((s) => s.quality);
  const post = useMemo(() => new Post(), []);
  const clock = useRef(0);

  useEffect(() => () => post.dispose(), [post]);
  useEffect(() => {
    post.setSize(size.width, size.height, gl.getPixelRatio());
  }, [post, gl, size]);
  useEffect(() => post.setQuality(quality), [post, quality]);

  useFrame(({ scene, camera }, delta) => {
    const { split, mode } = getState();
    // Logical pixels, not device pixels: three multiplies the viewport and the
    // scissor by the pixel ratio itself. Passing device pixels here scales the
    // frame by the ratio squared, which is invisible at dpr 1 and wrecks the
    // comparison on every retina screen.
    const w = size.width;
    const h = size.height;

    // Everything lands in the post target rather than on the canvas, so the
    // occlusion and the grade see the finished frame and the two halves of the
    // comparison are treated identically.
    gl.setRenderTarget(post.color);
    gl.setViewport(0, 0, w, h);

    if (mode !== 'transform') {
      setRenovation(1);
      gl.setScissorTest(false);
      gl.autoClear = true;
      gl.render(scene, camera);
    } else {
      const x = THREE.MathUtils.clamp(split, 0, 1) * w;
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
    }

    clock.current += delta;
    post.render(gl, camera as THREE.PerspectiveCamera, clock.current * 60);
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
         three has removed. Variance shadow maps are what is left that has a
         penumbra, and the scene is static, so the blur is rendered once. */
      shadows={{ type: THREE.VSMShadowMap }}
      dpr={quality === 3 ? [1, 1.75] : quality === 2 ? [1, 1.25] : 1}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
      }}
      camera={{ fov: 20, near: 0.6, far: 420, position: [24, 9, 34] }}
      onCreated={({ gl, scene, camera }) => {
        // The grade lives in `post.ts` now. Tone mapping here would compress
        // the frame before the occlusion and the bloom ever see it, and both
        // of those have to work on linear light to mean anything.
        gl.toneMapping = THREE.NoToneMapping;
        // Aerial perspective, and it has to agree with the sky. This was a
        // warm cream matched to the old studio backdrop; against a real sky it
        // laid a beige wash over the far lawn and bleached the treeline to a
        // ghost, which is most of what made the distance read as fog rather
        // than as distance. The colour below tone-maps to roughly what the
        // dome renders just above the horizon, and the range starts past the
        // property line so the site itself is never touched.
        scene.fog = new THREE.Fog(new THREE.Color('#c3d4e8'), 75, 215);
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
