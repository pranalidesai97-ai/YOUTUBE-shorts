import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { camPath } from './campath.js';
import { prog, ease, lerp, rng, clamp } from './util.js';
import { fieldUniforms, makeFieldVolume, FIELD_GLSL } from './wavefield.js';
import { CAV_MIN, CAV_MAX, PORT } from './kitchen.js';

const MAG = new THREE.Vector3(1.9, 1.35, 0.35);      // magnetron centre
const WG_Y = 2.25, WG_H = 0.42, WG_W = 0.72;         // waveguide

export function createCutaway(env, A) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(0x02040a);
  const camera = new THREE.PerspectiveCamera(36, 9 / 16, 0.05, 200);

  // backdrop: deep navy gradient dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){ float y = normalize(vP).y; vec3 c = mix(vec3(0.004,0.008,0.02), vec3(0.02,0.045,0.09), smoothstep(-0.2, 0.5, y)); gl_FragColor = vec4(c, 1.); }`,
  }));
  scene.add(dome);

  // technical grid floor
  const gridU = { uOp: { value: 0 } };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({
    uniforms: gridU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uOp; varying vec3 vW;
      float ln(float x, float w){ float f = abs(fract(x) - 0.5); return smoothstep(w, 0.0, 0.5 - f); }
      void main(){
        float a = max(ln(vW.x * 2.0, 0.04), ln(vW.z * 2.0, 0.04)) * 0.35 + max(ln(vW.x * 0.5, 0.02), ln(vW.z * 0.5, 0.02)) * 0.5;
        float fade = exp(-length(vW.xz) * 0.16);
        gl_FragColor = vec4(vec3(0.2, 0.75, 1.0) * a * fade * uOp, a * fade * uOp * 0.8);
      }`,
  }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = -0.001; scene.add(grid);

  // field uniforms shared by volume + wall glow
  const FU = fieldUniforms(PORT, CAV_MIN, CAV_MAX);
  FU.uFront.value = 0;

  // ---- cavity walls (cutaway: top and front removed)
  const wallU = { uGlow: { value: 1 } };
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6f7883, metalness: 0.85, roughness: 0.3, roughnessMap: A.brushed, envMapIntensity: 0.7, side: THREE.DoubleSide });
  wallMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, FU, wallU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;').replace('#include <project_vertex>', '#include <project_vertex>\nvWW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSrc; uniform float uFront; uniform float uGlow; varying vec3 vWW;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rr = length(vWW - uSrc);
        float ring = exp(-pow((rr - uFront + 0.25) * 4.0, 2.0)) * step(0.05, uFront);
        float after = 0.0;
        totalEmissiveRadiance += vec3(0.3, 0.85, 1.0) * (ring * 1.4 + after) * uGlow;`);
  };
  wallMat.customProgramCacheKey = () => 'wallglow';
  const sideMat = wallMat.clone(); sideMat.onBeforeCompile = wallMat.onBeforeCompile; sideMat.customProgramCacheKey = wallMat.customProgramCacheKey;
  sideMat.transparent = true; sideMat.opacity = 0.1; sideMat.depthWrite = false;
  const cx = (CAV_MIN.x + CAV_MAX.x) / 2, cy = (CAV_MIN.y + CAV_MAX.y) / 2, cz = (CAV_MIN.z + CAV_MAX.z) / 2;
  const sx = CAV_MAX.x - CAV_MIN.x, sy = CAV_MAX.y - CAV_MIN.y, sz = CAV_MAX.z - CAV_MIN.z;
  const wall = (w, h, pos, rot, m = wallMat) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.copy(pos); o.rotation.set(...rot); scene.add(o); return o; };
  wall(sx, sy, new THREE.Vector3(cx, cy, CAV_MIN.z), [0, 0, 0]);
  wall(sz, sy, new THREE.Vector3(CAV_MIN.x, cy, cz), [0, Math.PI / 2, 0]);
  wall(sx, sz, new THREE.Vector3(cx, CAV_MIN.y, cz), [-Math.PI / 2, 0, 0]);
  wall(sz, sy, new THREE.Vector3(CAV_MAX.x, cy, cz), [0, -Math.PI / 2, 0], sideMat);
  // wall edges
  const cavEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.35 }));
  cavEdges.position.set(cx, cy, cz); scene.add(cavEdges);

  // ---- outer shell: solid -> x-ray
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.85, roughness: 0.3, roughnessMap: A.brushed, transparent: true, opacity: 1 });
  const shell = new THREE.Group(); scene.add(shell);
  const sbox = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.04), shellMat); m.position.set(x, y, z); shell.add(m); };
  sbox(5.2, 0.14, 4.0, 0, 3.03, 0); sbox(0.16, 3.1, 4.0, -2.52, 1.55, 0); sbox(0.12, 3.1, 4.0, 2.54, 1.55, 0); sbox(5.2, 3.1, 0.12, 0, 1.55, -1.94);
  sbox(1.42, 3.1, 0.1, 1.89, 1.55, 1.97); sbox(3.8, 3.1, 0.1, -0.7, 1.55, 2.05);
  const shellEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(5.2, 3.1, 4.0)), new THREE.LineBasicMaterial({ color: 0x8feeff, transparent: true, opacity: 0 }));
  shellEdges.position.set(0, 1.55, 0); scene.add(shellEdges);
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 4.0), new THREE.MeshStandardMaterial({ color: 0x1a1e25, metalness: 0.7, roughness: 0.4 }));
  base.position.set(0, 0.08, 0); scene.add(base);

  // ---- magnetron
  const alu = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.55, roughness: 0.3, roughnessMap: A.brushed, envMapIntensity: 1.6 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xd08a55, metalness: 0.8, roughness: 0.28, envMapIntensity: 1.5 });
  const ferrite = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.3, roughness: 0.45, envMapIntensity: 1.3 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf1ede4, metalness: 0, roughness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab1ba, metalness: 0.6, roughness: 0.32, envMapIntensity: 1.5 });
  const mag = new THREE.Group(); mag.position.copy(MAG); scene.add(mag);
  const anode = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.62, 48), copper); mag.add(anode);
  const finMat = alu.clone();
  finMat.emissive = new THREE.Color(0x2bbcff); finMat.emissiveIntensity = 0;
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.018, 0.82), finMat);
    f.position.y = -0.24 + i * 0.06; mag.add(f);
  }
  for (const y of [-0.36, 0.36]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 48), ferrite); m.position.y = y; mag.add(m); }
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.035, 0.98), steel); flange.position.y = 0.46; mag.add(flange);
  const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.18, 32), ceramic); ins.position.y = 0.57; mag.add(ins);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel); cap.position.y = 0.66; mag.add(cap);
  const capStem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 32), steel); capStem.position.y = 0.66; mag.add(capStem);
  const filt = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.36, 0.56, 2, 0.03), steel); filt.position.y = -0.62; mag.add(filt);
  for (const z of [-0.12, 0.12]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), ceramic); c.rotation.z = Math.PI / 2; c.position.set(0.34, -0.62, z); mag.add(c); }

  // ---- waveguide (translucent metal duct from antenna to cavity port)
  const wgLen = MAG.x + 0.5 - CAV_MAX.x;
  const wgMat = new THREE.MeshStandardMaterial({ color: 0xaab2bc, metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const wg = new THREE.Mesh(new THREE.BoxGeometry(wgLen, WG_H, WG_W), wgMat);
  wg.position.set(CAV_MAX.x + wgLen / 2, WG_Y, PORT.z); scene.add(wg);
  const wgEdges = new THREE.LineSegments(new THREE.EdgesGeometry(wg.geometry), new THREE.LineBasicMaterial({ color: 0x9feeff, transparent: true, opacity: 0.55 }));
  wgEdges.position.copy(wg.position); scene.add(wgEdges);
  // wave packet inside the guide
  const pU = { uHead: { value: -10 }, uT: { value: 0 }, uOp: { value: 0 } };
  const packet = new THREE.Mesh(new THREE.PlaneGeometry(wgLen, WG_H * 0.92), new THREE.ShaderMaterial({
    uniforms: pU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uHead, uT, uOp; varying vec3 vW;
      void main(){
        float x = vW.x;                         // travels toward -x
        float behind = x - uHead;               // >0 means already passed
        float env = smoothstep(-0.05, 0.25, behind) * exp(-max(behind - 0.4, 0.0) * 0.6);
        float wave = cos(5.15 * x + uT * 9.0);
        float y = (vW.y - ${WG_Y.toFixed(3)}) / ${(WG_H / 2).toFixed(3)};
        float crest = smoothstep(0.55, 1.0, wave) * (1.0 - y * y);
        float head = exp(-pow((x - uHead) * 6.0, 2.0)) * (1.0 - y * y);
        vec3 c = vec3(0.3, 0.88, 1.0) * (crest * 1.4 + head * 2.5 + 0.12 * env);
        gl_FragColor = vec4(c * env * uOp, 1.);
      }`,
  }));
  packet.position.copy(wg.position); scene.add(packet);
  const packet2 = packet.clone(); packet2.rotation.x = Math.PI / 2; scene.add(packet2);
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: 0x5fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  headGlow.scale.set(1.2, 1.2, 1); scene.add(headGlow);
  const antGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: 0x7ff0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  antGlow.position.set(MAG.x, WG_Y - 0.05, PORT.z); antGlow.scale.set(0.9, 0.9, 1); scene.add(antGlow);

  // ---- field volume in the cavity
  const field = makeFieldVolume(FU, CAV_MIN, CAV_MAX, { layers: 1, ys: [PORT.y - 0.05, 1.05] });
  scene.add(field);

  // ---- dust motes
  const R = rng(23); const N = 260; const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (R() - .5) * 14; pos[i * 3 + 1] = R() * 7; pos[i * 3 + 2] = (R() - .5) * 12; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.03, color: 0x8fdfff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  scene.add(dust);

  // lights
  const key = new THREE.DirectionalLight(0xfff0e0, 2.6); key.position.set(-3, 9, 8); scene.add(key);
  const fillL = new THREE.PointLight(0xcfe8ff, 6, 0, 1.5); fillL.position.set(4.5, 3.5, 4); scene.add(fillL);
  const rim = new THREE.DirectionalLight(0x6fe4ff, 3.0); rim.position.set(7, 5, -6); scene.add(rim);
  const magLight = new THREE.PointLight(0x5fe8ff, 0, 0, 2); magLight.position.set(MAG.x, WG_Y, PORT.z + 0.2); scene.add(magLight);

  const cam = camPath([
    { t: 8.05, p: [4.9, 2.6, 4.6], l: [1.85, 1.6, 0.35], fov: 30 },
    { t: 9.9, p: [4.3, 3.3, 4.4], l: [1.75, 1.75, 0.35], fov: 30 },
    { t: 11.5, p: [3.0, 6.8, 7.0], l: [0.45, 1.45, 0.25], fov: 36 },
    { t: 14.6, p: [1.9, 10.2, 8.4], l: [0.05, 1.0, 0.15], fov: 38 },
  ], x => x);

  const anchors = { mag: new THREE.Vector3(MAG.x - 0.1, MAG.y + 0.1, MAG.z + 0.42), cav: new THREE.Vector3(CAV_MIN.x + 0.02, 1.6, -0.9) };
  const project = (v) => { const p = v.clone().project(camera); return [(p.x + 1) / 2, (1 - p.y) / 2]; };

  function view(t, T) {
    const tPulse = T.generates - 0.15, tPort = tPulse + 1.15;
    return {
      scene, camera, dof: null,
      prepare() {
        cam(t, camera); camera.updateMatrixWorld();
        const xr = prog(8.3, 9.3, t, ease.inOut);
        shellMat.opacity = lerp(1, 0.06, xr); shellMat.depthWrite = xr < 0.05;
        shellEdges.material.opacity = 0.22 * xr;
        gridU.uOp.value = prog(8.4, 9.6, t);
        // magnetron activation
        const act = prog(T.magnetron - 0.1, T.magnetron + 0.5, t);
        finMat.emissiveIntensity = 0.12 * act * (0.8 + 0.2 * Math.sin(t * 20));
        magLight.intensity = 2.5 * act;
        antGlow.material.opacity = act * (0.55 + 0.25 * Math.sin(t * 13));
        // pulse in waveguide
        const hp = prog(tPulse, tPort, t, ease.inOutSine);
        pU.uHead.value = lerp(MAG.x + 0.05, CAV_MAX.x - 0.1, hp);
        pU.uT.value = t; pU.uOp.value = prog(tPulse - 0.1, tPulse + 0.2, t);
        headGlow.position.set(pU.uHead.value, WG_Y, PORT.z);
        headGlow.material.opacity = prog(tPulse, tPulse + 0.2, t) * (1 - prog(tPort, tPort + 0.4, t)) * 0.9;
        // cavity wave field
        FU.uFront.value = Math.max(0, (t - tPort) * 1.9);
        FU.uPhase.value = t * 6.5;
        field.userData.setOpacity(prog(tPort - 0.1, tPort + 0.3, t) * 1.0);
        dust.rotation.y = t * 0.03;
        this.labels = [
          { text: 'MAGNETRON', alpha: prog(T.magnetron - 0.15, T.magnetron + 0.45, t) * (1 - prog(14.15, 14.45, t)), elbow: [0.56, 0.205], dir: 1, t, anchor: project(anchors.mag) },
          { text: 'REFLECTIVE METAL CAVITY', alpha: prog(T.reflect - 0.7, T.reflect - 0.1, t) * (1 - prog(14.15, 14.45, t)), elbow: [0.1, 0.285], dir: 1, t, anchor: project(anchors.cav) },
        ];
      },
    };
  }
  return { scene, view };
}
