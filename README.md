# Image → Music

A browser instrument that generates music from objects placed on a photograph.
Built with React, TypeScript, Canvas, Pointer Events and Web Audio; no backend required.

## Place loops

1. Upload a photo, choose Keys, Guitar, Bass or Drums, and tap to place a circle.
2. Each circle plays automatically. Drag to move it; tap with the same instrument to remove it.
3. Use Motion to let circles sway or breathe. Undo, Redo and Shuffle remain available.
4. Open Music for key, scale, octave and melodic range. Auto key/scale use the photo's analysis.

There is no finger-controlled Play image mode. Placing a circle adds an autonomous part.
The existing sample-pad instrument remains available under Live image.

## Visual compositions

Living Photo retains its soft refraction and placement markers. Instrument Shapes are
compact display marks (12–22 px radius) with usable touch targets; this display scale
never changes the musical radius, sampled pixels, volume or composition.

The other treatments build a shared scene across placed instruments:

- Photo Score: photographic cuts and curved image surfaces link the placed ensemble.
- Silk Waves: three fine refracted bands catch each note.
- Prism: small facets and broader photo planes connect the placements.
- Photo Echoes: two layered exposures bring another region of the image into the composition.
- Contour Ink: fine lines use local color and the sampled light contour.

Note hits drive the visual response; placement motion carries it through the image.
Connective surfaces are decorative: the actual instrument pieces remain the drag/remove
targets. Style previews show a small ensemble. The same scene renderer is used for
screen playback and video export. Live pad hits use the matching individual treatment.

## Live sample layers

Keep a placed ensemble running and switch to Live image to add independent layers.
Loop is the default: tap once to add a layer, again to remove it. Choose next-bar
(default) or next-beat changes. A stopped layer fades out over approximately 180 ms;
one-shots play their recorded tails and have a short attack ramp to avoid clicks.

The photo itself is the live player: its 4×4 regions support multiple fingers,
swipes, keyboard shortcuts and accessible button labels. There is no separate pad bank.
A compact on-image control popover contains One-shot/Loop, next-bar/next-beat changes,
melody repeat timing and Stop live layers. Show sounds temporarily reveals the region map.
Active region names stay visible on the image.

Queued layers have dashed cues; playing layers show a small audio-clock progress ring;
stopping layers become quieter, then leave a fading trace. One-shots have a brief visual
pulse. These cues differ from placed instrument markers and appear in video exports.
The progress getter reads the existing transport; it never changes musical scheduling.
Tap a queued start to cancel it; tap a queued stop to keep the layer playing.
Launches continue to share the placed ensemble clock.

A bar is four beats here. Melodic layers retrigger every bar by default (or every beat
via the on-image controls or Mix); their sample tails are not forcibly cut at the bar line. Drums follow the groove.
Stop live layers fades those layers without stopping the placed ensemble; Clear placed
releases the placed voices while leaving samples playing. Switching between Place loops
and Live image keeps both kinds of loop running. A new photo starts a fresh session.

## Composition

- The whole photo establishes style, tempo, swing, scale and a spatially derived chord progression.
- Each melodic circle gets a repeatable two-bar motif inside an eight-bar statement/repeat/answer/return structure.
- Local light contours shape melodic direction; edge activity shapes rhythm and accents. Circle size and Variation control detail.
- Lead and response roles favor different phrase halves. At most two Keys or Guitar attacks sound per clock step; priority rotates so additional circles remain audible.
- Strong beats prefer chord tones, weak beats allow passing scale notes, and octave choices favor nearby notes.
- Moving circles keep their rhythm identity. Significant region changes gradually develop their notes at two-bar boundaries. Continuous image sampling still changes the timbre of sounding notes.
- Bass supports the common harmony; percussion uses phrase-sampled regional character. Four-on-the-floor is optional and starts off.
- Shuffle varies photo-derived harmony and ensemble without enabling automatic arpeggios. Explicit arpeggiator controls remain available.
- Music settings preserve the clock. Key, scale and octave change on the next beat: old pitched voices fade to zero and new voices ease in. Active melodic sample layers revoice without resetting their repeat grid; percussion keeps playing. Melodic range shapes the next phrase. Settings persist through Shuffle and photo changes until changed explicitly.

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
