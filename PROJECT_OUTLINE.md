# Project Outline — Image → Music V1

## Goal
Create a web-first interactive experience where an uploaded image becomes a playable musical surface. Desktop users hover; mobile users touch and drag. The active image area stays fully visible while the rest darkens, and the sampled color generates a musically safe chord.

## V1 scope
1. Image upload and responsive display.
2. Pointer/touch tracking over the image.
3. Soft circular spotlight around the active point.
4. Dark overlay outside the spotlight.
5. Local color sampling around the interaction point.
6. Hue → chord degree in C major.
7. Brightness → octave.
8. Saturation → chord richness.
9. Smooth browser-generated chord playback with Web Audio API.
10. Rhythmic vibration on supported mobile browsers.
11. Fully client-side; no backend, account, or upload storage.

## Main modules
- `App.tsx`: UI, pointer/touch lifecycle, canvas drawing, upload state.
- `color.ts`: pixel sampling and RGB → HSL conversion.
- `music.ts`: color → harmony mapping and Web Audio chord engine.
- `styles.css`: responsive desktop/mobile presentation.

## Interaction loop
Upload → render image → hover/touch → sample local color → map to chord → darken inactive area → play chord → pulse rhythm/haptics → release → fade audio and restore image.

## Why no Three.js
V1 is a 2D image interaction. HTML Canvas is smaller, simpler, and appropriate. Three.js becomes useful only if the product adds 3D displacement, particles, depth maps, camera movement, shader-based scenes, or spatialized visuals.

## Recommended V2
- Dream / Ambient / Digital instrument modes.
- Automatic playhead that scans and “performs” the image.
- Cached low-resolution analysis map for faster sampling.
- Record pointer path + generated note events.
- Playback and share/export.
- Native wrapper for reliable iPhone haptics.
