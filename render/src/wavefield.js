import * as THREE from 'three';

// Scene units are decimetres. 2.45 GHz microwaves: wavelength ~12.2 cm = 1.22 units.
export const WAVELENGTH = 1.22;
export const K = 2 * Math.PI / WAVELENGTH;

// Field inside a rectangular metal cavity, modelled with the source plus its
// mirror images in the walls (sign flips on each reflection, as for the
// tangential E-field at a conductor). Time-domain value, gated by a growing
// wavefront radius so that reflections visibly arrive after the direct wave.
export const FIELD_GLSL = /* glsl */`
uniform vec3 uSrc; uniform vec3 uBMin; uniform vec3 uBMax;
uniform float uK; uniform float uPhase; uniform float uFront;
// one wave term rendered as thin glowing crest lines (ripple-tank style)
float wTerm(vec3 p, vec3 s, float amp, inout float edge){
  float r = length(p - s);
  float gate = smoothstep(uFront, uFront - 0.5, r);
  edge += amp * exp(-pow((r - uFront + 0.2) * 3.5, 2.0));
  float c = 0.5 + 0.5 * cos(uK * r - uPhase);
  return gate * amp * pow(c, 14.0) / (1.0 + 0.3 * r);
}
float fieldT(vec3 p, out float edge){
  edge = 0.0;
  vec3 s = uSrc; float f = 0.0;
  f += wTerm(p, s, 1.0, edge);
  f += wTerm(p, vec3(2.0*uBMin.x - s.x, s.y, s.z), 0.6, edge);
  f += wTerm(p, vec3(2.0*uBMax.x - s.x, s.y, s.z), 0.6, edge);
  f += wTerm(p, vec3(s.x, 2.0*uBMin.y - s.y, s.z), 0.6, edge);
  f += wTerm(p, vec3(s.x, 2.0*uBMax.y - s.y, s.z), 0.6, edge);
  f += wTerm(p, vec3(s.x, s.y, 2.0*uBMin.z - s.z), 0.6, edge);
  f += wTerm(p, vec3(s.x, s.y, 2.0*uBMax.z - s.z), 0.6, edge);
  return f;
}
`;

// Time-averaged intensity (CPU) with images up to first order on each axis
// combined (27 sources). Used to build hot-spot maps.
export function makeIntensityFn(src, bmin, bmax) {
  const imgs = [];
  for (const nx of [-1, 0, 1]) for (const ny of [-1, 0, 1]) for (const nz of [-1, 0, 1]) {
    const m = (n, s, a, b) => n === 0 ? s : (n < 0 ? 2 * a - s : 2 * b - s);
    imgs.push([m(nx, src.x, bmin.x, bmax.x), m(ny, src.y, bmin.y, bmax.y), m(nz, src.z, bmin.z, bmax.z),
      ((Math.abs(nx) + Math.abs(ny) + Math.abs(nz)) % 2) ? -1 : 1]);
  }
  return (x, y, z) => {
    let re = 0, im = 0;
    for (const s of imgs) {
      const dx = x - s[0], dy = y - s[1], dz = z - s[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const a = s[3] / (1 + 0.22 * r);
      re += a * Math.cos(K * r); im += a * Math.sin(K * r);
    }
    return re * re + im * im;
  };
}

export function fieldUniforms(src, bmin, bmax) {
  return {
    uSrc: { value: src.clone() }, uBMin: { value: bmin.clone() }, uBMax: { value: bmax.clone() },
    uK: { value: K }, uPhase: { value: 0 }, uFront: { value: 100 },
  };
}

// Stack of additive slice planes that render the field as a glowing volume.
export function makeFieldVolume(uniforms, bmin, bmax, opts = {}) {
  const group = new THREE.Group();
  const extra = { uOpacity: { value: 0 }, uTint: { value: new THREE.Color(opts.tint ?? 0x46e6ff) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...extra },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${FIELD_GLSL}
      uniform float uOpacity; uniform vec3 uTint;
      varying vec3 vW;
      void main(){
        float edge; float f = fieldT(vW, edge);
        vec3 inside = clamp((vW - uBMin) / (uBMax - uBMin), 0.0, 1.0);
        float wallFade = smoothstep(0.0, 0.04, min(min(inside.x, 1.0-inside.x), min(min(inside.z, 1.0-inside.z), min(inside.y, 1.0-inside.y))));
        vec3 col = uTint * (f * 0.8 + edge * 0.3) + vec3(0.45, 0.4, 1.0) * f * f * 0.15;
        gl_FragColor = vec4(col * uOpacity * (0.25 + 0.75 * wallFade), 1.0);
      }`,
  });
  const n = opts.ys ? opts.ys.length : (opts.layers ?? 4);
  const sx = bmax.x - bmin.x, sz = bmax.z - bmin.z;
  for (let i = 0; i < n; i++) {
    const y = opts.ys ? opts.ys[i] : THREE.MathUtils.lerp(bmin.y + 0.35, bmax.y - 0.3, n === 1 ? .5 : i / (n - 1));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((bmin.x + bmax.x) / 2, y, (bmin.z + bmax.z) / 2);
    m.renderOrder = 10;
    group.add(m);
  }
  if (opts.vertical) {
    const sy = bmax.y - bmin.y;
    for (const z of opts.vertical) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), mat);
      m.position.set((bmin.x + bmax.x) / 2, (bmin.y + bmax.y) / 2, z); m.renderOrder = 10; group.add(m);
    }
  }
  group.userData.mat = mat;
  group.userData.setOpacity = v => { extra.uOpacity.value = v; group.visible = v > 0.001; };
  return group;
}
