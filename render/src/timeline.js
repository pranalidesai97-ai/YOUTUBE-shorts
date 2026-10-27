import * as THREE from 'three';
import { camPath } from './campath.js';
import { prog, ease, lerp, clamp } from './util.js';

export function wordFinder(words) {
  return (w, n = 1) => {
    let c = 0;
    for (const x of words.words) if (x.w.toLowerCase() === w.toLowerCase() && ++c === n) return x;
    throw new Error('word not found ' + w + ' ' + n);
  };
}

export function buildTimeline(scenes, words) {
  const Wd = wordFinder(words);
  const K = scenes.kitchen;
  const camK = new THREE.PerspectiveCamera(35, 9 / 16, 0.05, 200);
  const T = {
    fire: Wd('fire').s, radio: Wd('radioactive').s, uses: Wd('uses').s, invisible: Wd('invisible').s,
    magnetron: Wd('magnetron').s, generates: Wd('generates').s, reflect: Wd('reflect').s, when: Wd('When').s,
    field: Wd('field').s, water: Wd('water').s, reorient: Wd('reorient').s, transfers: Wd('transfers').s,
    heat1: Wd('heat', 1).s, but: Wd('But').s, twist: Wd('twist').s, mw2: Wd('microwaves', 1).s,
    they: Wd('They').s, heat2: Wd('heat', 2).s, inward: Wd('inward').s, thats: Wd("That's").s,
    scorching: Wd('scorching').s, cold: Wd('cold').s, turntable: Wd('turntable').s, matters: Wd('matters').s,
  };

  // ---- kitchen camera paths
  const hookCam = camPath([
    { t: 0.0, p: [0.35, 2.55, 11.5], l: [-0.65, 1.15, 0], fov: 34 },
    { t: 1.1, p: [-0.45, 1.85, 5.6], l: [-0.65, 1.02, 0], fov: 32 },
    { t: 2.75, p: [-0.62, 1.6, 3.3], l: [-0.65, 0.98, 0], fov: 30 },
  ], ease.out);
  const interiorCam = camPath([
    { t: 2.35, p: [-0.58, 1.7, 2.35], l: [-0.65, 0.98, 0.0], fov: 40 },
    { t: 4.6, p: [-0.62, 1.52, 1.85], l: [-0.65, 0.98, 0.0], fov: 40 },
    { t: 6.3, p: [-1.45, 2.0, 3.2], l: [0.0, 1.45, -0.3], fov: 50 },
    { t: 8.45, p: [-1.85, 2.15, 3.85], l: [0.1, 1.5, -0.35], fov: 50 },
  ], x => x);
  const diveCam = camPath([
    { t: 14.2, p: [-0.3, 2.05, 2.4], l: [-0.65, 1.05, 0], fov: 46 },
    { t: 15.5, p: [-0.6, 1.3, 0.75], l: [-0.66, 0.99, 0.0], fov: 42 },
    { t: 16.55, p: [-0.655, 1.07, 0.16], l: [-0.66, 0.99, -0.06], fov: 40 },
  ], ease.in);
  const heatCam = camPath([
    { t: 21.8, p: [-0.64, 1.16, 0.4], l: [-0.66, 0.98, 0.0], fov: 42 },
    { t: 23.0, p: [-0.6, 1.6, 1.45], l: [-0.65, 0.96, 0.0], fov: 40 },
    { t: 24.6, p: [-0.5, 2.05, 2.45], l: [-0.65, 0.95, 0.0], fov: 38 },
  ], ease.out);
  const payCam = camPath([
    { t: 33.2, p: [-0.45, 6.9, 1.75], l: [-0.65, 0.9, 0.12], fov: 42 },
    { t: 38.6, p: [-0.7, 6.1, 1.25], l: [-0.65, 0.9, 0.08], fov: 42 },
  ], ease.inOutSine);
  const heroCam = camPath([
    { t: 38.1, p: [-0.3, 2.4, 11.2], l: [-0.65, 0.9, 2.2], fov: 36 },
    { t: 40.0, p: [-0.58, 1.75, 9.0], l: [-0.65, 0.68, 2.9], fov: 36 },
  ], ease.out);

  const kview = (cam, stateFn, dofFn) => t => ({
    scene: K.scene, camera: camK, dof: dofFn ? dofFn(t) : null,
    prepare() { cam(t, camK); K.update(t, stateFn(t)); },
  });

  const rotAngle = t => { const x = Math.max(0, t - (T.cold - 0.5)); return 1.25 * (x - 0.6 * (1 - Math.exp(-x / 0.6))); };

  const shots = [
    { name: 'hookExt', scene: 'kitchen', from: 0, to: 2.75,
      view: kview(hookCam, t => ({
        lamp: 13, steam: 0.9, sweep: lerp(-0.4, 1.8, prog(0.1, 1.5, t, ease.inOut)),
        flame: prog(T.fire - 0.2, T.fire + 0.1, t) * 1.0, flameDis: prog(T.fire + 0.45, T.fire + 1.05, t, ease.inOutSine),
      })) },
    { name: 'interior', scene: 'kitchen', from: 2.35, to: 8.45, trans: { type: 1, c: [0.5, 0.45] },
      view: kview(interiorCam, t => ({
        doorHidden: true, lamp: 11, steam: 0.7,
        scanMix: prog(T.radio - 0.25, T.radio, t) * (1 - prog(4.35, 4.7, t)),
        scanX: lerp(-1.75, 0.5, prog(T.radio, T.radio + 1.05, t, ease.inOut)),
        field: prog(T.uses - 0.05, T.uses + 0.5, t) * 0.95, front: Math.max(0, (t - T.uses) * 3.4), wavePhase: t * 6.5,
        portGlow: prog(T.uses - 0.1, T.uses + 0.2, t) * (0.55 + 0.15 * Math.sin(t * 9)),
      }), t => (t < 4.9 ? { focus: 1.75, aperture: 0.012, max: 0.01 } : null)) },
    { name: 'cutaway', scene: 'cutaway', from: 8.05, to: 14.6, trans: { type: 2 },
      view: t => scenes.cutaway.view(t, T) },
    { name: 'dive', scene: 'kitchen', from: 14.2, to: 16.55, trans: { type: 1, c: [0.5, 0.5] },
      view: kview(diveCam, t => ({
        doorHidden: true, lamp: 11, steam: 0.5, field: 0.85, front: 100, wavePhase: t * 6.5, portGlow: 0.5,
      }), t => ({ focus: lerp(2.3, 0.2, prog(14.2, 16.4, t, ease.in)), aperture: 0.006, max: 0.006 })) },
    { name: 'molecules', scene: 'molecules', from: 16.1, to: 22.2, trans: { type: 1, c: [0.5, 0.5] },
      view: t => scenes.molecules.view(t, T) },
    { name: 'heat', scene: 'kitchen', from: 21.8, to: 24.5, trans: { type: 3, c: [0.5, 0.5] },
      view: kview(heatCam, t => ({
        doorHidden: true, lamp: 12, steam: lerp(0.4, 1.0, prog(22, 24, t)),
        heatMix: 1, spread: prog(T.transfers + 0.6, T.heat1 + 0.6, t, ease.inOutSine),
        field: 0.5 * (1 - prog(21.8, 22.8, t)), front: 100, wavePhase: t * 6.5,
      }), t => ({ focus: lerp(0.45, 2.0, prog(21.8, 24, t)), aperture: 0.016, max: 0.012 })) },
    { name: 'potato', scene: 'potato', from: 24.15, to: 33.6, trans: { type: 4, ease: ease.inOut },
      view: t => scenes.potato.view(t, T) },
    { name: 'payoff', scene: 'kitchen', from: 33.2, to: 38.5, trans: { type: 2 },
      view: kview(payCam, t => ({
        doorHidden: true, topHidden: true, lamp: 10, steam: 0.12,
        mapMix: prog(33.4, 34.2, t) * 0.92, mapAmount: prog(33.4, T.scorching, t, ease.out),
        rot: rotAngle(t), field: 0,
        plateMark: 0.22 * prog(T.cold - 0.5, T.cold, t),
      }), null) },
    { name: 'hero', scene: 'kitchen', from: 38.1, to: 40.1, trans: { type: 0, ease: ease.inOut },
      view: kview(heroCam, t => {
        const p = prog(38.2, 39.25, t, ease.inOut);
        return { doorOpen: 1, lamp: 13, steam: 0.7, dishZ: lerp(0, 3.0, p), dishY: lerp(0.51, 0.0, p) + 0.28 * Math.sin(Math.PI * p), sweep: lerp(-0.4, 1.6, prog(38.6, 39.8, t)) };
      }, t => ({ focus: 6.0, aperture: 0.01, max: 0.008 })) },
  ];

  const post = (t, f) => {
    let bloom = 0.55, exposure = 0.9, br = 0.5, th = 0.95;
    if (t > 8.4 && t < 14.4) { bloom = 0.42; th = 1.0; }
    if (t > 16.2 && t < 22) { bloom = 0.8; th = 0.75; }
    if (t > 24.4 && t < 33.4) { bloom = 0.65; th = 0.85; }
    return { bloom, bloomRadius: br, bloomThreshold: th, exposure, seed: f * 0.6180339 % 1 * 100, vignette: 0.55 };
  };

  return { shots, post, T, labels: [] };
}
