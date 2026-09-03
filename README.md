# Endless Rainbows

A js13kGames 2026 entry — theme **Unicorns and Rainbows**. Submissions close
13 September 2026. The whole game must fit in a 13,312-byte zip, with no
externally hosted anything.

Two swarms fight and the player commands neither. What the player does is keep
them level. The rainbow is the readout: it frays toward whichever side is
winning and erodes while the board stays lopsided. Hold the balance and it
heals, and a second bow appears above it. Let it shatter and the run is over.
Score is time survived.

## Quickstart

```bash
npm install
npm run dev      # http://localhost:8080 — raw ES modules, no build, debug panel
npm run build    # → dist/index.html and dist/endlessrainbows.zip, size-gated
npm run size     # the byte count on its own
```

`npm run dev` serves the source as written — save, refresh, done. esbuild is
not in that loop; it only runs for the build.

## Where it stands

The rainbow and the rule it expresses are in. The simulation is not: `balance`
is driven by a placeholder wander, and the player's whole verb is a click that
pulls the board back toward level. That is deliberate — the constants at the
top of `src/main.js` (deadzone, drain, regen, pressure ramp) are the game, and
they can be tuned against the real visuals before a single unicorn exists.

```
[build]  2716 / 13312 bytes — 10596 free (79.6%)
  esbuild     4563 B
  terser      4210 B  (-8%)
  roadroller  3196 B  (-24%)
```

## Layout

| | |
|---|---|
| `src/gl.js` | WebGL2 context, programs, uniforms, the fullscreen triangle, instanced quad `Batch` |
| `src/rainbow.js` | sky, ground and both bows — one fragment shader, two uniforms |
| `src/main.js` | boot, fixed-step loop, and the balance/integrity rule |
| `src/debug.js` | scrub `balance` and `integrity` by hand. Never ships |
| `scripts/build.js` | esbuild → GLSL squeeze → terser → Roadroller → zopfli zip, with the budget gate |
| `scripts/dev_server.js` | static files, no dependencies |

## Conventions that the build depends on

- **Internal properties start with `_`.** Terser mangles `/^_/`, so
  `this._balance` costs two bytes in the shipped build. Anything not
  underscore-prefixed keeps its full name forever.
- **Shader source goes in a `` g`…` `` tagged template.** The build finds those
  and squeezes them; nothing else in the file is touched. **No `${}`
  interpolation inside one** — the minifier takes `raw[0]` and the rest would
  be dropped silently.
- **`__DEBUG__` is defined `false` at build time.** Anything reached only
  through `if (__DEBUG__)` is eliminated, including the dynamic import of
  `debug.js`. The build fails if the panel's strings survive into the bundle.
- **Never `pow()` a value that can go negative.** It is undefined in GLSL and
  renders as NaN, which renders as a white screen and no error at all. Square
  by multiplying. This cost an hour on day one.
- **Which side erodes is a paired decision.** `balance > 0` means sunicorns
  ahead: the sky glows on the right and the *left* end of the bow is eaten.
  Flip one of those without the other and the two cues contradict each other.

## What is left

- [ ] Sim: unicorns as instanced quads, castles, spawn waves, capture, the
      heuristic AI. `Batch` in `gl.js` is there for it and is not yet used.
- [ ] Replace the placeholder wander in `main.js:step` with that sim.
- [ ] Procedural music, tied to the balance state — melody in while level,
      detuning as it frays.
- [ ] Title, game-over and score, without shipping a font.
- [ ] Mobile: touch is wired, but nothing has been tested on a phone.

## Rules to check before submitting

The zip must be self-contained and play from the filesystem, with no
externally hosted libraries, fonts, or data. Bundled libraries are fine.
Confirm the current wording on how "created during the competition" treats
pre-existing code — none is reused here, but the rule is worth reading rather
than assuming.
