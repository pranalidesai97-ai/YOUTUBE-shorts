import * as THREE from 'three';
import { camPath } from './campath.js';
import { prog, ease, lerp, rng, clamp } from './util.js';

// Water molecule geometry (space-filling style, relative sizes): O larger, two H at 104.5 degrees.
const R_O = 0.32, R_H = 0.205, D_OH = 0.36, HALF = (104.5 / 2) * Math.PI / 180;
const FIELD_F = 0.55;            // illustrative field frequency (Hz) – real ovens: ~2.45 GHz
const T_START = 15.9, T_END = 22.4, DT = 1 / 120;

export function createMolecules(env, A) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(0x01030a);
  const camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.1, 200);

  // volumetric backdrop
  const bgU = { uT: { value: 0 }, uWarm: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({
    uniforms: bgU, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uT, uWarm; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 p = vP * 3.0 + vec3(uT * 0.03, 0., 0.);
        float c = n(p) * 0.5 + n(p * 2.1) * 0.3 + n(p * 4.3) * 0.2;
        vec3 deep = vec3(0.003, 0.008, 0.022);
        vec3 neb = mix(vec3(0.02, 0.09, 0.16), vec3(0.16, 0.08, 0.02), uWarm);
        vec3 col = deep + neb * smoothstep(0.45, 0.85, c) * (0.6 + 0.4 * smoothstep(-0.6, 0.3, vP.y));
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  scene.add(dome);

  // lights
  const key = new THREE.DirectionalLight(0xeaf4ff, 2.4); key.position.set(-4, 6, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4fdcff, 4.0); rim.position.set(3, 2, -6); scene.add(rim);
  const warmL = new THREE.PointLight(0xffa040, 0, 0, 1.2); warmL.position.set(0, 0, 3); scene.add(warmL);

  // molecule materials with fresnel rim + soft inner glow (fake subsurface)
  const molU = { uRim: { value: new THREE.Color(0x4fdcff) }, uRimK: { value: 0.9 }, uWarm: { value: 0 } };
  const rimify = (m, inner) => {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, molU);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimK, uWarm;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fr = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
          vec3 rimC = mix(uRim, vec3(1.0, 0.62, 0.22), uWarm);
          totalEmissiveRadiance += rimC * fr * uRimK + vec3(${inner}) * (0.35 + 0.65 * (1.0 - fr)) + vec3(1.0,0.5,0.15) * uWarm * 0.25;`);
    };
    m.customProgramCacheKey = () => 'mol' + inner;
    return m;
  };
  const matO = rimify(new THREE.MeshStandardMaterial({ color: 0xe8483f, roughness: 0.22, metalness: 0.0, envMapIntensity: 1.3 }), '0.10,0.012,0.01');
  const matH = rimify(new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.2, metalness: 0.0, envMapIntensity: 1.3 }), '0.035,0.04,0.05');
  const gO = new THREE.SphereGeometry(R_O, 48, 32), gH = new THREE.SphereGeometry(R_H, 32, 24);

  // place molecules (Poisson-ish)
  const Rn = rng(31);
  const mols = [];
  let tries = 0;
  while (mols.length < 34 && tries < 8000) {
    tries++;
    const p = mols.length === 0 ? new THREE.Vector3(0.25, -0.55, 1.0)
      : new THREE.Vector3((Rn() - .5) * 6.0, (Rn() - .5) * 8.6 - 0.5, (Rn() - .5) * 5.0 - 0.8);
    if (mols.some(m => m.base.distanceTo(p) < 1.35)) continue;
    // keep the upper title zone and the hero's surroundings clear
    if (mols.length && p.y > 1.4 && p.z > -2.0) continue;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(gO, matO));
    for (const s of [1, -1]) { const h = new THREE.Mesh(gH, matH); h.position.set(Math.cos(HALF) * D_OH, s * Math.sin(HALF) * D_OH, 0); g.add(h); }
    scene.add(g);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Rn() * 6.28, Rn() * 6.28, Rn() * 6.28));
    mols.push({ g, base: p, q, w: new THREE.Vector3(), seed: Rn() * 100, ph: [Rn() * 6.28, Rn() * 6.28, Rn() * 6.28] });
  }
  // hero molecule near the front-centre for the polarity tags
  const hero = mols[0];

  // field strength envelope
  const fieldAmp = t => prog(16.3, 16.9, t, ease.inOut);
  const E = t => fieldAmp(t) * Math.cos(2 * Math.PI * FIELD_F * (t - 16.3));
  const heatAmt = t => prog(21.1, 22.2, t, ease.inOut);

  // precompute rotational dynamics: torque = p x E, damping, random thermal kicks
  const NSTEP = Math.ceil((T_END - T_START) / DT) + 2;
  const qs = mols.map(() => new Float32Array(NSTEP * 4));
  {
    const xh = new THREE.Vector3(1, 0, 0), d = new THREE.Vector3(), tq = new THREE.Vector3(), dq = new THREE.Quaternion();
    const RR = rng(77);
    const noise = mols.map(() => new THREE.Vector3());
    for (let s = 0; s < NSTEP; s++) {
      const t = T_START + s * DT, e = E(t), heat = heatAmt(t);
      mols.forEach((m, i) => {
        d.copy(xh).applyQuaternion(m.q);
        tq.crossVectors(d, xh).multiplyScalar(26 * e);
        // smoothed random torque (thermal agitation), stronger as the food heats
        const nz = noise[i];
        nz.multiplyScalar(0.96).add(new THREE.Vector3(RR() - .5, RR() - .5, RR() - .5).multiplyScalar(1.6 + heat * 3.5));
        tq.add(nz);
        m.w.addScaledVector(tq, DT).multiplyScalar(1 - 4.2 * DT);
        const wl = m.w.length();
        if (wl > 1e-6) { dq.setFromAxisAngle(m.w.clone().divideScalar(wl), wl * DT); m.q.premultiply(dq).normalize(); }
        qs[i].set([m.q.x, m.q.y, m.q.z, m.q.w], s * 4);
      });
    }
  }

  // field arrows: chevrons on horizontal field lines, in two depth layers
  const chev = new THREE.Shape();
  chev.moveTo(0, 0); chev.lineTo(-0.15, 0.11); chev.lineTo(-0.2, 0.11); chev.lineTo(-0.06, 0); chev.lineTo(-0.2, -0.11); chev.lineTo(-0.15, -0.11); chev.lineTo(0, 0);
  const chevGeo = new THREE.ShapeGeometry(chev);
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x6feaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x3fc8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const rows = [];
  for (const z of [-2.9, 2.3]) for (let yi = -4; yi <= 4; yi++) rows.push({ y: yi * 0.95 + (z > 0 ? 0.45 : 0), z });
  const perRow = 9;
  const arrows = new THREE.InstancedMesh(chevGeo, arrowMat, rows.length * perRow);
  scene.add(arrows);
  const lines = new THREE.Group(); scene.add(lines);
  for (const r of rows) { const l = new THREE.Mesh(new THREE.PlaneGeometry(16, r.z > 0 ? 0.012 : 0.016), lineMat); l.position.set(0, r.y, r.z); lines.add(l); }

  // particle streaks that slosh back and forth with the field
  const NP = 220, PR = rng(5);
  const pBase = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pBase[i * 3] = (PR() - .5) * 9; pBase[i * 3 + 1] = (PR() - .5) * 10; pBase[i * 3 + 2] = (PR() - .5) * 6 - 0.5; }
  const pGeo = new THREE.BufferGeometry(); const pPos = new Float32Array(NP * 6);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const streaks = new THREE.LineSegments(pGeo, new THREE.LineBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(streaks);
  const disp = t => { // integral of E (bounded), gives the sloshing displacement
    const a = fieldAmp(t);
    return a * Math.sin(2 * Math.PI * FIELD_F * (t - 16.3)) * 0.35;
  };

  // bokeh dust (out of focus specks)
  const BR = rng(9); const NB = 70; const bpos = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) { bpos[i * 3] = (BR() - .5) * 12; bpos[i * 3 + 1] = (BR() - .5) * 14; bpos[i * 3 + 2] = (BR() - .5) * 10; }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bokeh = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.09, map: A.glow, color: 0x7fe0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(bokeh);

  const cam = camPath([
    { t: 16.1, p: [-1.6, 0.4, 7.0], l: [0, -0.3, 0], fov: 36 },
    { t: 19.0, p: [0.1, 0.2, 8.3], l: [0, -0.35, 0], fov: 34 },
    { t: 22.4, p: [1.8, 0.0, 10.0], l: [0, -0.4, 0], fov: 34 },
  ], ease.inOutSine);

  const dummy = new THREE.Object3D();
  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  const project = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2, (1 - p.y) / 2]; };

  function view(t, T) {
    return {
      scene, camera,
      dof: { focus: lerp(5.4, camera.position.distanceTo(hero.base), prog(16.6, 17.9, t, ease.inOut)), aperture: 0.045, max: 0.014 },
      prepare() {
        cam(t, camera); camera.updateMatrixWorld();
        bgU.uT.value = t;
        const heat = heatAmt(t), e = E(t);
        bgU.uWarm.value = heat; molU.uWarm.value = heat; warmL.intensity = heat * 30;
        molU.uRimK.value = 0.55 + 0.6 * Math.abs(e);
        // molecules
        const s = clamp((t - T_START) / DT, 0, NSTEP - 2);
        const i0 = Math.floor(s), fr = s - i0;
        const appear = prog(16.0, 16.6, t, ease.out);
        mols.forEach((m, i) => {
          const a = qs[i];
          tmpQ.set(a[i0 * 4], a[i0 * 4 + 1], a[i0 * 4 + 2], a[i0 * 4 + 3]);
          tmpQ2.set(a[i0 * 4 + 4], a[i0 * 4 + 5], a[i0 * 4 + 6], a[i0 * 4 + 7]);
          m.g.quaternion.copy(tmpQ).slerp(tmpQ2, fr);
          const jig = 0.05 + heat * 0.07;
          m.g.position.set(
            m.base.x + Math.sin(t * 0.6 + m.ph[0]) * 0.12 + Math.sin(t * 9.1 + m.ph[1]) * jig * heat,
            m.base.y + Math.sin(t * 0.5 + m.ph[1]) * 0.12 + Math.sin(t * 8.3 + m.ph[2]) * jig * heat,
            m.base.z + Math.sin(t * 0.4 + m.ph[2]) * 0.1);
          m.g.scale.setScalar(appear);
        });
        // arrows
        let k = 0;
        const amp = Math.abs(e), dir = Math.sign(e) || 1;
        for (const r of rows) for (let j = 0; j < perRow; j++) {
          dummy.position.set((j - (perRow - 1) / 2) * 1.1 + (r.z > 0 ? 0.55 : 0), r.y, r.z);
          dummy.scale.set(dir * (0.25 + 0.75 * amp) * (r.z > 0 ? 1.3 : 1.0), 0.4 + 0.6 * amp, 1);
          dummy.updateMatrix(); arrows.setMatrixAt(k++, dummy.matrix);
        }
        arrows.instanceMatrix.needsUpdate = true;
        arrowMat.opacity = (0.15 + 0.85 * amp) * prog(16.2, 16.7, t) * (1 - heat * 0.7);
        lineMat.opacity = (0.12 + 0.3 * amp) * prog(16.2, 16.7, t) * (1 - heat * 0.6);
        // streaks
        const x0 = disp(t), x1 = disp(t - 0.09);
        for (let i = 0; i < NP; i++) {
          const bx = pBase[i * 3], by = pBase[i * 3 + 1], bz = pBase[i * 3 + 2];
          const sc = 1 + (i % 5) * 0.35;
          pPos[i * 6] = bx + x0 * sc; pPos[i * 6 + 1] = by; pPos[i * 6 + 2] = bz;
          pPos[i * 6 + 3] = bx + x1 * sc; pPos[i * 6 + 4] = by; pPos[i * 6 + 5] = bz;
        }
        pGeo.attributes.position.needsUpdate = true;
        streaks.material.opacity = 0.5 * prog(16.3, 16.9, t) * (1 - heat * 0.5);
        streaks.material.color.setRGB(lerp(0.56, 1.0, heat), lerp(0.94, 0.66, heat), lerp(1.0, 0.3, heat));
        // polarity tags on the hero molecule
        const hO = hero.g.position.clone();
        const dvec = new THREE.Vector3(1, 0, 0).applyQuaternion(hero.g.quaternion);
        const hH = hO.clone().addScaledVector(dvec, 0.5);
        const ta = prog(T.water + 0.2, T.water + 0.7, t) * (1 - prog(20.9, 21.3, t));
        this.tags = [
          { text: 'δ−', anchor: project(hO.clone().addScaledVector(dvec, -0.48)), alpha: ta, color: '#ff8a7a' },
          { text: 'δ+', anchor: project(hH.addScaledVector(dvec, 0.28)), alpha: ta, color: '#e8f4ff' },
        ];
      },
    };
  }
  return { scene, view };
}
