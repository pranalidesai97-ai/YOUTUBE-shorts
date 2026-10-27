import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, clamp, smooth } from './util.js';
import { fieldUniforms, makeFieldVolume, makeIntensityFn } from './wavefield.js';

// Microwave geometry (decimetres). Cavity interior box:
export const CAV_MIN = new THREE.Vector3(-2.35, 0.35, -1.75);
export const CAV_MAX = new THREE.Vector3(1.05, 2.75, 1.85);
export const PORT = new THREE.Vector3(1.0, 2.25, 0.35);      // waveguide opening, right wall
export const TT_CENTER = new THREE.Vector3(-0.65, 0, 0.05);   // turntable axis
const FOOD_Y = 0.98;

const HEAT_GLSL = /* glsl */`
uniform float uHeatMix; uniform float uSpread; uniform float uMapMix; uniform sampler2D uHeatTex;
uniform vec3 uTTC; uniform float uRot; uniform float uScanX; uniform float uScanMix; uniform float uTime;
varying vec3 vHW;
vec3 thermal(float h){
  vec3 a = vec3(0.04,0.13,0.30), b = vec3(0.08,0.42,0.58), c = vec3(1.0,0.63,0.20), d = vec3(1.0,0.30,0.07);
  return h < 0.38 ? mix(a,b,h/0.38) : (h < 0.68 ? mix(b,c,(h-0.38)/0.30) : mix(c,d,(h-0.68)/0.32));
}
float hnoise(vec2 p){ return 0.5+0.25*sin(p.x*7.1+sin(p.y*5.3))+0.25*sin(p.y*6.7+sin(p.x*4.1)); }
`;

function addHeat(mat, U) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 hw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hw = instanceMatrix * hw;
        #endif
        vHW = (modelMatrix * hw).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HEAT_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 rel = vHW.xz - uTTC.xz;
        float rn = length(rel) / 0.95;
        // mode 0: absorbed energy spreading as heat (organic gradient)
        float d = 0.55 * hnoise(vHW.xz * 1.3) + 0.45 * (1.0 - rn);
        float h0 = smoothstep(0.0, 0.45, uSpread * 1.5 - (1.0 - d));
        vec3 amber = mix(vec3(1.0,0.55,0.16), vec3(1.0,0.78,0.42), h0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0,0.78,0.55), uHeatMix * h0 * 0.6);
        totalEmissiveRadiance += amber * h0 * uHeatMix * 0.38;
        // mode 1: accumulated hot-spot map in turntable coordinates
        float cr = cos(uRot), sr = sin(uRot);
        vec2 loc = vec2(cr * rel.x - sr * rel.y, sr * rel.x + cr * rel.y);
        float h1 = texture2D(uHeatTex, loc / 2.0 + 0.5).r;
        vec3 th = thermal(h1);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.25, uMapMix);
        totalEmissiveRadiance += th * uMapMix * 0.85;
        // scanner: right of the scan line shows an analytic false-colour view
        float sx = vHW.x - uScanX;
        float holo = step(0.0, sx) * uScanMix;
        float lum = dot(diffuseColor.rgb, vec3(0.3,0.59,0.11));
        float grid = smoothstep(0.92, 1.0, max(abs(sin(vHW.x*18.0)), abs(sin(vHW.z*18.0))));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.55,0.85,1.0) * 0.75, holo * 0.85);
        totalEmissiveRadiance += vec3(0.2,0.75,1.0) * (holo * (0.03 + 0.16 * grid) + uScanMix * exp(-pow(sx * 16.0, 2.0)) * 3.0);
      `);
  };
  mat.customProgramCacheKey = () => 'heat';
}

export function createKitchen(env, A) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(0x020308);

  const U = {
    uHeatMix: { value: 0 }, uSpread: { value: 0 }, uMapMix: { value: 0 }, uHeatTex: { value: null },
    uTTC: { value: TT_CENTER.clone() }, uRot: { value: 0 }, uScanX: { value: 10 }, uScanMix: { value: 0 }, uTime: { value: 0 },
  };

  // ---------- materials
  const body = new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.85, roughness: 0.3, roughnessMap: A.brushed, envMapIntensity: 1.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.22, roughnessMap: A.brushed });
  const blackGlass = new THREE.MeshStandardMaterial({ color: 0x07090c, metalness: 0.2, roughness: 0.06, envMapIntensity: 1.8 });
  const enamel = new THREE.MeshStandardMaterial({ color: 0x7d838c, map: A.enamel, metalness: 0.55, roughness: 0.36, roughnessMap: A.brushed, envMapIntensity: 0.7 });

  // ---------- kitchen environment
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(56, 100), new THREE.MeshBasicMaterial({ map: A.bokeh, toneMapped: true }));
  bg.position.set(0, 14, -30); scene.add(bg);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, map: A.counter, roughness: 0.22, envMapIntensity: 0.9 }));
  counter.position.set(0, -0.5, -1); scene.add(counter);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 5.6), new THREE.MeshBasicMaterial({ map: A.shadow, transparent: true, depthWrite: false, opacity: 0.95 }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(0, 0.005, 0.1); scene.add(contact);

  // ---------- microwave shell
  const mw = new THREE.Group(); scene.add(mw);
  const box = (w, h, d, x, y, z, m, r = 0.04) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m); b.position.set(x, y, z); mw.add(b); return b; };
  const topBox = box(5.2, 0.14, 4.0, 0, 3.03, 0, body, 0.06);   // top
  box(5.2, 0.16, 4.0, 0, 0.08, 0, body, 0.05);   // bottom
  box(0.16, 3.1, 4.0, -2.52, 1.55, 0, body);     // left
  box(5.2, 3.1, 0.12, 0, 1.55, -1.94, body);     // back
  box(1.42, 3.1, 4.0, 1.89, 1.55, 0, body, 0.06); // control block
  for (const x of [-2.2, 2.2]) for (const z of [-1.6, 1.6]) box(0.4, 0.06, 0.4, x, -0.02, z, blackGlass, 0.02);
  // front bezel around the cavity opening
  {
    const s = new THREE.Shape(); s.moveTo(-2.6, 0); s.lineTo(1.18, 0); s.lineTo(1.18, 3.1); s.lineTo(-2.6, 3.1); s.lineTo(-2.6, 0);
    const hole = new THREE.Path(); hole.moveTo(CAV_MIN.x, CAV_MIN.y); hole.lineTo(CAV_MAX.x, CAV_MIN.y); hole.lineTo(CAV_MAX.x, CAV_MAX.y); hole.lineTo(CAV_MIN.x, CAV_MAX.y); hole.lineTo(CAV_MIN.x, CAV_MIN.y);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    const m = new THREE.Mesh(g, body); m.position.z = 1.9; mw.add(m);
  }
  // cavity liners
  const cx = (CAV_MIN.x + CAV_MAX.x) / 2, cy = (CAV_MIN.y + CAV_MAX.y) / 2, cz = (CAV_MIN.z + CAV_MAX.z) / 2;
  const sx = CAV_MAX.x - CAV_MIN.x, sy = CAV_MAX.y - CAV_MIN.y, sz = CAV_MAX.z - CAV_MIN.z;
  const liner = (w, h, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), enamel); m.position.copy(pos); m.rotation.set(...rot); mw.add(m); return m; };
  liner(sx, sy, new THREE.Vector3(cx, cy, CAV_MIN.z), [0, 0, 0]);
  liner(sz, sy, new THREE.Vector3(CAV_MIN.x, cy, cz), [0, Math.PI / 2, 0]);
  liner(sz, sy, new THREE.Vector3(CAV_MAX.x, cy, cz), [0, -Math.PI / 2, 0]);
  const topLiner = liner(sx, sz, new THREE.Vector3(cx, CAV_MAX.y, cz), [Math.PI / 2, 0, 0]);
  liner(sx, sz, new THREE.Vector3(cx, CAV_MIN.y, cz), [-Math.PI / 2, 0, 0]);
  // waveguide cover (mica) on the right wall
  const mica = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshStandardMaterial({ color: 0xbfa77c, roughness: 0.6, metalness: 0.0 }));
  mica.position.set(CAV_MAX.x - 0.005, PORT.y, PORT.z); mica.rotation.y = -Math.PI / 2; mw.add(mica);
  // lamp lens top-right
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0x7a6a50 }));
  lens.position.set(0.6, CAV_MAX.y - 0.005, -0.8); lens.rotation.x = Math.PI / 2; mw.add(lens);

  // control panel
  const panel = box(1.24, 2.9, 0.05, 1.89, 1.55, 2.02, blackGlass, 0.02);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.32), new THREE.MeshBasicMaterial({ map: A.display, toneMapped: false }));
  disp.position.set(1.89, 2.62, 2.05); mw.add(disp);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 64), trim); dial.rotation.x = Math.PI / 2; dial.position.set(1.89, 1.7, 2.1); mw.add(dial);
  const dialCap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 48), blackGlass); dialCap.rotation.x = Math.PI / 2; dialCap.position.set(1.89, 1.7, 2.165); mw.add(dialCap);
  const dialMark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.01), new THREE.MeshBasicMaterial({ color: 0x8ff0ff })); dialMark.position.set(1.89, 1.86, 2.18); mw.add(dialMark);
  for (const y of [0.95, 0.6]) {
    box(0.86, 0.22, 0.05, 1.89, y, 2.06, body, 0.05);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.02), new THREE.MeshBasicMaterial({ color: 0x7fe8ff })); led.position.set(1.89, y, 2.09); mw.add(led);
  }

  // door (hinged on the left)
  const door = new THREE.Group(); door.position.set(-2.6, 0, 2.02); mw.add(door);
  {
    const s = new THREE.Shape(); s.moveTo(0, 0.04); s.lineTo(3.76, 0.04); s.lineTo(3.76, 3.06); s.lineTo(0, 3.06); s.lineTo(0, 0.04);
    const hole = new THREE.Path(); hole.moveTo(0.36, 0.42); hole.lineTo(3.3, 0.42); hole.lineTo(3.3, 2.72); hole.lineTo(0.36, 2.72); hole.lineTo(0.36, 0.42);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3 });
    door.add(new THREE.Mesh(g, blackGlass));
    const meshMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.7, roughness: 0.4, alphaMap: A.doorMesh, transparent: true, depthWrite: false, opacity: 0.8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.94, 2.3), meshMat); screen.position.set(1.83, 1.57, 0.02); door.add(screen);
    // glass reflection layer (additive) with a travelling light sweep
    const glassU = { uSweep: { value: -2 } };
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, clearcoat: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 2.2 });
    glass.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, glassU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vG;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvG = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSweep; varying vec2 vG;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float band = vG.x * 0.8 + vG.y * 0.6 - uSweep;
          totalEmissiveRadiance += vec3(0.75,0.92,1.0) * (exp(-band*band*90.0) * 0.55 + exp(-band*band*6.0) * 0.06);`);
    };
    glass.customProgramCacheKey = () => 'glass';
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.0), glass); pane.position.set(1.88, 1.55, 0.13); door.add(pane);
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.1, 2.3, 0.14, 3, 0.04), trim); handle.position.set(3.58, 1.55, 0.22); door.add(handle);
    door.userData.glassU = glassU;
  }

  // ---------- turntable + dish
  const tt = new THREE.Group(); tt.position.copy(TT_CENTER); mw.add(tt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.035, 12, 64), new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.5 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.42; tt.add(ring);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.38, 0.05, 96), new THREE.MeshStandardMaterial({ color: 0xa9c4bc, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1.5 }));
  plate.position.y = 0.48; tt.add(plate);
  const plateMark = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.3, 96), new THREE.MeshBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.0, depthWrite: false }));
  plateMark.rotation.x = -Math.PI / 2; plateMark.position.y = 0.51; tt.add(plateMark);

  const dish = new THREE.Group(); dish.position.y = 0.51; tt.add(dish);
  const prof = [[0, 0], [0.5, 0], [0.56, 0.03], [0.82, 0.18], [0.98, 0.42], [1.04, 0.56], [1.02, 0.585], [0.97, 0.56], [0.92, 0.44], [0.76, 0.2], [0.45, 0.08], [0, 0.07]].map(p => new THREE.Vector2(p[0], p[1]));
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.2, metalness: 0.0, envMapIntensity: 1.1 });
  dish.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 96), bowlMat));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.012, 8, 96), new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.578; dish.add(rim);

  // food: stew surface + chunks
  const R = rng(5);
  const surf = new THREE.CircleGeometry(0.93, 96, 0, Math.PI * 2);
  surf.rotateX(-Math.PI / 2);
  { const p = surf.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) / 0.93; p.setY(i, 0.47 + 0.05 * (1 - r * r) + 0.012 * Math.sin(x * 9 + z * 4) * Math.cos(z * 7)); } surf.computeVertexNormals(); }
  const sauce = new THREE.MeshStandardMaterial({ map: A.stew, roughness: 0.22, envMapIntensity: 0.9 });
  addHeat(sauce, U);
  const food = new THREE.Group(); dish.add(food);
  food.add(new THREE.Mesh(surf, sauce));
  const chunk = (geo, color, n, ysink, rough = 0.45, scaleVar = 0.3) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough * 0.8, envMapIntensity: 0.9 });
    addHeat(m, U);
    const im = new THREE.InstancedMesh(geo, m, n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.78;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      d.position.set(x, 0.47 + 0.05 * (1 - (r / .93) ** 2) - ysink, z);
      d.rotation.set(R() * 6, R() * 6, R() * 6);
      d.scale.setScalar(1 - scaleVar / 2 + R() * scaleVar);
      d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    food.add(im); return im;
  };
  chunk(new RoundedBoxGeometry(0.15, 0.13, 0.13, 2, 0.03), 0xf07a22, 16, 0.02, 0.35);   // carrot
  chunk(new RoundedBoxGeometry(0.17, 0.15, 0.16, 2, 0.04), 0xe8d29a, 12, 0.03, 0.5);    // potato
  chunk(new THREE.SphereGeometry(0.045, 16, 12), 0x5aa832, 26, -0.01, 0.3);              // peas
  chunk(new THREE.SphereGeometry(0.06, 16, 12), 0xd9b57a, 12, 0.0, 0.5);                 // chickpeas
  chunk(new THREE.BoxGeometry(0.09, 0.008, 0.05), 0x3f8a2a, 40, -0.035, 0.5, 0.6);       // herbs

  // ---------- lights
    const key = new THREE.DirectionalLight(0xfff0e0, 2.2); key.position.set(-6, 9, 8); scene.add(key);
  const rimL = new THREE.DirectionalLight(0x6fe4ff, 3.2); rimL.position.set(7, 4, -6); scene.add(rimL);
  const lamp = new THREE.PointLight(0xffc27a, 5, 0, 1.6); lamp.position.set(0.3, 2.55, -0.6); scene.add(lamp);
  const fill = { intensity: 0 };

  // ---------- wave field volume in the cavity
  const FU = fieldUniforms(PORT, CAV_MIN, CAV_MAX);
  const field = makeFieldVolume(FU, CAV_MIN, CAV_MAX, { ys: [1.35, 2.25], vertical: [-1.0] });
  mw.add(field); field.userData.setOpacity(0);
  // port glow
  const portGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: 0x5fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  portGlow.position.set(PORT.x - 0.1, PORT.y, PORT.z); portGlow.scale.set(1.4, 1.4, 1); mw.add(portGlow);

  // ---------- steam
  const steam = [];
  const SR = rng(11);
  for (let i = 0; i < 34; i++) {
    const m = new THREE.SpriteMaterial({ map: A.smoke, color: 0xfff4ea, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m); s.renderOrder = 20;
    s.userData = { off: SR(), per: 2.4 + SR() * 1.6, a: SR() * Math.PI * 2, r: SR() * 0.5, rot: SR() * 6, sw: 0.5 + SR() * 0.8, sz: 0.22 + SR() * 0.3 };
    dish.add(s); steam.push(s);
  }

  // ---------- flame (hook contrast) + scanner sheet
  const flameU = { uT: { value: 0 }, uDis: { value: 1 }, uOp: { value: 0 } };
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.25), new THREE.ShaderMaterial({
    uniforms: flameU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: /* glsl */`
      uniform float uT, uDis, uOp; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fb(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec2 p = vUv; p.x = (p.x - .5) * 2.;
        float t = uT, y = p.y;
        float n1 = fb(vec2(p.x * 2.6, y * 3.2 - t * 3.2));
        float n2 = fb(vec2(p.x * 6.0 + 4.0, y * 6.0 - t * 5.0));
        float w = 0.46 * pow(clamp(1.0 - y, 0., 1.), 0.85) * smoothstep(0.0, 0.2, y);
        float xo = p.x + (n1 - 0.5) * 0.45 * y;
        float d = abs(xo) - w * (0.75 + 0.5 * n2);
        float shape = smoothstep(0.07, -0.05, d) * smoothstep(1.0, 0.55, y + (n1 - 0.5) * 0.35);
        float core = smoothstep(-0.02, -0.22, d) * smoothstep(0.75, 0.15, y);
        vec3 col = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.78, 0.38), core);
        col = mix(col, vec3(0.25, 0.45, 1.0), smoothstep(0.22, 0.02, y) * 0.75);
        float dn = fb(vUv * 6. + 3.);
        float keep = smoothstep(uDis - 0.05, uDis + 0.05, dn);
        float rimC = smoothstep(0.1, 0.0, abs(dn - uDis)) * shape * step(0.001, uDis);
        gl_FragColor = vec4((col * shape * 1.25 * keep + vec3(0.3,0.9,1.0) * rimC * 1.6) * uOp, 1.);
      }`,
  }));
  flame.position.set(TT_CENTER.x, 1.38, 1.5); flame.renderOrder = 30; mw.add(flame);

  const scanSheet = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1.3), new THREE.MeshBasicMaterial({ color: 0x6fe9ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  scanSheet.rotation.y = Math.PI / 2; mw.add(scanSheet);
  const scanGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glow, color: 0x48dfff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  scanGlow.scale.set(0.6, 2.0, 1); mw.add(scanGlow);

  // ---------- hot-spot map (CPU), in turntable-local coordinates
  const HN = 72;
  const heatData = new Uint8Array(HN * HN * 4);
  const heatTex = new THREE.DataTexture(heatData, HN, HN, THREE.RGBAFormat);
  heatTex.magFilter = heatTex.minFilter = THREE.LinearFilter; heatTex.needsUpdate = true;
  U.uHeatTex.value = heatTex;
  const I = makeIntensityFn(PORT, CAV_MIN, CAV_MAX);
  // precompute field intensity on a fine polar grid around the axis for speed
  const NR = 48, NA = 180, RMAX = 1.42;
  const polar = new Float32Array(NR * NA);
  let imax = 0;
  for (let ir = 0; ir < NR; ir++) for (let ia = 0; ia < NA; ia++) {
    const r = ir / (NR - 1) * RMAX, a = ia / NA * Math.PI * 2;
    const v = I(TT_CENTER.x + Math.cos(a) * r, FOOD_Y, TT_CENTER.z + Math.sin(a) * r);
    polar[ir * NA + ia] = v; imax = Math.max(imax, v);
  }
  const sorted = Array.from(polar).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)], hi = sorted[Math.floor(sorted.length * 0.97)];
  const samplePolar = (x, z) => {
    const r = Math.hypot(x, z), a = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    const fr = clamp(r / RMAX) * (NR - 1), fa = a / (Math.PI * 2) * NA;
    const ir = Math.min(NR - 2, Math.floor(fr)), ia = Math.floor(fa) % NA, ia2 = (ia + 1) % NA;
    const u = fr - ir, v = fa - Math.floor(fa);
    const g = (i, j) => polar[i * NA + j];
    return (g(ir, ia) * (1 - u) + g(ir + 1, ia) * u) * (1 - v) + (g(ir, ia2) * (1 - u) + g(ir + 1, ia2) * u) * v;
  };
  let lastHeatKey = '';
  function updateHeat(rot, amount) {
    const key = rot.toFixed(4) + amount.toFixed(3);
    if (key === lastHeatKey) return; lastHeatKey = key;
    const NS = 1 + Math.ceil(rot / 0.12);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const lx = (i + .5) / HN * 2 - 1, lz = (j + .5) / HN * 2 - 1;
      let acc = 0;
      for (let s = 0; s < NS; s++) {
        const th = NS === 1 ? 0 : rot * s / (NS - 1);
        // food point that is now at local (lx,lz) was at angle th in cavity frame
        const c = Math.cos(th), sn = Math.sin(th);
        acc += samplePolar(c * lx + sn * lz, -sn * lx + c * lz);
      }
      const v = Math.pow(clamp((acc / NS - lo) / (hi - lo)), 0.7);
      const h = clamp(0.06 + amount * (0.15 + v * 0.85));
      const k = (j * HN + i) * 4; heatData[k] = heatData[k + 1] = heatData[k + 2] = h * 255; heatData[k + 3] = 255;
    }
    heatTex.needsUpdate = true;
  }
  updateHeat(0, 0);

  function update(t, st) {
    U.uTime.value = t;
    door.rotation.y = -(st.doorOpen ?? 0) * 1.75;
    door.visible = !st.doorHidden;
    topBox.visible = topLiner.visible = lens.visible = !st.topHidden;
    dish.position.set(0, st.dishY ?? 0.51, st.dishZ ?? 0);
    door.userData.glassU.uSweep.value = st.sweep ?? -2;
    lamp.intensity = (st.lamp ?? 12) * 0.42;
    tt.rotation.y = -(st.rot ?? 0);
    U.uRot.value = st.rot ?? 0;
    U.uHeatMix.value = st.heatMix ?? 0; U.uSpread.value = st.spread ?? 0;
    U.uMapMix.value = st.mapMix ?? 0;
    if ((st.mapMix ?? 0) > 0) updateHeat(st.rot ?? 0, st.mapAmount ?? 1);
    U.uScanMix.value = st.scanMix ?? 0; U.uScanX.value = st.scanX ?? 10;
    scanSheet.material.opacity = (st.scanMix ?? 0) * 0.9; scanSheet.position.set(st.scanX ?? 10, FOOD_Y + 0.1, TT_CENTER.z + 0.1);
    scanGlow.material.opacity = (st.scanMix ?? 0) * 0.5; scanGlow.position.copy(scanSheet.position);
    flameU.uT.value = t; flameU.uOp.value = st.flame ?? 0; flameU.uDis.value = st.flameDis ?? 0;
    flame.visible = (st.flame ?? 0) > 0.001;
    FU.uPhase.value = (st.wavePhase ?? t * 5.0);
    FU.uFront.value = st.front ?? 100;
    field.userData.setOpacity(st.field ?? 0);
    portGlow.material.opacity = st.portGlow ?? 0;
    plateMark.material.opacity = st.plateMark ?? 0;
    disp.visible = true;
    // steam
    const amt = st.steam ?? 0.6;
    for (const s of steam) {
      const d = s.userData;
      const p = ((t / d.per + d.off) % 1 + 1) % 1;
      const r = d.r * (0.6 + p * 0.7);
      s.position.set(Math.cos(d.a) * r + Math.sin(t * 0.9 * d.sw + d.a) * 0.22 * p, 0.62 + p * 1.5, Math.sin(d.a) * r * 0.7);
      const sc = d.sz * (0.6 + p * 2.2); s.scale.set(sc, sc * 1.3, 1);
      s.material.rotation = d.rot + p * 1.2 * (d.sw - 0.9);
      s.material.opacity = Math.sin(Math.PI * p) ** 1.5 * 0.13 * amt;
      s.visible = amt > 0.01;
    }
  }

  return { scene, update, mw, door, dish, food, tt, field, FU, U, lamp, bg };
}
