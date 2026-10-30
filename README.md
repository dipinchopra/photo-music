# Image → Music

A browser instrument that generates music from objects placed on a photograph.
Built with React, TypeScript, Canvas, Pointer Events and Web Audio; no backend required.

## Place loops

1. Upload a photo, choose Keys, Guitar, Bass or Drums, and tap to place a circle.
2. Each circle plays automatically. Drag to move it; tap with the same instrument to remove it.
3. Use Motion to let circles sway or breathe. Undo, Redo and Shuffle remain available.
4. Open Music for key, scale, octave and melodic range. Auto key/scale use the photo's analysis.

There is no finger-controlled Play image mode. Placing a circle adds an autonomous part.
The existing sample-pad instrument remains available under Sample pads.

## Composition

- The whole photo establishes style, tempo, swing, scale and a spatially derived chord progression.
- Each melodic circle gets a repeatable two-bar motif inside an eight-bar statement/repeat/answer/return structure.
- Local light contours shape melodic direction; edge activity shapes rhythm and accents. Circle size and Variation control detail.
- Lead and response roles favor different phrase halves. At most two Keys or Guitar attacks sound per clock step; priority rotates so additional circles remain audible.
- Strong beats prefer chord tones, weak beats allow passing scale notes, and octave choices favor nearby notes.
- Moving circles keep their rhythm identity. Significant region changes gradually develop their notes at two-bar boundaries. Continuous image sampling still changes the timbre of sounding notes.
- Bass supports the common harmony; percussion uses phrase-sampled regional character. Four-on-the-floor is optional and starts off.
- Shuffle varies photo-derived harmony and ensemble without enabling automatic arpeggios. Explicit arpeggiator controls remain available.
- Music settings preserve the clock. Key, scale and octave affect the next notes; melodic range shapes the next phrase. Settings persist through Shuffle and photo changes until changed explicitly.

## Run and verify

```bash
npm install
npm run dev -- --host 0.0.0.0
npm run build
node --test tests/*.test.mjs
```

Tests use Node's TypeScript stripping API (Node 22.13+). Open the network URL printed by Vite on a device on the same Wi-Fi, or use the GitHub Pages deployment.

## Recording and mobile

Record captures the photo visuals and the shared audio mix using MediaRecorder where supported.
Audio starts from a user gesture. Visibility and audio-state recovery handle interrupted browser playback.
Device browser audio and recording support still require hands-on testing.

## Deployment

Pushes to `main` run `.github/workflows/deploy-pages.yml`, build `dist`, and publish to GitHub Pages.
