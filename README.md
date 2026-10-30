# Image → Music V1

A backend-free web prototype that turns an uploaded image into a playable musical surface.

## Play image

Upload a photo to play its pixels directly. Tap for a note, hold to sustain,
drag to change pitch and tone, or use multiple fingers for chords (up to eight voices).
No sample kit or sequencer is required in this mode.

- Local average hue chooses a scale degree across the selected range.
- Near-gray regions use lightness to select pitch instead of unstable hue.
- Brightness controls the low-pass filter; saturation adds harmonic richness.
- Texture controls attack and release. Note boundaries use hysteresis to reduce jitter.
- Key, scale, octave and range controls retune the image instrument, including held notes.
- Pointer release/cancellation, changing modes and hiding the page release held voices.
- Record captures the audio and the active photo visuals where browser recording is supported.

Place loops and Sample pads remain available as separate modes. Switching to Play image
clears the loop board (recoverable through Undo in Place loops) and stops sample loops.
The image instrument uses the Image volume and Keys volume mixer paths.

## Stack

- React
- TypeScript
- Vite
- HTML Canvas
- Web Audio API
- Pointer Events
- Vibration API where supported

Three.js is intentionally not used in V1. It is unnecessary for a 2D image + spotlight interaction and can be introduced later for depth, shaders, particles or spatial visuals.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Build

```bash
npm run build
```

## Suggested next milestones

1. Replace simple oscillators with a polished sampled or synthesized instrument.
2. Add 3 sound modes: Dream, Ambient, Digital.
3. Add auto-play scan mode.
4. Cache a downscaled analysis canvas instead of rebuilding the sampling canvas per pointer event.
5. Add record/playback of pointer movement and generated notes.
6. Add shareable audio/video export.

## Important mobile note

`navigator.vibrate()` is not supported consistently across iOS Safari. Native iOS haptics would require a native wrapper/app implementation (for example Capacitor + native haptic APIs). The web V1 gracefully works without it.
