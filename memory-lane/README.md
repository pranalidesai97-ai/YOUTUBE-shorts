# MEMORY LANE — animated year selector (Instagram Reel)

A minimal black-and-lavender year selector styled like a music-streaming playlist. It is built with [Remotion](https://www.remotion.dev) and rendered to MP4.

| Output | Description |
|---|---|
| `out/memory-lane.mp4` | Main version, with a mouse cursor clicking 2026 |
| `out/memory-lane-touch.mp4` | Alternate version, with a screen-recording-style tap indicator |

Both files are 1080 × 1920 (9:16), H.264 High, yuv420p, 30 fps constant, 204 frames (6.8 s). They have no audio track and a solid `#0A0A0C` background that can be keyed out.

## Timeline (frames @ 30 fps)

| Frames | Time | What happens |
|---|---|---|
| 0–9 | 0.0–0.3 s | 2016 is centred and the heading settles in. Frame 0 is already legible for the thumbnail. |
| 12–114 | 0.4–3.8 s | The list scrolls through 2016 → 2026, reaching a peak of about 48 px/frame with a long deceleration. Rows grow and brighten as they pass the centre, and directional motion blur is applied while moving. |
| 112–130 | 3.7–4.3 s | The list stops exactly on 2026, and the selection band blooms into a lavender pill with a soft glow. |
| 114–146 | 3.8–4.9 s | The cursor glides in along a curved, hand-like path. |
| 148–182 | 4.9–6.1 s | Click: a press-in, then a clipped lavender ripple, an expanding ring, and a "now playing" equalizer that replaces the track number. |
| 153–204 | 5.1–6.8 s | Hold on the selected 2026 screen for about 1.7 s. |

## Project layout

```
src/
  Root.tsx              compositions: MemoryLane (cursor), MemoryLaneTouch (tap)
  MemoryLane.tsx        scene assembly, cursor path, scrollbar
  timeline.ts           every timing + the scroll easing curve
  theme.ts              colours, fonts, layout tokens (re-skin here)
  fonts.ts              loads bundled Inter / Inter Display
  components/
    YearRow.tsx         row scale/brightness/motion blur + list footer
    SelectionBand.tsx   centre band -> lavender pill, glow, clipped ripple
    Cursor.tsx          arrow cursor / touch indicator + tap ring
    Equalizer.tsx       "now playing" bars
    Header.tsx          MEMORY LANE heading
public/fonts/           Inter + Inter Display (SIL OFL 1.1, licence included)
```

## Reuse

Change the props in `src/Root.tsx`, or pass them with `--props`:

```bash
npx remotion render MemoryLane out/custom.mp4 --props='{"title":"MEMORY LANE","fromYear":2012,"toYear":2026,"pointer":"cursor"}'
```

- `fromYear` / `toYear` can be any range. The scroll always lands precisely on `toYear`.
- `pointer` takes `"cursor"` or `"touch"`.
- Colours and sizes live in `src/theme.ts`, and timings and easing live in `src/timeline.ts`.

## Build

```bash
npm install
npm run studio        # live preview
npm run render        # -> out/memory-lane.mp4
npm run render:touch  # -> out/memory-lane-touch.mp4
```

Remotion downloads its own Chrome Headless Shell on first render. If that is blocked, point it at a local copy with `REMOTION_BROWSER=/path/to/chrome-headless-shell npm run render`. Encoding settings (H.264, CRF 14, yuv420p, bt709) are in `remotion.config.ts`.
