// Frame renderer: drives index.html in headless Chromium (SwiftShader WebGL)
// usage: node render.cjs --s 1 --frames 0:1200[:step] | --frames 10,20 --out ../build/frames [--port 8123]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? a.concat([[x.slice(2), arr[i + 1]]]) : a), []));
const ROOT = path.resolve(__dirname, '..');
const FONTS = '/usr/share/fonts/opentype/inter';
const scale = parseFloat(args.s || '1');
const out = path.resolve(args.out || path.join(ROOT, 'build/frames'));
const port = parseInt(args.port || '8123');
const quality = parseInt(args.q || '95');
fs.mkdirSync(out, { recursive: true });

let frames = [];
const fspec = args.frames || '0:1200';
if (fspec.includes(':')) { const [a, b, st] = fspec.split(':').map(Number); for (let f = a; f < b; f += (st || 1)) frames.push(f); }
else frames = fspec.split(',').map(Number);
if (args.skipExisting) frames = frames.filter(f => !fs.existsSync(path.join(out, `f_${String(f).padStart(4, '0')}.jpg`)));

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.otf': 'font/otf' };
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const p = u.startsWith('/fonts/') ? path.join(FONTS, path.basename(u)) : path.join(ROOT, u);
  fs.readFile(p, (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d);
  });
}).listen(port);

(async () => {
  const W = Math.round(1080 * scale), H = Math.round(1920 * scale);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || /INIT|DBG/.test(m.text())) console.log('PAGE', m.type(), m.text().slice(0, 400)); });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto(`http://localhost:${port}/render/index.html?s=${scale}${args.flags ? '&' + args.flags : ''}`);
  await p.waitForFunction('window.ready || window.initError', null, { timeout: 300000 });
  const err = await p.evaluate('window.initError');
  if (err) { console.log('init error', err); process.exit(1); }
  const T0 = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const r = await p.evaluate(f => window.renderFrame(f), f);
    const buf = await p.screenshot({ type: 'jpeg', quality, clip: { x: 0, y: 0, width: W, height: H } });
    fs.writeFileSync(path.join(out, `f_${String(f).padStart(4, '0')}.jpg`), buf);
    if (i % 10 === 0 || i === frames.length - 1) {
      const el = (Date.now() - T0) / 1000;
      console.log(`frame ${f} ${r} [${i + 1}/${frames.length}] ${(el / (i + 1)).toFixed(2)}s/f eta ${((frames.length - i - 1) * el / (i + 1) / 60).toFixed(1)}min`);
    }
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
