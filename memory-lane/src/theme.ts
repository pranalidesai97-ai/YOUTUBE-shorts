// Visual tokens for the MEMORY LANE year selector.
// Everything that defines the look lives here so the piece is easy to re-skin.

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;

export const colors = {
  background: '#0A0A0C', // solid deep charcoal-black (keyable)
  textBright: [246, 244, 251] as RGB, // near-white, faintly cool
  textMuted: [104, 103, 114] as RGB, // muted grey for far rows
  number: [92, 91, 101] as RGB, // track-number column
  lavender: [196, 176, 255] as RGB, // selected year
  lavenderDeep: [150, 118, 255] as RGB, // glow / ripple core
  header: 'rgba(238, 236, 246, 0.86)',
};

export type RGB = [number, number, number];

export const fonts = {
  display: '"Inter Display", "Inter", system-ui, sans-serif',
  text: '"Inter", system-ui, sans-serif',
};

export const layout = {
  headerY: 300, // baseline-ish centre of the "MEMORY LANE" heading
  centerY: 1000, // centre of the selection band
  rowHeight: 212, // vertical distance between rows
  numberX: 128, // left edge of the track-number column
  yearX: 236, // left edge of the year column
  yearSize: 158, // font-size of the year when centred (scale 1)
  pillX: 84,
  pillWidth: WIDTH - 84 * 2,
  pillHeight: 198,
  pillRadius: 46,
};

export const rgba = (c: RGB, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
