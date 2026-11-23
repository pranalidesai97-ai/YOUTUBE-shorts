import React from 'react';
import {colors, rgba} from '../theme';

// Minimal "now playing" bars — the streaming-app cue that a row is active.
export const Equalizer: React.FC<{frame: number; amount: number}> = ({
  frame,
  amount,
}) => {
  const t = frame / 30;
  const bars = [
    0.55 + 0.45 * Math.abs(Math.sin(t * 5.1 + 0.3)),
    0.45 + 0.55 * Math.abs(Math.sin(t * 6.7 + 1.9)),
    0.5 + 0.5 * Math.abs(Math.sin(t * 4.3 + 4.1)),
  ];
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        height: 38,
        opacity: amount,
        transform: `scale(${0.7 + 0.3 * amount})`,
        filter: `drop-shadow(0 0 10px ${rgba(colors.lavenderDeep, 0.6)})`,
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 38 * h * (0.35 + 0.65 * amount),
            borderRadius: 3.5,
            background: rgba(colors.lavender, 1),
          }}
        />
      ))}
    </div>
  );
};
