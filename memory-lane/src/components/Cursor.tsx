import React from 'react';
import {colors, rgba} from '../theme';

type Props = {
  x: number; // hotspot (arrow tip) position
  y: number;
  press: number; // 0..1
  opacity: number;
  /** px/frame velocity, used for a faint trailing blur. */
  vx: number;
  vy: number;
  variant: 'cursor' | 'touch';
};

const ARROW =
  'M1.5 1.5 L1.5 33.5 L9.4 26.2 L14.6 38.6 L20.4 36.1 L15.3 24.0 L26.0 24.0 Z';

const Arrow: React.FC<{alpha: number}> = ({alpha}) => (
  <svg
    width={60}
    height={88}
    viewBox="0 0 28 41"
    style={{position: 'absolute', left: -3.2, top: -3.2, opacity: alpha, overflow: 'visible'}}
  >
    <path
      d={ARROW}
      fill="#FFFFFF"
      stroke="#141317"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);

export const Cursor: React.FC<Props> = ({x, y, press, opacity, vx, vy, variant}) => {
  if (opacity <= 0) return null;

  if (variant === 'touch') {
    // Screen-recording style touch indicator.
    const size = 96 * (1 - 0.18 * press);
    return (
      <div
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: '50%',
          opacity,
          background: `radial-gradient(circle, rgba(255,255,255,${0.5 + 0.25 * press}) 0%, rgba(255,255,255,0.22) 62%, rgba(255,255,255,0) 72%)`,
          border: '2px solid rgba(255,255,255,0.55)',
          boxShadow: `0 8px 30px rgba(0,0,0,0.45), 0 0 ${24 * press}px ${rgba(colors.lavender, 0.6)}`,
        }}
      />
    );
  }

  const speed = Math.hypot(vx, vy);
  const trail = Math.min(1, speed / 40);
  const scale = 1 - 0.12 * press;

  return (
    <div style={{position: 'absolute', left: 0, top: 0, opacity}}>
      {/* Faint trailing copies read as motion blur at speed */}
      {trail > 0.05
        ? [0.5, 0.33, 0.17].map((k, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x - vx * k,
                top: y - vy * k,
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
              }}
            >
              <Arrow alpha={0.18 * trail * (i + 1) * 0.6} />
            </div>
          ))
        : null}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          filter: `drop-shadow(0 6px 10px rgba(0,0,0,0.55)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))`,
        }}
      >
        <Arrow alpha={1} />
      </div>
    </div>
  );
};

/** Expanding lavender ring at the tap point (drawn above the band, unclipped). */
export const TapRing: React.FC<{x: number; y: number; progress: number}> = ({
  x,
  y,
  progress,
}) => {
  if (progress <= 0 || progress >= 1) return null;
  const eased = 1 - Math.pow(1 - progress, 3);
  const r = 18 + eased * 120;
  const alpha = 0.75 * Math.pow(1 - progress, 1.4);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        border: `${2 + 3 * (1 - eased)}px solid ${rgba(colors.lavender, alpha)}`,
        boxShadow: `0 0 24px ${rgba(colors.lavenderDeep, alpha * 0.6)}, inset 0 0 24px ${rgba(colors.lavenderDeep, alpha * 0.4)}`,
      }}
    />
  );
};
