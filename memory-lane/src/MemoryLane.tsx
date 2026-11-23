import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {Cursor, TapRing} from './components/Cursor';
import {Header} from './components/Header';
import {SelectionBand} from './components/SelectionBand';
import {ListFooter, YearRow} from './components/YearRow';
import {ensureFonts} from './fonts';
import {colors, layout, rgba, WIDTH} from './theme';
import {ramp, scrollPos, scrollVelocity, T} from './timeline';

ensureFonts();

const MASK =
  'linear-gradient(to bottom, transparent 0px, transparent 420px, black 620px, black 1420px, transparent 1690px)';

export type MemoryLaneProps = {
  title: string;
  fromYear: number;
  toYear: number;
  pointer: 'cursor' | 'touch';
};

export const MemoryLane: React.FC<MemoryLaneProps> = ({
  title,
  fromYear,
  toYear,
  pointer,
}) => {
  const frame = useCurrentFrame();

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = fromYear; y <= toYear; y++) list.push(y);
    return list;
  }, [fromYear, toYear]);
  const n = years.length;
  const last = n - 1;

  // ---- Core motion ---------------------------------------------------------
  const intro = ramp(frame, 0, T.introEnd);
  const pos = scrollPos(frame, n);
  const vel = scrollVelocity(frame, n);

  const selected = ramp(frame, T.selectIn, T.selectInEnd, Easing.bezier(0.4, 0, 0.2, 1));

  // Press: quick in, slightly softer out.
  const press =
    frame < T.pressDown
      ? 0
      : frame < T.pressDown + 3
        ? ramp(frame, T.pressDown, T.pressDown + 3)
        : 1 - ramp(frame, T.pressUp - 1, T.pressUp + 6, Easing.bezier(0.3, 0, 0.2, 1.4));
  const flash =
    ramp(frame, T.rippleStart, T.rippleStart + 4) *
    (1 - ramp(frame, T.rippleStart + 4, T.rippleStart + 34));
  const playing = ramp(frame, T.pressUp, T.pressUp + 12);

  // ---- Cursor path ---------------------------------------------------------
  const target = {x: layout.yearX + 236, y: layout.centerY + 14};
  const start = {x: WIDTH + 90, y: 1640};
  const ctrl = {x: 900, y: 1120}; // curved, hand-like approach
  const cursorAt = (f: number) => {
    const t = interpolate(f, [T.cursorIn, T.cursorArrive], [0, 1], {
      easing: Easing.bezier(0.32, 0.02, 0.12, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const u = 1 - t;
    // A tiny post-click drift keeps the hold from feeling frozen.
    const drift = ramp(f, T.pressUp + 4, T.duration, Easing.bezier(0.3, 0, 0.3, 1));
    return {
      x: u * u * start.x + 2 * u * t * ctrl.x + t * t * target.x + drift * 10,
      y: u * u * start.y + 2 * u * t * ctrl.y + t * t * target.y + drift * 14,
    };
  };
  const c = cursorAt(frame);
  const cPrev = cursorAt(frame - 1);
  const cursorOpacity = ramp(frame, T.cursorIn, T.cursorIn + 6);

  const rippleProgress = interpolate(frame, [T.rippleStart, T.rippleEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tapPoint = cursorAt(T.pressDown);
  const bandLeft = layout.pillX;
  const bandTop = layout.centerY - layout.pillHeight / 2;

  // ---- Scrollbar (appears only while the list is in motion) ----------------
  const trackTop = 470;
  const trackH = 1080;
  const thumbH = 150;
  const scrollbarOpacity =
    ramp(frame, T.scrollStart, T.scrollStart + 8) * (1 - ramp(frame, T.scrollEnd + 4, T.scrollEnd + 22));

  return (
    <AbsoluteFill style={{backgroundColor: colors.background}}>
      <AbsoluteFill style={{opacity: 0.7 + 0.3 * intro}}>
        <SelectionBand
          selected={selected}
          press={press}
          flash={flash}
          ripple={
            frame >= T.rippleStart
              ? {x: tapPoint.x - bandLeft, y: tapPoint.y - bandTop, progress: rippleProgress}
              : null
          }
        />

        {/* Scrolling list, softly masked toward the top and bottom */}
        <AbsoluteFill
          style={{
            transform: `translateY(${(1 - intro) * 12}px)`,
            WebkitMaskImage:
              MASK,
            maskImage:
              MASK,
          }}
        >
          {years.map((year, i) => (
            <YearRow
              key={year}
              index={i}
              label={String(year)}
              distance={i - pos}
              velocity={vel}
              selected={i === last ? selected : 0}
              press={i === last ? press : 0}
              playing={i === last ? playing : 0}
              frame={frame}
            />
          ))}
          <ListFooter
            distance={n - pos}
            text={`${n} years`}
            opacity={1 - ramp(frame, T.selectIn, T.selectInEnd) * 0.25}
          />
        </AbsoluteFill>

        <div
          style={{
            position: 'absolute',
            right: 30,
            top: trackTop + (pos / Math.max(1, last)) * (trackH - thumbH),
            width: 5,
            height: thumbH,
            borderRadius: 3,
            background: rgba([255, 255, 255], 0.22),
            opacity: scrollbarOpacity,
          }}
        />
      </AbsoluteFill>

      <Header title={title} intro={intro} />

      <TapRing x={tapPoint.x} y={tapPoint.y} progress={rippleProgress} />

      <Cursor
        x={c.x}
        y={c.y}
        vx={c.x - cPrev.x}
        vy={c.y - cPrev.y}
        press={press}
        opacity={cursorOpacity}
        variant={pointer}
      />
    </AbsoluteFill>
  );
};
