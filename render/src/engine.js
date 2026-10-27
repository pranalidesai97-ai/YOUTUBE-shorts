import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function fsPass(frag, uniforms) {
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: frag, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene(); scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { mat, u: mat.uniforms, render(r, target) { r.setRenderTarget(target); r.render(scene, cam); } };
}

const MIX_FS = /* glsl */`
uniform sampler2D tA, tB; uniform float uMix; uniform int uType; uniform vec2 uC; uniform float uAspect;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
float fb(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.1; a*=.5; } return s; }
vec3 zoomBlur(sampler2D t, vec2 uv, vec2 c, float amt){
  vec3 acc = vec3(0.); float w = 0.;
  for (int i = 0; i < 12; i++){ float k = float(i)/11.; vec2 q = c + (uv - c) * (1.0 - amt * k); acc += texture2D(t, q).rgb; w += 1.; }
  return acc / w;
}
void main(){
  float m = uMix;
  if (uType == 0) { gl_FragColor = vec4(mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, m), 1.); return; }
  if (uType == 1) { // push-through: A zooms in and blurs, B settles from slightly larger
    vec2 ua = uC + (vUv - uC) / (1.0 + m * 1.6);
    vec2 ub = uC + (vUv - uC) / (1.0 + (1.0 - m) * 0.35);
    vec3 a = zoomBlur(tA, ua, uC, m * 0.25);
    vec3 b = zoomBlur(tB, ub, uC, (1.0 - m) * 0.18);
    float k = smoothstep(0.25, 0.75, m);
    vec3 flash = vec3(0.6,0.9,1.0) * 0.12 * sin(3.14159 * m);
    gl_FragColor = vec4(mix(a, b, k) + flash, 1.); return;
  }
  if (uType == 2) { // organic dissolve with cyan edge
    float d = fb(vUv * vec2(4.0, 4.0 / uAspect) + 2.0) * 0.8 + 0.2 * (1.0 - vUv.y);
    float e = m * 1.2 - 0.1;
    float k = smoothstep(e - 0.06, e + 0.06, d);
    float edge = smoothstep(0.07, 0.0, abs(d - e)) * step(0.01, m) * step(m, 0.99);
    vec3 col = mix(texture2D(tB, vUv).rgb, texture2D(tA, vUv).rgb, k) + vec3(0.25, 0.85, 1.0) * edge * 0.9;
    gl_FragColor = vec4(col, 1.); return;
  }
  if (uType == 3) { // pull-out: A recedes into B
    vec2 ua = uC + (vUv - uC) * (1.0 + m * 0.6);
    vec2 ub = uC + (vUv - uC) * (1.0 - (1.0 - m) * 0.45);
    vec3 a = zoomBlur(tA, ua, uC, -m * 0.06);
    vec3 b = zoomBlur(tB, ub, uC, (1.0 - m) * 0.2);
    gl_FragColor = vec4(mix(a, b, smoothstep(0.2, 0.8, m)), 1.); return;
  }
  // 4: vertical whip with motion blur
  vec3 acc = vec3(0.);
  float off = m;
  for (int i = 0; i < 10; i++){
    float s = off + (float(i)/9. - .5) * 0.12 * sin(3.14159*m);
    vec2 q = vUv + vec2(0., s);
    acc += q.y < 1.0 ? texture2D(tA, q).rgb : texture2D(tB, vec2(q.x, q.y - 1.0)).rgb;
  }
  gl_FragColor = vec4(acc / 10., 1.);
}`;

const DOF_FS = /* glsl */`
uniform sampler2D tColor, tDepth; uniform float uNear, uFar, uFocus, uAperture, uMaxBlur, uAspect;
varying vec2 vUv;
float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float coc(vec2 uv){ float z = lin(texture2D(tDepth, uv).r); return clamp(abs(z - uFocus) / z * uAperture, 0.0, uMaxBlur); }
void main(){
  float c0 = coc(vUv);
  vec3 acc = texture2D(tColor, vUv).rgb; float w = 1.0;
  const float GA = 2.39996;
  for (int i = 1; i < 28; i++){
    float r = sqrt(float(i) / 27.0);
    float a = float(i) * GA;
    vec2 o = vec2(cos(a), sin(a) * uAspect) * r * c0;
    vec2 q = vUv + o;
    float cs = coc(q);
    float wt = smoothstep(r * c0 - 0.002, r * c0 + 0.002, max(cs, c0 * 0.5));
    acc += texture2D(tColor, q).rgb * wt; w += wt;
  }
  gl_FragColor = vec4(acc / w, 1.0);
}`;

const FINAL_FS = /* glsl */`
uniform sampler2D tColor, tOver; uniform float uHasOver; uniform vec2 uTexel; uniform float uSharp; uniform float uExposure, uGrain, uVignette, uCA, uSeed, uSat, uFade; uniform vec3 uLift;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
  const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
  c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
}
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uSeed) * 43758.5453); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d * vec2(0.5625, 1.0), d * vec2(0.5625, 1.0));
  vec3 col;
  col.r = texture2D(tColor, vUv - d * uCA * r2).r;
  col.g = texture2D(tColor, vUv).g;
  col.b = texture2D(tColor, vUv + d * uCA * r2).b;
  vec3 blur = (texture2D(tColor, vUv + vec2(uTexel.x, 0.)).rgb + texture2D(tColor, vUv - vec2(uTexel.x, 0.)).rgb
             + texture2D(tColor, vUv + vec2(0., uTexel.y)).rgb + texture2D(tColor, vUv - vec2(0., uTexel.y)).rgb) * 0.25;
  col = max(col + (col - blur) * uSharp, 0.0);
  col *= uExposure;
  col = aces(col);
  float l = dot(col, vec3(0.2126,0.7152,0.0722));
  col = mix(vec3(l), col, uSat);
  col = col + uLift * (1.0 - col);
  col *= 1.0 - uVignette * smoothstep(0.08, 0.42, r2);
  col *= uFade;
  vec3 s = toSRGB(col);
  s += (h(vUv * 1000.0) - 0.5) * uGrain;
  s = clamp(s, 0.0, 1.0);
  if (uHasOver > 0.5) { vec4 o = texture2D(tOver, vUv); s = s * (1.0 - o.a) + o.rgb * o.a; }
  gl_FragColor = vec4(s, 1.0);
}`;

export class Engine {
  constructor(W, H, opts = {}) {
    this.W = W; this.H = H; this.opts = opts;
    const rs = opts.rs ?? 0.75; const RW = Math.round(W * rs), RH = Math.round(H * rs);
    this.RW = RW; this.RH = RH;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H);
    r.localClippingEnabled = true;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    const mk = (depth) => {
      const t = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, samples: opts.samples ?? 4 });
      if (depth) t.depthTexture = new THREE.DepthTexture(RW, RH, THREE.UnsignedIntType);
      return t;
    };
    this.rtShot = [mk(true), mk(true)];
    this.rtDof = [mk(false), mk(false)];
    this.rtMix = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType });
    this.mix = fsPass(MIX_FS, { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uType: { value: 0 }, uC: { value: new THREE.Vector2(.5, .5) }, uAspect: { value: W / H } });
    this.dof = fsPass(DOF_FS, { tColor: { value: null }, tDepth: { value: null }, uNear: { value: .1 }, uFar: { value: 100 }, uFocus: { value: 5 }, uAperture: { value: .02 }, uMaxBlur: { value: .02 }, uAspect: { value: W / H } });
    this.final = fsPass(FINAL_FS, { tColor: { value: null }, tOver: { value: null }, uHasOver: { value: 0 }, uExposure: { value: 1 }, uGrain: { value: .035 }, uVignette: { value: .55 }, uCA: { value: .012 }, uSeed: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / RW, 1 / RH) }, uSharp: { value: 0.35 }, uSat: { value: 1.05 }, uLift: { value: new THREE.Vector3(.004, .008, .018) }, uFade: { value: 1 } });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(RW, RH), 0.7, 0.5, 0.85);
    this.copy = fsPass('uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', { t: { value: null } });
  }

  renderShot(i, view) {
    const r = this.renderer;
    if (view.prepare) view.prepare();
    view.camera.aspect = this.W / this.H; view.camera.updateProjectionMatrix();
    r.setRenderTarget(this.rtShot[i]); r.setClearColor(0x000000, 1); r.clear();
    r.render(view.scene, view.camera);
    if (!view.dof || this.opts.nodof) return this.rtShot[i].texture;
    const u = this.dof.u;
    u.tColor.value = this.rtShot[i].texture; u.tDepth.value = this.rtShot[i].depthTexture;
    u.uNear.value = view.camera.near; u.uFar.value = view.camera.far;
    u.uFocus.value = view.dof.focus; u.uAperture.value = view.dof.aperture; u.uMaxBlur.value = view.dof.max ?? 0.018;
    this.dof.render(r, this.rtDof[i]);
    return this.rtDof[i].texture;
  }

  // views: [{scene,camera,dof?}], transition {type, m, c}
  setOverlay(canvas) {
    this.overTex = new THREE.CanvasTexture(canvas);
    this.overTex.minFilter = this.overTex.magFilter = THREE.LinearFilter; this.overTex.generateMipmaps = false;
    this.overTex.colorSpace = THREE.NoColorSpace;
    this.final.u.tOver.value = this.overTex; this.final.u.uHasOver.value = 1;
  }

  frame(views, trans, post) {
    const r = this.renderer;
    const ta = this.renderShot(0, views[0]);
    const tb = views[1] ? this.renderShot(1, views[1]) : ta;
    const mu = this.mix.u;
    mu.tA.value = ta; mu.tB.value = tb; mu.uMix.value = views[1] ? trans.m : 0; mu.uType.value = views[1] ? trans.type : 0;
    if (trans && trans.c) mu.uC.value.set(trans.c[0], trans.c[1]); else mu.uC.value.set(.5, .5);
    this.mix.render(r, this.rtMix);
    // bloom (UnrealBloomPass composites onto readBuffer in place)
    this.bloom.strength = post.bloom ?? 0.7; this.bloom.radius = post.bloomRadius ?? 0.5; this.bloom.threshold = post.bloomThreshold ?? 0.85;
    if (!this.opts.nobloom) this.bloom.render(r, null, this.rtMix, 0, false);
    const fu = this.final.u;
    fu.tColor.value = this.rtMix.texture;
    if (this.overTex) this.overTex.needsUpdate = true;
    fu.uExposure.value = post.exposure ?? 1; fu.uSeed.value = post.seed ?? 0; fu.uVignette.value = post.vignette ?? .55;
    fu.uSat.value = post.sat ?? 1.05; fu.uFade.value = post.fade ?? 1; fu.uCA.value = post.ca ?? .012;
    r.setViewport(0, 0, this.W, this.H);
    this.final.render(r, null);
  }
}
