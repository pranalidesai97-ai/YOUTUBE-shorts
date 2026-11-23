import {Easing, interpolate} from 'remotion';
import {layout} from './theme';

// All timings are in frames at 30 fps.
export const T = {
  introEnd: 9, // heading + list settle in (frame 0 is already legible)
  scrollStart: 12, // finger starts the flick on 2016
  scrollEnd: 114, // list comes to rest exactly on the last year (3.4 s of travel)
  selectIn: 112, // lavender selection state begins blooming
  selectInEnd: 130,
  cursorIn: 114, // cursor glides in from the lower right
  cursorArrive: 146,
  pressDown: 148, // click / tap
  pressUp: 153,
  rippleStart: 149,
  rippleEnd: 182,
  duration: 204, // 6.8 s total; ~1.7 s hold after the tap
};

// Scroll curve: gentle acceleration, a quick peak, then a long, gradual
// deceleration that lands precisely on the target row — like a flick on a
// premium mobile list with momentum.
const scrollEasing = Easing.bezier(0.42, 0, 0.32, 1);

/** Scroll position in rows (0 = first year centred). */
export const scrollPos = (frame: number, rowCount: number) =>
  interpolate(frame, [T.scrollStart, T.scrollEnd], [0, rowCount - 1], {
    easing: scrollEasing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Scroll velocity in px/frame (central difference), used for motion blur. */
export const scrollVelocity = (frame: number, rowCount: number) =>
  (scrollPos(frame + 0.5, rowCount) - scrollPos(frame - 0.5, rowCount)) *
  layout.rowHeight;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const ramp = (
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.bezier(0.33, 0, 0.2, 1),
) =>
  interpolate(frame, [from, to], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
