# Image → Music V1

A backend-free web prototype that turns an uploaded image into a playable musical surface.

## V1 interaction

- Upload any image.
- Hover on desktop, or touch/drag on mobile.
- The image darkens while a soft circular spotlight reveals the active area.
- Local hue selects a chord in C major.
- Brightness changes octave.
- Saturation can add a richer chord tone.
- Chords are generated with the Web Audio API.
- Mobile browsers that support the Vibration API receive subtle rhythmic pulses.

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
