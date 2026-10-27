import * as THREE from 'three';
import { clamp, ease } from './util.js';

// keys: [{t, p:[x,y,z], l:[x,y,z], fov}] -> camera state at time t.
// Catmull-Rom through key positions with an eased global time mapping, so
// moves start and end gently but pass through intermediate keys with velocity.
export function camPath(keys, easing = ease.inOutSine) {
  const T0 = keys[0].t, T1 = keys[keys.length - 1].t;
  const P = keys.map(k => new THREE.Vector3(...k.p));
  const L = keys.map(k => new THREE.Vector3(...k.l));
  const times = keys.map(k => k.t);
  const cr = (arr, i, u) => {
    const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[Math.min(arr.length - 1, i + 1)], p3 = arr[Math.min(arr.length - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u;
    return new THREE.Vector3().addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u)
      .addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1).addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u)
      .addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
  };
  return (t, cam) => {
    const g = T0 + easing(clamp((t - T0) / (T1 - T0))) * (T1 - T0);
    let i = 0; while (i < times.length - 2 && g > times[i + 1]) i++;
    const u = keys.length === 1 ? 0 : clamp((g - times[i]) / (times[i + 1] - times[i]));
    const p = cr(P, i, u), l = cr(L, i, u);
    const fa = keys[i].fov ?? 35, fb = keys[Math.min(keys.length - 1, i + 1)].fov ?? fa;
    cam.position.copy(p); cam.lookAt(l); cam.fov = fa + (fb - fa) * u;
    if (keys[i].roll !== undefined) cam.rotateZ((keys[i].roll + ((keys[Math.min(keys.length - 1, i + 1)].roll ?? keys[i].roll) - keys[i].roll) * u));
    cam.updateProjectionMatrix();
    return { p, l };
  };
}
