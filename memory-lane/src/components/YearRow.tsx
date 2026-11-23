import React from 'react';
import {colors, fonts, layout, mix, rgba} from '../theme';
import {Equalizer} from './Equalizer';

type Props = {
  index: number;
  label: string;
  /** Signed distance from the selection centre, in rows. */
  distance: number;
  /** Vertical scroll speed in px/frame (for motion blur). */
  velocity: number;
  /** 0..1 — how far this row has turned into the "selected" lavender state. */
  selected: number;
  /** 0..1 — press-in amount during the tap. */
  press: number;
  /** 0..1 — "now playing" equalizer replaces the track number. */
  playing: number;
  frame: number;
};

export const YearRow: React.FC<Props> = ({
  index,
  label,
  distance,
  velocity,
  selected,
  press,
  playing,
  frame,
}) => {
  const d = distance;
  const ad = Math.abs(d);

  // Focus: 1 at the centre, falling off smoothly with distance.
  const focus = Math.exp(-(d * d) / 0.6);
  // Scale: centred row is full size; neighbours settle at ~68 %.
  const scale = (0.64 + 0.36 * focus) * (1 - 0.03 * press);
  // Brightness: muted grey far away -> bright white near the centre.
  const tone = mix(colors.textMuted, colors.textBright, Math.pow(focus, 0.8));
  const yearColor = mix(tone, colors.lavender, selected * focus);

  // Rows dissolve toward the top/bottom of the list area.
  const opacity = Math.min(1, Math.max(0, 1 - (ad - 2.4) / 1.6));
  if (opacity <= 0) return null;

  const y = layout.centerY + d * layout.rowHeight;

  // Directional motion blur: stacked, softened ghosts along the scroll axis
  // (180° shutter). Fades to nothing as the list comes to rest.
  const smear = Math.abs(velocity) * 0.5;
  const ghost = (k: number, a: number) =>
    `0 ${(smear * k).toFixed(2)}px ${(smear * 0.18).toFixed(2)}px ${rgba(yearColor, a)}`;
  const shadows: string[] =
    smear > 0.6
      ? [
          ghost(0.17, 0.32),
          ghost(-0.17, 0.32),
          ghost(0.34, 0.16),
          ghost(-0.34, 0.16),
          ghost(0.5, 0.07),
          ghost(-0.5, 0.07),
        ]
      : [];
  // While moving fast the core text gets a touch lighter so total energy
  // stays roughly constant once the ghosts are added.
  const coreAlpha = 1 - Math.min(0.35, smear / 90);

  if (selected > 0) {
    shadows.push(
      `0 0 ${56 * selected}px ${rgba(colors.lavenderDeep, 0.5 * selected * focus)}`,
    );
  }

  const numberColor = mix(colors.number, [170, 168, 180], focus);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: y,
        width: '100%',
        height: 0,
        opacity,
      }}
    >
      {/* Track number / now-playing column */}
      <div
        style={{
          position: 'absolute',
          left: layout.numberX,
          top: 0,
          width: 72,
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 60,
        }}
      >
        <div
          style={{
            position: 'absolute',
            fontFamily: fonts.text,
            fontWeight: 500,
            fontSize: 34,
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
            color: rgba(numberColor, 1 - playing),
            transform: `scale(${1 - 0.25 * playing})`,
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
        {playing > 0 ? <Equalizer frame={frame} amount={playing} /> : null}
      </div>

      {/* Year */}
      <div
        style={{
          position: 'absolute',
          left: layout.yearX,
          top: 0,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: layout.yearSize,
          lineHeight: 1,
          letterSpacing: '-0.025em',
          fontVariantNumeric: 'tabular-nums',
          color: rgba(yearColor, coreAlpha),
          textShadow: shadows.length ? shadows.join(', ') : 'none',
          transform: `translateY(-52%) scale(${scale})`,
          transformOrigin: '0% 50%',
          whiteSpace: 'nowrap',
          willChange: 'transform',
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** Quiet playlist-style summary that trails the final row ("11 years"). */
export const ListFooter: React.FC<{distance: number; text: string; opacity: number}> = ({
  distance,
  text,
  opacity,
}) => {
  const y = layout.centerY + (distance - 0.08) * layout.rowHeight;
  const fade = Math.min(1, Math.max(0, 1 - (Math.abs(distance) - 2.4) / 1.6));
  if (fade <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: layout.yearX + 4,
        top: y,
        transform: 'translateY(-50%)',
        fontFamily: fonts.text,
        fontWeight: 500,
        fontSize: 28,
        letterSpacing: '0.24em',
        textTransform: 'uppercase',
        color: rgba(colors.textMuted, 0.85 * fade * opacity),
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};
