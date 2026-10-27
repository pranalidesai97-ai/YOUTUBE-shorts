import * as THREE from 'three';
import { camPath } from './campath.js';
import { prog, ease, lerp, rng, clamp, pixelTex, fbm } from './util.js';

const AX = 1.05, AY = 1.7, AZ = 1.0;   // potato semi-axes (long axis vertical for portrait)
const DELTA = 0.3;                     // illustrative penetration depth (fraction-of-radius scale)

function h3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function n3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
// radial displacement factor for a unit direction
const bumpy = (x, y, z) => 1 + 0.055 * (n3(x * 1.6 + 3, y * 1.6, z * 1.6) - 0.5) * 2 + 0.018 * (n3(x * 5, y * 5 + 7, z * 5) - 0.5) * 2;

export function createPotato(env, A) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.1, 200);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { uWarm: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uWarm; varying vec3 vP; void main(){
      float g = smoothstep(-0.4, 0.6, vP.y);
      vec3 c = mix(vec3(0.004,0.007,0.016), mix(vec3(0.02,0.04,0.08), vec3(0.07,0.035,0.012), uWarm), g * 0.8);
      gl_FragColor = vec4(c, 1.); }`,
  }));
  scene.add(dome);

  // ---- potato halves
  const geo = new THREE.SphereGeometry(1, 160, 120);
  { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const b = bumpy(x, y, z); p.setXYZ(i, x * AX * b, y * AY * b, z * AZ * b); } geo.computeVertexNormals(); }
  const clipBack = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const clipFront = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const skinBack = new THREE.MeshStandardMaterial({ map: A.potatoSkin, bumpMap: A.potatoBump, bumpScale: 1.5, roughness: 0.72, envMapIntensity: 0.8, clippingPlanes: [clipBack] });
  const skinFront = skinBack.clone(); skinFront.clippingPlanes = [clipFront]; skinFront.transparent = true;
  const backHalf = new THREE.Group(), frontHalf = new THREE.Group();
  scene.add(backHalf); scene.add(frontHalf);
  backHalf.add(new THREE.Mesh(geo, skinBack));
  frontHalf.add(new THREE.Mesh(geo, skinFront));

  // ---- cap (cut face) with per-vertex depth below the skin
  const NA = 220, NR = 46;
  const outline = [];
  for (let i = 0; i < NA; i++) { const a = i / NA * Math.PI * 2, x = Math.cos(a), y = Math.sin(a); const b = bumpy(x, y, 0); outline.push([x * AX * b, y * AY * b]); }
  const distToOutline = (px, py) => {
    let best = 1e9;
    for (let i = 0; i < NA; i++) {
      const [ax, ay] = outline[i], [bx, by] = outline[(i + 1) % NA];
      const dx = bx - ax, dy = by - ay; const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
      const ex = ax + dx * t - px, ey = ay + dy * t - py; best = Math.min(best, ex * ex + ey * ey);
    }
    return Math.sqrt(best);
  };
  const capPos = [], capDepth = [], capUv = [], idx = [];
  capPos.push(0, 0, 0); capDepth.push(distToOutline(0, 0)); capUv.push(0.5, 0.5);
  for (let r = 1; r <= NR; r++) {
    const f = r / NR;
    for (let i = 0; i < NA; i++) {
      const [ox, oy] = outline[i]; const x = ox * f * 1.004, y = oy * f * 1.004;
      capPos.push(x, y, 0); capDepth.push(r === NR ? 0 : distToOutline(x, y)); capUv.push(x / 4 + .5, y / 4 + .5);
    }
  }
  for (let i = 0; i < NA; i++) idx.push(0, 1 + i, 1 + (i + 1) % NA);
  for (let r = 1; r < NR; r++) for (let i = 0; i < NA; i++) {
    const a = 1 + (r - 1) * NA + i, b = 1 + (r - 1) * NA + (i + 1) % NA, c = 1 + r * NA + i, d = 1 + r * NA + (i + 1) % NA;
    idx.push(a, c, b, b, c, d);
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  capGeo.setAttribute('depth', new THREE.Float32BufferAttribute(capDepth, 1));
  capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(capUv, 2));
  capGeo.setIndex(idx); capGeo.computeVertexNormals();
  const flesh = pixelTex(512, 512, (u, v) => {
    const n = fbm(u * 24, v * 24, 24, 4, 81), m = fbm(u * 90, v * 90, 90, 2, 83);
    const b = 0.9 + n * 0.08 + (m > 0.72 ? 0.025 : 0);
    return [244 * b, 224 * b, 168 * b];
  });
  const CU = { uE: { value: 0 }, uHeat: { value: 0 }, uFront: { value: 0 }, uPhase: { value: 0 }, uCold: { value: 0 } };
  const capMat = new THREE.MeshStandardMaterial({ map: flesh, roughness: 0.55, envMapIntensity: 0.5 });
  capMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, CU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float depth; varying float vD;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvD = depth;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uE, uHeat, uFront, uPhase, uCold; varying float vD;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float d = vD;
        // microwave energy: absorbed mostly in an outer band, decaying with depth
        float absorb = exp(-d / ${DELTA.toFixed(3)});
        float crest = pow(0.5 + 0.5 * cos(-18.0 * d + uPhase), 10.0) * absorb;
        vec3 eCol = mix(vec3(0.42, 0.28, 1.0), vec3(0.2, 0.75, 1.0), crest);
        // heat: conducted inward from the warm outer region
        float T = smoothstep(uFront + 0.16, uFront - 0.1, d) * uHeat;
        T = max(T, absorb * uHeat * 0.9);
        vec3 hCol = mix(vec3(1.0, 0.6, 0.18), vec3(1.0, 0.36, 0.1), smoothstep(0.3, 0.95, T * (1.0 - d)));
        float cold = (1.0 - T) * uCold;
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.78, 0.88, 1.0), cold * 0.55);
        diffuseColor.rgb *= 1.0 - 0.25 * max(uE, uHeat);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.4, 0.12), T * 0.55);
        totalEmissiveRadiance += eCol * (absorb * 0.2 + crest * 0.8) * uE + hCol * T * 0.32;`);
  };
  capMat.customProgramCacheKey = () => 'potatocap';
  const cap = new THREE.Mesh(capGeo, capMat); backHalf.add(cap);
  const capF = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ map: flesh, roughness: 0.55, transparent: true, side: THREE.BackSide }));
  frontHalf.add(capF);

  // ---- incoming wavefronts outside the potato (glow plane just behind the cut face)
  const WU = { uE: { value: 0 }, uPhase: { value: 0 } };
  const waves = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), new THREE.ShaderMaterial({
    uniforms: WU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uE, uPhase; varying vec2 vP;
      float sdEllipse(vec2 p, vec2 ab){ float k0 = length(p / ab); float k1 = length(p / (ab * ab)); return k0 * (k0 - 1.0) / k1; }
      void main(){
        float sd = sdEllipse(vP, vec2(${(AX * 1.02).toFixed(3)}, ${(AY * 1.02).toFixed(3)}));
        if (sd < 0.0) discard;
        float crest = pow(0.5 + 0.5 * cos(18.0 * sd + uPhase), 14.0);
        float fade = exp(-sd * 1.7) * smoothstep(0.0, 0.08, sd);
        vec3 c = mix(vec3(0.5, 0.38, 1.0), vec3(0.3, 0.85, 1.0), 0.5 + 0.5 * sin(sd * 3.0));
        gl_FragColor = vec4(c * crest * fade * uE * 0.75, 1.);
      }`,
  }));
  waves.position.z = -0.25; backHalf.add(waves);

  // lights
  const key = new THREE.DirectionalLight(0xfff3e6, 2.6); key.position.set(-4, 5, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fe4ff, 3.0); rim.position.set(5, 3, -5); scene.add(rim);
  const warm = new THREE.PointLight(0xffa040, 0, 0, 1.5); warm.position.set(0, 0, 3); scene.add(warm);

  const cam = camPath([
    { t: 24.15, p: [0.6, 0.6, 12.6], l: [0, -0.05, 0], fov: 32 },
    { t: 26.0, p: [0.1, 0.25, 12.4], l: [0, -0.15, 0], fov: 32 },
    { t: 29.4, p: [-0.15, 0.15, 11.8], l: [0, -0.15, 0], fov: 32 },
    { t: 31.4, p: [0.3, 0.2, 8.6], l: [0.25, 0.0, 0], fov: 32 },
    { t: 33.6, p: [0.55, 0.3, 6.6], l: [0.45, 0.1, 0], fov: 32 },
  ], x => x);

  function view(t, T) {
    return {
      scene, camera, dof: { focus: camera.position.length(), aperture: 0.012, max: 0.008 },
      prepare() {
        cam(t, camera); camera.updateMatrixWorld();
        // reveal: whole potato turns, then the front half lifts away
        const turn = prog(24.15, 25.7, t, ease.inOut);
        backHalf.rotation.set(0.08 * (1 - turn), lerp(-1.05, 0, turn), 0);
        const sep = prog(T.twist - 0.05, T.twist + 0.9, t, ease.inOut);
        frontHalf.rotation.set(backHalf.rotation.x - sep * 0.3, backHalf.rotation.y + sep * 1.4, sep * 0.25);
        frontHalf.position.set(sep * 2.6, sep * 0.6, sep * 3.2);
        frontHalf.visible = sep < 0.999;
        skinFront.opacity = 1 - prog(0.6, 1, sep); capF.material.opacity = skinFront.opacity;
        // energy then heat
        const eOn = prog(T.mw2 - 0.1, T.mw2 + 0.8, t);
        const heat = prog(T.they + 0.1, 33.2, t, ease.inOutSine);
        CU.uE.value = eOn * (1 - 0.55 * heat); WU.uE.value = eOn * (1 - 0.6 * heat);
        CU.uPhase.value = WU.uPhase.value = t * 7.0;
        CU.uHeat.value = prog(T.they - 0.4, T.they + 0.6, t);
        CU.uFront.value = lerp(DELTA * 0.6, 0.78, heat);
        CU.uCold.value = prog(T.mw2 + 0.5, T.mw2 + 1.5, t);
        warm.intensity = 2.5 * heat;
        dome.material.uniforms.uWarm.value = heat * 0.8;
      },
    };
  }
  return { scene, view };
}
