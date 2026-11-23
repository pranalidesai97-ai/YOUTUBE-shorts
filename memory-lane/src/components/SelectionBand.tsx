import React from 'react';
import {colors, layout, rgba} from '../theme';

type Props = {
  /** 0..1 lavender selected state. */
  selected: number;
  /** 0..1 press-in during the tap. */
  press: number;
  /** 0..1 brief brightness flash right after the tap. */
  flash: number;
  /** Tap point relative to the band's top-left, for the clipped ripple. */
  ripple: {x: number; y: number; progress: number} | null;
};

// The central selection area. Neutral and barely-there while scrolling,
// it blooms into a soft lavender pill once the list settles.
export const SelectionBand: React.FC<Props> = ({
  selected,
  press,
  flash,
  ripple,
}) => {
  const s = selected;
  const bgAlpha = 0.028 + s * 0.1 + flash * 0.06;
  const scale = 1 - 0.012 * press;
  const r = ripple
    ? Math.max(0, ripple.progress) * layout.pillWidth * 1.05
    : 0;
  const rippleAlpha = ripple ? 0.42 * Math.pow(1 - ripple.progress, 1.6) : 0;

  return (
    <>
      {/* Soft ambient glow behind the pill */}
      <div
        style={{
          position: 'absolute',
          left: layout.pillX + 60,
          top: layout.centerY - layout.pillHeight / 2 + 20,
          width: layout.pillWidth - 120,
          height: layout.pillHeight - 40,
          borderRadius: layout.pillRadius,
          background: rgba(colors.lavenderDeep, 0.5 * s + 0.15 * flash),
          filter: 'blur(70px)',
          opacity: s,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: layout.pillX,
          top: layout.centerY - layout.pillHeight / 2,
          width: layout.pillWidth,
          height: layout.pillHeight,
          borderRadius: layout.pillRadius,
          overflow: 'hidden',
          transform: `scale(${scale})`,
          background: `linear-gradient(100deg, ${rgba(
            [255, 255, 255],
            0.028 * (1 - s),
          )}, ${rgba([255, 255, 255], 0.028 * (1 - s))}), linear-gradient(100deg, ${rgba(
            colors.lavenderDeep,
            bgAlpha * 1.25 * s,
          )} 0%, ${rgba(colors.lavender, bgAlpha * 0.7 * s)} 100%)`,
          boxShadow: [
            `inset 0 1px 0 ${rgba([255, 255, 255], 0.05 + 0.05 * s)}`,
            `0 24px 60px ${rgba([0, 0, 0], 0.45 * s)}`,
            `0 0 ${70 * s}px ${rgba(colors.lavenderDeep, 0.22 * s + 0.12 * flash)}`,
          ].join(', '),
        }}
      >
        {ripple && ripple.progress > 0 && ripple.progress < 1 ? (
          <div
            style={{
              position: 'absolute',
              left: ripple.x - r,
              top: ripple.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${rgba(
                colors.lavender,
                rippleAlpha,
              )} 0%, ${rgba(colors.lavenderDeep, rippleAlpha * 0.55)} 55%, ${rgba(
                colors.lavenderDeep,
                0,
              )} 72%)`,
            }}
          />
        ) : null}
      </div>
    </>
  );
};
