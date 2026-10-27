import * as THREE from 'three';
import { canvasTex, pixelTex, fbm, vnoise, rng, mixc, clamp } from './util.js';

// Studio environment used for reflections: dark navy room, a large warm
// softbox, a cool rim strip and a faint amber kicker.
export function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x05070d, side: THREE.BackSide }));
  s.add(room);
  const panel = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(look); s.add(m);
  };
  const o = new THREE.Vector3();
  panel(26, 14, 0xfff1df, 2.2, new THREE.Vector3(-18, 22, 18), o);   // key softbox
  panel(4, 30, 0x7fe9ff, 2.0, new THREE.Vector3(28, 8, -14), o);     // cyan rim strip
  panel(30, 3, 0xffb066, 0.9, new THREE.Vector3(0, -6, -30), o);     // amber kicker
  panel(8, 8, 0xcfe4ff, 0.8, new THREE.Vector3(10, 30, 6), o);       // top fill
  panel(40, 6, 0x141a26, 1.0, new THREE.Vector3(0, -20, 0), new THREE.Vector3(0, 0, 0)); // floor bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}

export function makeAssets() {
  const A = {};

  A.glow = canvasTex(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)');
    g.addColorStop(.6, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });

  A.shadow = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(.55, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });

  // soft wispy smoke puff
  A.smoke = pixelTex(256, 256, (u, v) => {
    const dx = u - .5, dy = v - .5, r = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = fbm(u * 4, v * 4, 4, 5, 3);
    const a = clamp((1 - r) * 1.4) ** 1.6 * clamp(n * 1.7 - 0.35);
    return [255, 255, 255, a * 255];
  });

  // blurred kitchen background with bokeh
  A.bokeh = canvasTex(1024, 1820, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04060c'); g.addColorStop(.45, '#0a1220'); g.addColorStop(.7, '#0b0f18'); g.addColorStop(1, '#030407');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // cool window glow, left
    let rg = c.createRadialGradient(w * .12, h * .38, 0, w * .12, h * .38, w * .55);
    rg.addColorStop(0, 'rgba(60,120,170,.35)'); rg.addColorStop(1, 'rgba(60,120,170,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    rg = c.createRadialGradient(w * .85, h * .5, 0, w * .85, h * .5, w * .5);
    rg.addColorStop(0, 'rgba(160,90,40,.25)'); rg.addColorStop(1, 'rgba(160,90,40,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    const R = rng(7);
    c.filter = 'blur(6px)';
    for (let i = 0; i < 46; i++) {
      const warm = R() < .62;
      const x = R() * w, y = h * (.18 + R() * .5), r = 18 + R() ** 2 * 70;
      const a = .05 + R() * .16;
      c.fillStyle = warm ? `rgba(255,${170 + R() * 50 | 0},${90 + R() * 40 | 0},${a})` : `rgba(${110 + R() * 40 | 0},${200 + R() * 40 | 0},255,${a})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = `rgba(255,255,255,${a * .5})`; c.lineWidth = 2; c.stroke();
    }
    // pendant lights
    for (const [x, y] of [[.25, .2], [.62, .17], [.9, .22]]) {
      const pg = c.createRadialGradient(w * x, h * y, 0, w * x, h * y, 90);
      pg.addColorStop(0, 'rgba(255,214,150,.75)'); pg.addColorStop(.3, 'rgba(255,170,90,.25)'); pg.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = pg; c.fillRect(0, 0, w, h);
    }
    c.filter = 'none';
  });

  // perforated door screen: opaque metal with round holes (alpha)
  A.doorMesh = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#444';
    for (const [x, y] of [[16, 16], [48, 48], [48, 16], [16, 48]]) { c.beginPath(); c.arc(x, y, 11.5, 0, Math.PI * 2); c.fill(); }
  }, { linear: true, repeat: [210, 160] });

  // brushed metal roughness (streaks along u)
  A.brushed = pixelTex(512, 512, (u, v) => {
    const n = fbm(u * 2, v * 140, 2, 3, 11) * .7 + vnoise(u * 400, v * 2, 400, 5) * .3;
    const r = 70 + n * 70; return [r, r, r];
  }, { linear: true, repeat: [1, 1] });

  A.counter = pixelTex(1024, 1024, (u, v) => {
    const n = fbm(u * 6, v * 6, 6, 6, 21), m = fbm(u * 30, v * 30, 30, 3, 9);
    const b = 14 + n * 22 + (m > .72 ? 30 : 0);
    return [b * .92, b * .97, b * 1.08];
  }, { repeat: [3, 1.2] });

  A.enamel = pixelTex(512, 512, (u, v) => {
    const n = fbm(u * 8, v * 8, 8, 4, 31);
    const b = 196 + n * 26; return [b, b * .99, b * .96];
  });

  // vegetable stew sauce
  A.stew = pixelTex(1024, 1024, (u, v) => {
    const n = fbm(u * 5, v * 5, 5, 6, 41), m = fbm(u * 18, v * 18, 18, 4, 43), o = fbm(u * 40, v * 40, 40, 2, 47);
    let c = mixc([132, 34, 14], [214, 92, 30], clamp(n * 1.6 - .3));
    c = mixc(c, [238, 148, 54], clamp((m - .62) * 4) * .6);        // oil sheen
    c = mixc(c, [92, 22, 10], clamp((.38 - m) * 4) * .5);           // depth
    if (o > .74) c = mixc(c, [70, 120, 40], .7);                     // herb flecks
    if (o < .22) c = mixc(c, [255, 190, 110], .35);                  // pepper
    return c;
  });

  A.potatoSkin = pixelTex(512, 512, (u, v) => {
    const n = fbm(u * 8, v * 8, 8, 6, 61), m = fbm(u * 40, v * 40, 40, 3, 63);
    let c = mixc([120, 82, 46], [176, 132, 82], n);
    if (m > .7) c = mixc(c, [80, 52, 30], .7);
    return c;
  });
  A.potatoBump = pixelTex(512, 512, (u, v) => { const n = fbm(u * 16, v * 16, 16, 5, 67); const b = n * 255; return [b, b, b]; }, { linear: true });

  A.display = makeDisplayTex('0:30');
  return A;
}

export function makeDisplayTex(txt) {
  return canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.font = '600 64px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(80,220,255,.9)'; c.shadowBlur = 14; c.fillStyle = '#8ff0ff';
    c.fillText(txt, w / 2, h / 2 + 2);
  });
}
