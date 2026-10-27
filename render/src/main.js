import * as THREE from 'three';
import { Engine } from './engine.js';
import { makeAssets, makeEnvironment } from './assets.js';
import { createKitchen, TT_CENTER } from './kitchen.js';
import { buildTimeline } from './timeline.js';
import { Overlay } from './overlay.js';

const params = new URLSearchParams(location.search);
const S = parseFloat(params.get('s') || '1');
const W = Math.round(1080 * S), H = Math.round(1920 * S);
const FPS = 30;

async function init() {
  const words = await (await fetch('/build/words.json')).json();
  await Promise.all(['500 10px InterR', '600 10px InterR', '700 10px InterR', '600 10px InterD', '700 10px InterD', '800 10px InterD', '300 10px InterD', '600 10px "JetBrains Mono"'].map(f => document.fonts.load(f)));

  const engine = new Engine(W, H, { samples: params.has('msaa') ? +params.get('msaa') : 4, nodof: params.has('nodof'), nobloom: params.has('nobloom') });
  document.body.appendChild(engine.renderer.domElement);
  const overlay = new Overlay(W, H, S, words);
  engine.setOverlay(overlay.canvas);

  const env = makeEnvironment(engine.renderer);
  window.FLAGS = params;
  const A = makeAssets();
  const scenes = { kitchen: createKitchen(env, A) };
  const mods = await Promise.all([
    import('./cutaway.js').catch(() => null), import('./molecules.js').catch(() => null), import('./potato.js').catch(() => null)]);
  if (mods[0]) scenes.cutaway = mods[0].createCutaway(env, A);
  if (mods[1]) scenes.molecules = mods[1].createMolecules(env, A);
  if (mods[2]) scenes.potato = mods[2].createPotato(env, A);

  const TL = buildTimeline(scenes, words);

  window.renderFrame = (f) => {
    const t = f / FPS;
    const act = TL.shots.filter(s => t >= s.from && t < s.to && scenes[s.scene]);
    const views = [];
    let trans = null;
    for (const s of act.slice(0, 2)) views.push(s.view(t));
    if (act.length > 1) {
      const nxt = act[1];
      const m = (t - nxt.from) / (act[0].to - nxt.from);
      trans = { type: nxt.trans.type, m: nxt.trans.ease ? nxt.trans.ease(m) : m, c: nxt.trans.c };
    }
    if (!views.length) return 'empty';
    window.FLAGS = params;
    if (params.has('empty')) { engine.renderer.setRenderTarget(null); engine.renderer.clear(); return 'empty'; }
    for (const s of Object.values(scenes)) if (s.scene) s.scene.traverse(o => { if (params.has('nosteam') && o.isSprite) o.visible = false; if (params.has('nofield') && o.material && o.material.blending === THREE.AdditiveBlending && o.material.isShaderMaterial) o.visible = false; });
    const post = TL.post(t, f);
    TL.labels = [];
    // views prepare (inside engine.frame) may publish 3D label anchors; draw overlay after a dry prepare pass
    for (const v of views) if (v.prepare) v.prepare();
    TL.labels = views.flatMap(v => v.labels || []);
    TL.tags = views.flatMap(v => v.tags || []);
    overlay.draw(t, TL, views);
    engine.frame(views, trans, post);
    return 'ok';
  };
  window.FRAMES = Math.round(40 * FPS);
  window.ready = true;
}
init().catch(e => { console.error('INIT FAIL', e.stack || e); window.initError = String(e.stack || e); });
