# How Does a Microwave Heat Food? — 40 s YouTube Short

Deliverable: `output/how-a-microwave-heats-food.mp4`. It is a 1080×1920 (9:16) H.264 file at a constant 30 fps, with exactly 1,200 frames and 40.000 s of AAC 48 kHz stereo audio.

Everything in the video was made procedurally for this project. That covers the 3D scenes, the shaders, the typography, the narration, the music and the sound effects. It contains no stock footage, stock music or third-party audio.

## Pipeline

| Stage | Tool | Files |
|---|---|---|
| Narration | [Kokoro-82M](https://github.com/thewh1teagle/kokoro-onnx) open-weight neural TTS (Apache-2.0), run locally on onnxruntime, with the `af_heart` voice | `pipeline/tts.py` |
| Word timings | The model's own phoneme-duration tensor (exposed as an extra ONNX output), so caption timing is exact rather than estimated | `pipeline/tts.py` → `build/words.json` |
| 3D animation | three.js r170 rendered frame by frame in headless Chromium (WebGL via SwiftShader). It uses PBR materials, custom GLSL (wave field, heat maps, flame, molecule rim light), DOF, bloom, an ACES grade, grain and transitions | `render/` |
| Typography and captions | A 2D canvas overlay composited inside the WebGL final pass, using Inter / Inter Display | `render/src/overlay.js` |
| Music, SFX and mix | numpy/scipy synthesis: additive pads, plucks, sub, reverb, ducking, compression, a limiter and loudness normalisation to −14 LUFS | `pipeline/audio.py` |
| Encode and QA | FFmpeg: x264 CRF 16 and AAC 256k, followed by blackdetect, freezedetect, ebur128 and astats checks | `pipeline/encode.sh` |

### Rebuild

```bash
pip install kokoro-onnx soundfile scipy onnx
# models/kokoro-v1.0.onnx + models/voices-v1.0.bin from the kokoro-onnx GitHub release "model-files-v1.0"
python3 pipeline/tts.py af_heart          # build/voice_raw.wav, build/words.json
python3 pipeline/audio.py                 # build/mix.wav (+ stems)
cd render && npm install && node render.cjs --s 1 --frames 0:1200 --out ../build/frames
cd .. && bash pipeline/encode.sh          # output/how-a-microwave-heats-food.mp4
```

`node render.cjs --s 0.5 --frames 0:1200:3` produces a quick low-resolution preview.

## Edit structure (synchronised to the measured narration)

| Time | Scene | What happens |
|---|---|---|
| 0.0–4.7 | Hook | A fast push toward a steaming bowl behind the perforated door, with a light sweep across the glass. A flame appears on "fire", then dissolves. The camera moves into the chamber, and a scan line returns the food from a false-colour view to its ordinary look on "radioactive". The kinetic headline plays over this. |
| 4.7–8.3 | Invisible waves | Cyan wavefronts expand from the waveguide port and reflect off the cavity walls. |
| 8.1–14.5 | Magnetron cutaway | The x-ray shell dissolves to show the magnetron (anode, cooling fins, ring magnets, antenna, filter box), the waveguide and the cavity. A wave packet travels down the guide, and the wavefronts make ring glows where they hit the walls. Callout labels identify the parts. |
| 14.2–21.9 | Microscopic reveal | The camera dives into the food and arrives among water molecules (O larger, two H at 104.5°) in an alternating field. The field is shown by flipping chevrons and sloshing particle streaks. A rack focus moves from the field to the molecules, and δ−/δ+ tags mark the polarity. |
| 21.8–24.3 | Energy → heat | The camera pulls back to the food as an amber temperature gradient spreads organically. |
| 24.2–33.4 | The twist | A potato is cut away. Violet/cyan energy is absorbed mostly in an outer band, and the wave crests decay with depth while the centre stays cool. Amber heat then conducts inward. A legend separates the two processes. |
| 33.2–38.5 | Payoff | A top-down cutaway shows a hot-spot map computed from the cavity's standing-wave pattern. The turntable then rotates, and the map shows the accumulated heating averaging along circular paths. This makes heating more even, though not perfectly even. |
| 38.1–40.0 | Hero | The bowl is drawn out of the open oven while it steams, ending on "Everyday science, explained." |

## Scientific accuracy notes

The claims made, and how the visuals respect them:

- **A magnetron generates the microwaves**, and a waveguide carries them into the cavity. The model deliberately has no wiring, so it cannot show incorrect electrical connections.
- **The metal cavity reflects microwaves.** The wave visual is built from the source plus its mirror images in the walls, which is the standard image-source model of reflection. The wavelength is drawn at its real scale: about 12.2 cm at 2.45 GHz in a cavity about 34 cm wide.
- **Water molecules are polar and reorient in the alternating field.** Each molecule's dipole feels a torque toward E(t), with damping and random thermal torques. The result is partial, lagging alignment that keeps reversing. There is no perfect lock-step, no spinning "propellers" and no "rubbing". The field frequency is slowed enormously for visibility, and the screen says "ILLUSTRATIVE · NOT TO SCALE".
- **Absorbed energy becomes heat through molecular interactions.** The visual shows warming and increased agitation, not flames.
- **Microwaves do not make food radioactive.** This is stated plainly, with no hazard symbols.
- **Not "inside-out" cooking.** Absorption decays with depth (an exponential band near the surface), and the interior then heats by conduction. The video gives no numeric penetration depth.
- **The turntable helps but does not guarantee even heating.** The averaged map visibly keeps some radial differences.

The video contains no invented temperatures, depths or other figures. The two reference pages named in the brief (FDA, "Microwave Ovens"; National MagLab Magnet Academy, "Microwaves") could not be fetched from the build environment because its network policy blocks those hosts. The claims above were therefore checked against established physics and the well-known content of those pages, not a fresh read. They are worth a quick human read-through against the live pages before publishing.

## Known limitations

- There was no GPU and no Blender in the build environment, so the 3D is rasterised with WebGL (SwiftShader) rather than path-traced. The scenes are rendered internally at 0.75× resolution and upscaled with sharpening, while the text is drawn at full 1080×1920.
- The narration is a local open-weight TTS voice. No paid neural TTS service was configured, and none was used. It has no separate breath sounds, and pacing comes from sentence-level synthesis plus hand-set pauses. All of the delivery runs at 1.02–1.08× the model's default rate.
