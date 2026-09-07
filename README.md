# Endless Rainbows

A js13kGames 2026 entry — theme **Unicorns and Rainbows**. Submissions close
13 September 2026. The whole game must fit in a 13,312-byte zip, with no
externally hosted anything.

Two swarms fight and the player commands neither. What the player does is keep
them level. The rainbow is the readout: it fades from whichever side is
winning, and is whole only when the board is level. Hold it there and a second
bow appears above it. What ends a run is not decided yet.

## Quickstart

```bash
npm install
npm run dev      # http://localhost:8080 — raw ES modules, no build, debug panel
npm run build    # → dist/index.html and dist/endlessrainbows.zip, size-gated
npm run size     # the byte count on its own
npm run check    # do the minified shaders render what the source rendered?
```

`check` needs a browser (`npm i -D puppeteer`, or point `PUPPETEER_PATH` at
one). Without it, it skips rather than fails.

`npm run dev` serves the source as written — save, refresh, done. esbuild is
not in that loop; it only runs for the build.

## Where it stands

The rainbow is in. The simulation is not: `balance` is driven by a placeholder
wander, and the player's whole verb is a click that pulls the board back
toward level. The debug panel's slider drives the bow by hand, and `?b=0.5`
opens the dev page in that mode at a given balance.

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
| `src/rainbow.js` | sky, clouds, ground and both bows — one fragment shader, one number in |
| `src/main.js` | boot, fixed-step loop, and the balance |
| `src/debug.js` | scrub `balance` by hand. Never ships |
| `scripts/build.js` | esbuild → GLSL squeeze → terser → Roadroller → zopfli zip, with the budget gate |
| `scripts/glsl.js` | the two shader minifiers, and why the weaker one is the default |
| `scripts/check_shaders.js` | renders source vs minified shader and compares pixels |
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
- **The default GLSL minifier is a regex squeezer, on purpose.** `spglsl` is a
  real compiler and would save ~180 more bytes, but 0.3.1 silently miscompiles
  `x - (y - z)` — it drops the parentheses without flipping the inner sign, and
  the same for `/`, `%` and the shifts. Our own `(r - (radius - w * 0.5)) / w`
  hit it and drew the bow a full band-width out of place, which `npm run check`
  caught as a 205/255 channel delta. `GLSL_SPGLSL=1` opts in; a patch is with
  upstream. Run `npm run check` before trusting any build made that way.
- **Never `pow()` a value that can go negative.** It is undefined in GLSL and
  renders as NaN, which renders as a white screen and no error at all. Square
  by multiplying. This cost an hour on day one.
- **Which side fades is a paired decision.** `balance > 0` means sunicorns
  ahead, and sunicorns are the *left* of the screen: the sky glows on the
  left, the clouds roll in on the left, and the bow fades from its left foot.
  Move one of those without the others and the cues contradict each other.

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
