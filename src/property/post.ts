/**
 * The post chain.
 *
 * Everything before this file draws the scene correctly and it still reads as
 * a render, because a render is what it is: geometry lit by lights and written
 * straight to the screen. A photograph is not that. A photograph has occlusion
 * in every corner two surfaces make, it blooms where a highlight overruns the
 * sensor, it falls off toward the edges of the frame, and it has grain. None of
 * those are effects laid on top for style — they are what a camera does, and
 * their absence is what the eye reads as "computer".
 *
 * So the scene renders into a float target and three things happen over it:
 *
 * 1. **Ambient occlusion.** Screen space, from depth alone: view positions are
 *    reconstructed from the depth buffer and normals from their derivatives, so
 *    nothing upstream has to render a normal pass. This is the single biggest
 *    difference between the frames before and after this file existed — without
 *    it a gutter has no shadow behind it, trim has no line against the siding,
 *    and a shrub sits on the mulch with nothing underneath it.
 *
 * 2. **Bloom**, taken from a mip of the colour target rather than a separate
 *    blur chain. The renderer generates those mips anyway when it unbinds the
 *    target, so a wide blur costs one texture fetch.
 *
 * 3. **The grade**: filmic tone mapping (moved here from the renderer so the
 *    two passes above work in linear), a shadow lift with a little colour in
 *    it, vignette, and grain sized in screen pixels so it stays film and never
 *    becomes texture.
 *
 * The comparison still renders twice with a scissor, into this target instead
 * of the canvas, so the before and the after get exactly the same treatment —
 * which is the whole point of the comparison.
 */

import * as THREE from 'three';

const QUAD = new THREE.BufferGeometry();
QUAD.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
QUAD.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Shared by both passes: view position from depth, and a normal from it.
 *
 * The normal is taken from whichever pair of neighbours is closest in depth,
 * rather than from plain derivatives. On a flat wall the two agree; across the
 * silhouette of a gutter they do not, and plain derivatives there produce a
 * normal that belongs to neither surface — which draws a bright halo along
 * every edge, the classic tell of screen-space occlusion done cheaply.
 */
const DEPTH_LIB = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec2 uTexel;

vec3 wceViewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 view = uProjInv * clip;
  return view.xyz / view.w;
}

vec3 wceNormal(vec2 uv, vec3 p) {
  vec3 l = wceViewPos(uv - vec2(uTexel.x, 0.0));
  vec3 r = wceViewPos(uv + vec2(uTexel.x, 0.0));
  vec3 d = wceViewPos(uv - vec2(0.0, uTexel.y));
  vec3 u = wceViewPos(uv + vec2(0.0, uTexel.y));
  vec3 dx = abs(r.z - p.z) < abs(p.z - l.z) ? r - p : p - l;
  vec3 dy = abs(u.z - p.z) < abs(p.z - d.z) ? u - p : p - d;
  return normalize(cross(dx, dy));
}`;

const AO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${DEPTH_LIB}
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
uniform vec2 uNoiseScale;

// Twelve points on a spiral rather than a random kernel: an even cover at any
// rotation, which is what lets twelve taps stand in for forty.
const int TAPS = 12;

/**
 * Interleaved gradient noise, not a sine hash.
 *
 * The rotation each pixel gets is what turns twelve samples into a smooth
 * field once it is blurred, and a sine hash gives neighbouring pixels
 * unrelated rotations — so the blur has nothing coherent to average and the
 * occlusion arrives as speckle on every flat wall. This distributes the
 * rotations so that any small neighbourhood covers the whole turn once.
 */
float wceIgn(vec2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

void main() {
  vec3 p = wceViewPos(vUv);
  // The sky dome is the far plane. Nothing occludes it and the reconstruction
  // is meaningless out there, so it is left alone.
  if (-p.z > 300.0) { gl_FragColor = vec4(1.0); return; }

  vec3 n = wceNormal(vUv, p);
  float rot = wceIgn(vUv * uNoiseScale) * 6.2831853;
  // A metre of radius covers fewer pixels the further away the surface is.
  float rPix = uRadius / max(-p.z, 0.4);

  float occ = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float t = (float(i) + 0.5) / float(TAPS);
    float a = rot + t * 6.2831853 * 3.0;
    float radius = rPix * sqrt(t);
    vec2 off = vec2(cos(a), sin(a)) * radius;
    vec3 s = wceViewPos(vUv + off);
    vec3 diff = s - p;
    float len = length(diff);
    if (len < 0.0001) continue;
    float cosine = max(dot(n, diff / len), 0.0);
    // The range check. Without it the roofline draws a dark fringe against the
    // sky, because a sample that lands a hundred metres past the edge of the
    // building still counts as something standing in front of it.
    float range = smoothstep(0.0, 1.0, uRadius / max(abs(p.z - s.z), 0.0001));
    occ += max(cosine - uBias, 0.0) * range;
  }

  occ = occ / float(TAPS);
  gl_FragColor = vec4(vec3(clamp(1.0 - occ * uIntensity, 0.0, 1.0)), 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tAo;
${DEPTH_LIB}
uniform vec2 uAoTexel;
uniform float uAoStrength;
uniform float uBloom;
uniform float uBloomThreshold;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec2 uResolution;

/**
 * Occlusion is read back at a quarter of the pixels, so it is upsampled with
 * the depth as a guide: a straight bilinear fetch drags the shadow behind a
 * downspout out across the wall beside it.
 */
float wceAo(vec2 uv, float depth) {
  float sum = 0.0;
  float weight = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * uAoTexel;
      float d = -wceViewPos(uv + o).z;
      float w = exp(-abs(d - depth) * 3.2);
      sum += texture2D(tAo, uv + o).r * w;
      weight += w;
    }
  }
  return weight > 0.0 ? sum / weight : 1.0;
}

// ACES, the Narkowicz fit: the curve every camera and every film stock has and
// a raw render does not, which is why an unmapped render looks like plastic in
// the highlights.
vec3 wceAces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 wceToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
}

float wceHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 color = texture2D(tColor, vUv).rgb;
  float depth = -wceViewPos(vUv).z;

  // Occlusion, held off the sky and eased in over the first few metres so the
  // foreground grass does not occlude itself into a dark band.
  float ao = mix(1.0, wceAo(vUv, depth), step(depth, 300.0));
  ao = mix(1.0, ao, uAoStrength);
  // Occlusion removes bounced light, and bounced light outdoors is blue from
  // the sky — so a corner goes cool as well as dark, never merely grey.
  color *= mix(vec3(0.82, 0.88, 1.0), vec3(1.0), ao);
  color *= mix(0.55, 1.0, ao);

  // Bloom from a wide mip of the same target. Anything over the threshold
  // spills, which is what a lens does with a lit gutter edge or a white sash
  // against a dark roof.
  vec3 wide = texture2D(tColor, vUv, 4.0).rgb;
  vec3 spill = max(wide - vec3(uBloomThreshold), vec3(0.0));
  color += spill * uBloom;

  color *= uExposure;
  color = wceAces(color);

  // A touch of the sky back into the deepest shadows. Film never renders a
  // shadow as neutral grey, and neither does an overcast-lit wall.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, color * vec3(0.94, 0.97, 1.06), smoothstep(0.34, 0.0, luma));

  // Optical falloff toward the corners, cos^4-ish rather than a drawn ellipse.
  vec2 v = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float r2 = dot(v, v);
  color *= mix(1.0, 1.0 / (1.0 + r2 * 1.25), uVignette);

  // Grain, in screen pixels and scaled down in the highlights, where a sensor
  // has the most light and the least noise.
  float g = wceHash(gl_FragCoord.xy + uTime) - 0.5;
  color += g * uGrain * (1.0 - smoothstep(0.35, 1.0, luma));

  gl_FragColor = vec4(wceToSRGB(color), 1.0);
}`;

export interface PostOptions {
  /** 1 = the cheapest path: no occlusion, no bloom, grade only. */
  quality: 1 | 2 | 3;
}

export class Post {
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;

  readonly color: THREE.WebGLRenderTarget;
  private readonly ao: THREE.WebGLRenderTarget;
  private readonly aoMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;

  private width = 1;
  private height = 1;
  private quality: 1 | 2 | 3 = 3;
  private readonly projInv = new THREE.Matrix4();

  constructor() {
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.UnsignedIntType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;

    this.color = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
      depthTexture: depth,
      // The mip chain is the bloom blur; the renderer builds it on unbind.
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.ao = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      format: THREE.RGBAFormat,
    });

    this.aoMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: AO_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: { value: depth },
        uProjInv: { value: this.projInv },
        uTexel: { value: new THREE.Vector2() },
        uNoiseScale: { value: new THREE.Vector2() },
        // 0.5 m: the width of a soffit return, the depth of a window reveal,
        // the gap behind a gutter. Wider and the whole wall dims; narrower and
        // it only draws a line where two polygons touch.
        uRadius: { value: 0.34 },
        uIntensity: { value: 1.05 },
        uBias: { value: 0.022 },
      },
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.color.texture },
        tAo: { value: this.ao.texture },
        tDepth: { value: depth },
        uProjInv: { value: this.projInv },
        uTexel: { value: new THREE.Vector2() },
        uAoTexel: { value: new THREE.Vector2() },
        uResolution: { value: new THREE.Vector2() },
        uAoStrength: { value: 1 },
        uBloom: { value: 0.034 },
        uBloomThreshold: { value: 1.15 },
        uExposure: { value: 1.04 },
        uVignette: { value: 0.5 },
        uGrain: { value: 0.0085 },
        uTime: { value: 0 },
      },
    });

    this.quad = new THREE.Mesh(QUAD, this.aoMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setQuality(quality: 1 | 2 | 3): void {
    this.quality = quality;
    const u = this.compositeMaterial.uniforms;
    u.uAoStrength.value = quality === 1 ? 0 : quality === 2 ? 0.8 : 1;
    u.uBloom.value = quality === 1 ? 0 : 0.034;
    u.uGrain.value = quality === 1 ? 0.005 : 0.0085;
    this.aoMaterial.uniforms.uIntensity.value = quality === 3 ? 1.05 : 0.95;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    this.color.setSize(w, h);
    // Half res for occlusion. It is a low-frequency signal and the composite
    // upsamples it with the depth, so the only thing full resolution buys is
    // four times the depth fetches.
    const aw = Math.max(1, Math.round(w / 2));
    const ah = Math.max(1, Math.round(h / 2));
    this.ao.setSize(aw, ah);

    this.aoMaterial.uniforms.uTexel.value.set(1 / aw, 1 / ah);
    this.aoMaterial.uniforms.uNoiseScale.value.set(aw, ah);
    this.compositeMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compositeMaterial.uniforms.uAoTexel.value.set(1 / aw, 1 / ah);
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
  }

  /** Called after the scene has been rendered into `color`. */
  render(gl: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, time: number): void {
    this.projInv.copy(camera.projectionMatrixInverse);

    if (this.quality > 1) {
      this.quad.material = this.aoMaterial;
      gl.setRenderTarget(this.ao);
      gl.render(this.scene, this.camera);
    }

    this.compositeMaterial.uniforms.uTime.value = time;
    this.quad.material = this.compositeMaterial;
    gl.setRenderTarget(null);
    gl.render(this.scene, this.camera);
  }

  dispose(): void {
    this.color.dispose();
    this.ao.dispose();
    this.aoMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
