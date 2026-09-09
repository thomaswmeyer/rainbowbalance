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

`check` needs a browser: `npm i -D puppeteer`, or the lighter
`npm i --no-save puppeteer-core` plus `PUPPETEER_PATH=puppeteer-core` and
`CHROME_PATH` pointing at a Chrome binary. Without one it skips rather than
fails.

The shaders are minified by `shader-minifier-js`, the TypeScript port of
Shader Minifier, pulled from GitHub at a pinned commit (it is not on npm).
`npm install` clones it and runs its build, which is why the first install
is slow. To move the pin, change the hash in `package.json` and reinstall.

`npm run dev` serves the source as written — save, refresh, done. esbuild is
not in that loop; it only runs for the build.

## Where it stands

The rainbow is in, and so are the unicorns. The simulation is not: `balance` is
driven by a placeholder wander, and the player's whole verb is a click that
pulls the board back toward level. The debug panel's slider drives both the bow
and the swarms by hand, and `?b=0.5` opens the dev page in that mode at a given
balance.

The swarms press on a front line that balance moves, so the herd and the
weather never disagree about who is winning. Every unicorn is the same animal
for now — the build constants are frozen in `unicorn.js`, named and used
exactly where a per-instance value would go, so giving them diverse
measurements later is a move from constant to attribute and nothing else.

The clouds are a volumetric march ported close to Valentin Galea's
[XtBXDw](https://www.shadertoy.com/view/XtBXDw) (MIT), tuned by hand, on its
value noise (Worley and Perlin were tried and dropped). The hills are a
raymarched heightfield and the grass on them is the far field of a
Voronoi-blade march, both after David Hoskins'
[lsfXz4](https://www.shadertoy.com/view/lsfXz4) — that one is CC BY-NC-SA, so
nothing is copied from it, and the blade march itself is gone: the blade field
is sampled once as a texture on the ground. Rain falls under the clouds:
that began as a bug in how the horizon sky was sampled and was kept. The tuning
panel that produced the constants is in git history (commit 82c266a): it gave
a live slider to every `const … // min max` line in the shader, with
"copy GLSL" to paste the values back. Restore `src/debug.js` and the two
hooks in `rainbow.js` and `main.js` from that commit to tune again.

```
[build]  3145 / 13312 bytes — 10167 free (76.4%)
  esbuild     5909 B
  terser      5646 B  (-4%)
  roadroller  3837 B  (-32%)
  glsl        4013 B  (-78% of 18373 B raw)
```

## Layout

| | |
|---|---|
| `src/gl.js` | WebGL2 context, programs, uniforms, the fullscreen triangle, instanced quad `Batch` |
| `src/rainbow.js` | sky, clouds, hills, grass and both bows — one fragment shader, one number in |
| `src/unicorn.js` | one signed-distance unicorn, instanced — the swarms, and where they stand |
| `src/main.js` | boot, fixed-step loop, and the balance |
| `src/debug.js` | scrub `balance` by hand. Never ships |
| `scripts/build.js` | esbuild → GLSL squeeze → terser → Roadroller → zopfli zip, with the budget gate |
| `scripts/glsl.js` | the shader minifier seam around shader-minifier-js |
| `scripts/check_shaders.js` | renders source vs minified shader and compares pixels |
| `scripts/dev_server.js` | static files, no dependencies |

## Conventions that the build depends on

- **Internal properties start with `_`.** Terser mangles `/^_/`, so
  `this._balance` costs two bytes in the shipped build. Anything not
  underscore-prefixed keeps its full name forever.
- **Shader source goes in a `` g`…` `` tagged template, one whole shader per
  template, `#version` first.** The build finds those and minifies them;
  nothing else in the file is touched, and a template without a `#version`
  line fails the build. **No `${}` interpolation inside one** — the minifier
  takes `raw[0]` and the rest would be dropped silently.
- **`__DEBUG__` is defined `false` at build time.** Anything reached only
  through `if (__DEBUG__)` is eliminated, including the dynamic import of
  `debug.js`. The build fails if the panel's strings survive into the bundle.
- **Shader constants with a `// min max` comment were tuned by slider**, and
  the panel that did it (git history, 82c266a) rewrote them into uniforms.
  Keep them out of constant expressions so it can come back: no
  `const x = NAME`, no global initialised from one.
- **No backticks anywhere in a shader, including comments.** It is a JS
  template literal, and the first backtick ends it.
- **No shared shader snippets.** The minifier folds constants, inlines, and
  renames everything the JS side does not address by name (uniforms,
  attributes and varyings keep theirs), so it has to see each shader whole:
  a function pasted in from a snippet would be renamed out from under its
  callers. Each shader that needs a helper — the batch vertex shaders' unit
  quad `corner()`, say — carries its own two-line copy, and the minifier
  inlines it anyway.
- **Run `npm run check` after touching a shader.** An optimising minifier's
  failure mode is a shader that compiles and draws something subtly wrong.
  The previous tool, `spglsl` 0.3.1, dropped the parentheses from
  `x - (y - z)` without flipping the sign and drew the bow a full band-width
  out of place; the check caught it as a 205/255 channel delta, and it is
  the same check that now shows a delta of 0 for shader-minifier-js.
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
