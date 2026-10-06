# dorotimer

A focus timer on a single radial knob, where every number morphs into the next and your sessions slowly build up the background.

Built with [shadcn/ui](https://ui.shadcn.com) and [Torph](https://torph.lochie.me). Runs in the browser at http://localhost:8980.

## Getting started

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install   # once: downloads the dependencies
npm start     # starts it at http://localhost:8980
```

`npm run build` type-checks and builds a static copy into `dist/`, which any web server can host.

## Using it

**Focus.** Turn the knob to set the length: 10 to 90 minutes in 10-minute steps. For single minutes, hold the knob still for a moment: it zooms into a 20-minute window with a bar for every minute, numbers around the arc and a solid handle. Let go to zoom back out.

**Break.** Pull the handle past the start of the dial, into the gap at the bottom, and hold: the knob turns into the break setting (off, or 5 to 30 minutes). Drag to set it, let go to get back to the focus length. The break shows under the clock as "+ 5 min break".

**Run.** One press of **Start** runs the focus and then, if one is set, the break straight after it. The button also pauses and resumes. To reset a run, hold the button for 5 seconds: it fills red from left to right, and letting go early cancels.

**Keyboard.** With the knob focused, the arrow keys move in steps and Shift + arrow in single minutes; Home and End jump to the ends. **B** switches to the break setting (arrows set it; B, Enter or Escape go back). Holding Space or Enter on the button resets, like holding it with the pointer.

**Sessions.** Every focus session is kept in your browser's local storage; nothing is sent anywhere. Sessions you reset after at least 30 seconds count too, with the minutes you actually did. The background draws them in one of two styles, picked from the gear in the bottom-right corner:

- **Grid:** a square per session, shaded by its length, from almost black for 1 minute to white for 90. Reset sessions are muted orange.
- **Topography:** every session raises a hill, and each day's sessions build one mountain, drawn as contour lines.

The gear also has **Reset all**, and a **Developer** section that generates test sessions to see how the backgrounds look with lots of history.

The theme follows your system's light or dark setting, and the speaker button mutes the sounds.

## How it's made

- `src/components/knob.tsx`: the knob. An SVG dial with a bulge around the handle, a rubber-band stretch past either end (sigmoid-eased, springs back with a bounce), hold-to-zoom, and the second (break) setting. Bulge, stretch and hold timings are constants at the top of the file.
- `src/components/backgrounds.tsx`: the grid and the topography (contour lines by marching squares), drawn on a canvas behind the timer.
- `src/lib/sound.ts`: sounds through the Web Audio API. The switch "clack" is generated in code; the others are files in `public/sounds/`. To change a sound or its volume, edit `SOUNDS` and `VOLUME`.
- `src/lib/sessions.ts`: saving sessions and settings in local storage.
- `src/components/ui/`: shadcn/ui components, copied into the project so they can be edited.

Vite, React 19, TypeScript and Tailwind CSS 4.

## Credits

- Text morphing: [Torph](https://torph.lochie.me) by Lochie Axon (MIT).
- Components: [shadcn/ui](https://ui.shadcn.com) (MIT).
- Typeface: [Geist](https://vercel.com/font) by Vercel (SIL Open Font License).
- Sounds: [SND01 "sine"](https://snd.dev) by Yasuhiro Tsuchiya, Dentsu Lab Tokyo. Used under SND's terms of use, **not** under this project's licence; see [public/sounds/NOTICE.md](public/sounds/NOTICE.md).

## Licence

The code is [MIT](LICENSE) licensed. The sounds in `public/sounds/` are not; see above.
