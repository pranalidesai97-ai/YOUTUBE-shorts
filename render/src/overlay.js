import { clamp, ease, prog, lerp } from './util.js';
import { wordFinder } from './timeline.js';

const CYAN = '#5fe6ff', CYAN_SOFT = '#a9f1ff', AMBER = '#ffb23f', VIOLET = '#9c8cff', WHITE = '#f4f7fb';

// Caption chunks (exact narration text, split into readable phrases)
const CHUNKS = [
  "Your microwave doesn't use fire—", "and it doesn't make food radioactive.",
  "It uses invisible electromagnetic waves.",
  "A component called a magnetron", "generates them, and the metal walls", "reflect them around the oven.",
  "When the waves enter your food,", "their changing electric field", "makes water molecules continually reorient.",
  "That transfers energy into the food as heat.",
  "But here's the twist:", "microwaves don't cook food magically", "from the inside out.",
  "They penetrate only so far;", "heat then travels inward.",
  "That's why some bites are scorching", "while others stay cold—", "and why the turntable matters.",
];
// highlighted keywords (lower-case, punctuation stripped) -> colour
const HL = { invisible: CYAN, magnetron: CYAN, water: CYAN, molecules: CYAN, heat: AMBER, turntable: CYAN };

export class Overlay {
  constructor(W, H, S, words) {
    this.S = S; this.W = W; this.H = H;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.words = words.words;
    this.Wd = wordFinder(words);
    // map chunks onto timed words
    let wi = 0;
    this.chunks = CHUNKS.map(txt => {
      const toks = txt.split(' ');
      const items = toks.map(tok => {
        const n = tok.replace(/[^A-Za-z']/g, '').length ? tok.split('—').filter(Boolean).length : 0;
        const ws = this.words.slice(wi, wi + n); wi += n;
        return { tok, ws };
      });
      const all = items.flatMap(i => i.ws);
      return { items, s: all[0].s, e: all[all.length - 1].e };
    });
    if (wi !== this.words.length) console.error('caption mapping mismatch', wi, this.words.length);
    this.chunks.forEach((c, i) => {
      const nx = this.chunks[i + 1];
      c.in = c.s - 0.12;
      c.out = nx ? Math.min(nx.s - 0.12, c.e + 0.9) : c.e + 0.55;
    });
  }

  // ---------- helpers
  font(w, size, fam = 'InterD') { this.ctx.font = `${w} ${size * this.S}px ${fam}`; }
  px(v) { return v * this.S; }

  tracked(text, x, y, track, align = 'center', perChar = null) {
    const c = this.ctx; const tr = track * this.S;
    const ws = [...text].map(ch => c.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + tr * (ws.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    [...text].forEach((ch, i) => {
      if (perChar) perChar(ch, cx, y, i, ws[i]); else c.fillText(ch, cx, y);
      cx += ws[i] + tr;
    });
    return total;
  }

  // ---------- elements
  headline(t) {
    const t0 = 0.3, tOut = 4.25;
    if (t < t0 || t > tOut + 0.5) return;
    const c = this.ctx, S = this.S;
    const out = prog(tOut, tOut + 0.45, t, ease.in);
    c.save(); c.textBaseline = 'alphabetic';
    // kicker
    const kA = prog(t0, t0 + 0.5, t) * (1 - out);
    this.font(600, 24, 'InterR'); c.fillStyle = CYAN; c.globalAlpha = kA;
    this.tracked('EVERYDAY SCIENCE', 540 * S, 300 * S - out * 30 * S, 7 + (1 - prog(t0, t0 + 0.8, t, ease.out)) * 6);
    // rule
    const rl = prog(t0 + 0.15, t0 + 0.95, t, ease.outExpo);
    c.globalAlpha = 1 - out; c.strokeStyle = CYAN; c.lineWidth = 2 * S;
    c.beginPath(); c.moveTo((540 - 150 * rl) * S, 326 * S); c.lineTo((540 + 150 * rl) * S, 326 * S); c.stroke();
    // two lines, per-letter rise through a mask
    const lines = [['HOW DOES A', 410, 78], ['MICROWAVE WORK?', 500, 92]];
    lines.forEach(([txt, y, size], li) => {
      this.font(800, size, 'InterD');
      const yy = y * S - out * 50 * S;
      c.save();
      c.beginPath(); c.rect(0, yy - size * 1.05 * S, this.W, size * 1.32 * S); c.clip();
      const track = lerp(10, 1.5, prog(t0 + li * 0.12, t0 + 1.4, t, ease.outExpo));
      this.tracked(txt, 540 * S, yy, track, 'center', (ch, x, y2, i) => {
        const st = t0 + 0.1 + li * 0.16 + i * 0.028;
        const p = prog(st, st + 0.55, t, ease.outExpo);
        c.globalAlpha = p * (1 - out);
        const grad = c.createLinearGradient(0, y2 - size * S, 0, y2);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, li === 1 ? '#cfefff' : '#e9eef5');
        c.fillStyle = grad;
        c.shadowColor = 'rgba(0,10,25,.65)'; c.shadowBlur = 24 * S;
        c.fillText(ch, x, y2 + (1 - p) * size * 1.1 * S);
      });
      c.restore();
    });
    c.restore();
  }

  // generic title block: kicker + 1-2 lines
  title(t, a, b, opt) {
    if (t < a - 0.05 || t > b + 0.5) return;
    const c = this.ctx, S = this.S;
    const inp = prog(a, a + 0.6, t, ease.outExpo), out = prog(b, b + 0.4, t, ease.in);
    const y0 = (opt.y ?? 330) - out * 24;
    c.save(); c.textBaseline = 'alphabetic';
    if (opt.kicker) {
      this.font(600, 22, 'InterR'); c.globalAlpha = inp * (1 - out); c.fillStyle = opt.kcolor ?? CYAN;
      this.tracked(opt.kicker, 540 * S, (y0 - 62) * S, 6);
      c.strokeStyle = opt.kcolor ?? CYAN; c.lineWidth = 2 * S; const L = 46 * inp;
      c.beginPath(); c.moveTo((540 - L) * S, (y0 - 44) * S); c.lineTo((540 + L) * S, (y0 - 44) * S); c.stroke();
    }
    opt.lines.forEach((ln, i) => {
      const [txt, size, color, weight] = ln;
      const st = a + 0.08 + i * 0.14;
      const p = prog(st, st + 0.7, t, ease.outExpo);
      const y = (y0 + i * (size * 1.12) + size * 0.4) * S;
      this.font(weight ?? 800, size, 'InterD');
      c.save();
      c.beginPath(); c.rect(0, y - size * 1.05 * S, this.W, size * 1.35 * S); c.clip();
      c.globalAlpha = (1 - out) * clamp(p * 1.4);
      c.fillStyle = color ?? WHITE; c.shadowColor = 'rgba(0,8,20,.7)'; c.shadowBlur = 22 * S;
      this.tracked(txt, 540 * S, y + (1 - p) * size * 0.9 * S, lerp(5, 1.2, p));
      c.restore();
    });
    c.restore();
  }

  arrowTitle(t, a, b, left, right, y, cl, cr, size = 50) {
    if (t < a - 0.05 || t > b + 0.5) return;
    const c = this.ctx, S = this.S;
    const out = prog(b, b + 0.4, t, ease.in);
    const p1 = prog(a, a + 0.5, t, ease.outExpo), pa = prog(a + 0.35, a + 1.0, t, ease.inOut), p2 = prog(a + 0.85, a + 1.35, t, ease.outExpo);
    this.font(800, size, 'InterD');
    const g = 26, aw = 96;
    const lw = this.tracked.call({ ctx: { measureText: s => c.measureText(s) }, S }, left, 0, 0, 1.2, 'left', () => {});
    const rw = this.tracked.call({ ctx: { measureText: s => c.measureText(s) }, S }, right, 0, 0, 1.2, 'left', () => {});
    const total = lw + rw + (aw + 2 * g) * S;
    let x = 540 * S - total / 2; const yy = (y - out * 20) * S;
    c.save(); c.textBaseline = 'alphabetic'; c.shadowColor = 'rgba(0,8,20,.7)'; c.shadowBlur = 20 * S;
    c.globalAlpha = p1 * (1 - out); c.fillStyle = cl;
    this.tracked(left, x, yy + (1 - p1) * 18 * S, 1.2, 'left');
    x += lw + g * S;
    // arrow with gradient from left colour to right colour
    const ay = yy - size * 0.36 * S;
    const grad = c.createLinearGradient(x, 0, x + aw * S, 0); grad.addColorStop(0, cl); grad.addColorStop(1, cr);
    c.globalAlpha = 1 - out; c.strokeStyle = grad; c.lineWidth = 5 * S; c.lineCap = 'round';
    c.shadowColor = cr; c.shadowBlur = 16 * S * pa;
    c.beginPath(); c.moveTo(x, ay); c.lineTo(x + aw * S * pa, ay); c.stroke();
    if (pa > 0.6) {
      const hp = (pa - 0.6) / 0.4; const hx = x + aw * S;
      c.beginPath(); c.moveTo(hx - 18 * S * hp, ay - 16 * S * hp); c.lineTo(hx, ay); c.lineTo(hx - 18 * S * hp, ay + 16 * S * hp); c.stroke();
    }
    x += (aw + g) * S;
    c.shadowColor = 'rgba(0,8,20,.7)'; c.shadowBlur = 20 * S;
    c.globalAlpha = p2 * (1 - out); c.fillStyle = cr;
    c.shadowColor = cr; c.shadowBlur = 28 * S * p2;
    this.tracked(right, x, yy + (1 - p2) * 18 * S, 1.2, 'left');
    c.restore();
  }

  labels(list) {
    const c = this.ctx, S = this.S;
    for (const L of list || []) {
      if (L.alpha <= 0.001) continue;
      const p = L.alpha;
      c.save(); c.globalAlpha = clamp(p * 1.5);
      const ax = L.anchor[0] * this.W, ay = L.anchor[1] * this.H;
      const exT = L.elbow[0] * this.W, eyT = L.elbow[1] * this.H;
      const lp = prog(0, 0.55, p, ease.out);
      const ex = lerp(ax, exT, lp), ey = lerp(ay, eyT, lp);
      // anchor
      c.fillStyle = CYAN; c.shadowColor = CYAN; c.shadowBlur = 14 * S;
      c.beginPath(); c.arc(ax, ay, 6 * S, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(95,230,255,.6)'; c.lineWidth = 2 * S;
      c.beginPath(); c.arc(ax, ay, (13 + 5 * Math.sin(L.t * 4)) * S, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = CYAN_SOFT; c.lineWidth = 2.5 * S;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke();
      // text pill
      this.font(700, 34, 'InterD');
      const tw = this.tracked.call({ ctx: { measureText: s => c.measureText(s) }, S }, L.text, 0, 0, 4, 'left', () => {});
      const w = tw + 40 * S, h = 62 * S;
      const left = L.dir >= 0 ? exT : exT - w, top = eyT - h / 2;
      const tp = prog(0.4, 1, p, ease.out);
      c.globalAlpha = tp;
      c.fillStyle = 'rgba(4,10,22,.75)'; c.strokeStyle = 'rgba(95,230,255,.5)'; c.lineWidth = 1.5 * S;
      c.beginPath(); c.roundRect(left, top, w, h, 10 * S); c.fill(); c.stroke();
      c.fillStyle = CYAN; c.fillRect(L.dir >= 0 ? left : left + w - 4 * S, top + 12 * S, 4 * S, h - 24 * S);
      c.fillStyle = WHITE; c.textBaseline = 'middle';
      this.tracked(L.text, left + 20 * S, eyT + 1 * S, 4, 'left');
      c.restore();
    }
  }

  tags(list) {
    const c = this.ctx, S = this.S;
    for (const g of list || []) {
      if (g.alpha <= 0.001) continue;
      c.save(); c.globalAlpha = g.alpha;
      this.font(600, 40, 'InterR'); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = g.color; c.shadowColor = 'rgba(0,0,0,.85)'; c.shadowBlur = 12 * S;
      c.fillText(g.text, g.anchor[0] * this.W, g.anchor[1] * this.H);
      c.restore();
    }
  }

  legend(t, a, b) {
    if (t < a || t > b + 0.4) return;
    const c = this.ctx, S = this.S;
    const p = prog(a, a + 0.5, t, ease.out) * (1 - prog(b, b + 0.4, t));
    const items = [[VIOLET, CYAN, 'MICROWAVE ENERGY', a], [AMBER, '#ff7a2a', 'HEAT', a + 3.6]];
    c.save(); this.font(600, 25, 'InterR'); c.textBaseline = 'middle';
    let x = 230 * S; const y = 1165 * S;
    for (const [c1, c2, txt, st] of items) {
      const q = p * prog(st, st + 0.5, t, ease.out);
      c.globalAlpha = q;
      const g = c.createLinearGradient(x, 0, x + 40 * S, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
      c.fillStyle = g; c.shadowColor = c2; c.shadowBlur = 12 * S;
      c.beginPath(); c.roundRect(x, y - 7 * S, 40 * S, 14 * S, 7 * S); c.fill();
      c.shadowColor = 'rgba(0,0,0,.9)'; c.shadowBlur = 10 * S; c.fillStyle = '#f2f6fb';
      const w = this.tracked(txt, x + 54 * S, y, 3, 'left');
      x += (54 + 60) * S + w;
    }
    c.restore();
  }

  note(t, a, b, txt, y = 1150) {
    if (t < a || t > b + 0.4) return;
    const c = this.ctx, S = this.S;
    c.save(); c.globalAlpha = 0.9 * prog(a, a + 0.6, t) * (1 - prog(b, b + 0.4, t));
    this.font(600, 21, 'InterR'); c.fillStyle = '#c9d6e6'; c.shadowColor = 'rgba(0,0,0,.9)'; c.shadowBlur = 10 * S; c.textBaseline = 'middle';
    this.tracked(txt, 540 * S, y * S, 4);
    c.restore();
  }

  captions(t) {
    const c = this.ctx, S = this.S;
    const ch = this.chunks.find(k => t >= k.in && t < k.out + 0.2);
    if (!ch) return;
    const a = prog(ch.in, ch.in + 0.2, t, ease.out) * (1 - prog(ch.out, ch.out + 0.16, t));
    if (a <= 0) return;
    const size = 48, lh = 62, maxW = 800 * S;
    this.font(600, size, 'InterR');
    c.save(); c.textBaseline = 'middle';
    const space = c.measureText(' ').width;
    // layout words into lines
    const lines = [[]]; let lw = 0;
    for (const it of ch.items) {
      const w = c.measureText(it.tok).width;
      if (lw > 0 && lw + space + w > maxW) { lines.push([]); lw = 0; }
      lines[lines.length - 1].push({ ...it, w }); lw += (lw > 0 ? space : 0) + w;
    }
    const widths = lines.map(l => l.reduce((s, x) => s + x.w, 0) + space * (l.length - 1));
    const boxW = Math.max(...widths) + 56 * S, boxH = (lines.length * lh + 30) * S;
    const cy = 1290 * S - (1 - a) * -14 * S;
    const top = cy - boxH / 2;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(5,9,18,.58)';
    c.beginPath(); c.roundRect(540 * S - boxW / 2, top, boxW, boxH, 18 * S); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1.5 * S; c.stroke();
    lines.forEach((l, li) => {
      let x = 540 * S - widths[li] / 2;
      const y = top + (15 + lh * li + lh / 2) * S;
      for (const it of l) {
        const key = it.tok.toLowerCase().replace(/[^a-z']/g, '');
        const hl = HL[key];
        if (hl) {
          const w0 = it.ws[0];
          const glow = w0 ? prog(w0.s - 0.05, w0.s + 0.15, t) * (1 - prog(w0.e + 0.2, w0.e + 0.8, t)) : 0;
          c.fillStyle = hl; c.shadowColor = hl; c.shadowBlur = (6 + 16 * glow) * S;
        } else { c.fillStyle = WHITE; c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 6 * S; }
        c.fillText(it.tok, x, y);
        x += it.w + space;
      }
    });
    c.restore();
  }

  draw(t, TL, views) {
    const c = this.ctx; c.clearRect(0, 0, this.W, this.H);
    const T = TL.T;
    this.headline(t);
    this.title(t, T.invisible - 0.15, 8.0, { lines: [['INVISIBLE', 72, CYAN, 800], ['ELECTROMAGNETIC WAVES', 52, WHITE, 700]], y: 320 });
    this.labels(TL.labels);
    this.tags(TL.tags);
    this.title(t, T.water - 0.25, T.transfers - 0.45, { kicker: 'MOLECULAR SCALE', lines: [['WATER MOLECULES', 70, WHITE, 800]], y: 300 });
    this.title(t, T.reorient - 0.6, T.transfers - 0.45, { lines: [['THEY REORIENT IN AN', 40, CYAN_SOFT, 600], ['ALTERNATING FIELD', 40, CYAN_SOFT, 600]], y: 405 });
    this.note(t, 16.9, T.transfers - 0.3, 'ILLUSTRATIVE · NOT TO SCALE', 1175);
    this.arrowTitle(t, T.transfers + 0.15, T.but - 0.5, 'ABSORBED ENERGY', 'HEAT', 330, CYAN_SOFT, AMBER, 52);
    this.title(t, T.but - 0.05, T.mw2 - 0.35, { lines: [["HERE'S THE TWIST", 56, AMBER, 800]], y: 320 });
    this.title(t, T.mw2 - 0.2, T.they - 0.25, { kicker: 'MYTH', kcolor: AMBER, lines: [['NOT MAGICALLY FROM', 54, WHITE, 800], ['THE INSIDE OUT', 54, WHITE, 800]], y: 320 });
    this.arrowTitle(t, T.they - 0.05, 33.2, 'ENERGY ABSORPTION', 'HEAT SPREADS', 330, '#b9b0ff', AMBER, 44);
    this.legend(t, T.mw2 + 0.3, 33.1);
    this.title(t, T.scorching - 0.3, T.cold + 0.3, { lines: [['HOT SPOTS', 76, AMBER, 800], ['ARE REAL', 76, WHITE, 800]], y: 300 });
    this.title(t, T.cold + 0.45, T.matters + 0.4, { lines: [['THE TURNTABLE', 72, WHITE, 800], ['HELPS', 72, CYAN, 800]], y: 300 });
    this.final(t, T);
    this.captions(t);
  }

  final(t, T) {
    const a = T.matters + 1.0; if (t < a) return;
    const c = this.ctx, S = this.S;
    const p = prog(a, a + 0.9, t, ease.out);
    c.save(); c.textBaseline = 'alphabetic';
    c.globalAlpha = p; c.strokeStyle = 'rgba(255,200,130,.8)'; c.lineWidth = 1.5 * S;
    const L = 120 * prog(a + 0.1, a + 1.0, t, ease.outExpo);
    c.beginPath(); c.moveTo((540 - L) * S, 372 * S); c.lineTo((540 + L) * S, 372 * S); c.stroke();
    this.font(600, 44, 'InterD'); c.fillStyle = '#dfe8f2'; c.shadowColor = 'rgba(0,8,20,.8)'; c.shadowBlur = 24 * S;
    this.tracked('EVERYDAY SCIENCE,', 540 * S, 330 * S + (1 - p) * 12 * S, lerp(14, 8, p));
    this.font(700, 46, 'InterD');
    this.tracked('EXPLAINED.', 540 * S, 430 * S + (1 - p) * 12 * S, lerp(14, 8, p));
    c.restore();
  }
}
