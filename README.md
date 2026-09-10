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
npm run sim      # the fight, headless: unit tests, then ten minutes of play
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

The rainbow, the world and the herds are in, and the fight has begun.
`sim.js` is the game: castles spawn fighters, a fighter picks the nearest
enemy it can see that is not already set upon by two others and closes on it,
and they fight horn to horn. Targeting is one-way — what makes it mutual is
being hit, and a unicorn that is struck turns on whoever struck it unless it
is already in a fight of its own. A swing lands at the bottom of the neck's
lunge and may miss. Nobody stands in anyone else's ground: a unicorn blocked
in its path steps aside in depth to get by — feet planted, necks lunging, a health bar over the
horn — and the loser fades out over half a second in a burst of sparks in
its own colours. A winner left under half health withdraws to its
nearest own castle, stands squarely on it healing four times as fast — it can be run down on
the way or at the gate, and turns and fights if it is — and
comes back a level up: a quarter of a recruit's size and half a recruit's
hit points added — added, not compounded — grown into over a second in a
white shower of sparks. A recruit starts at half
size, so a field of veterans is visibly a field of veterans. Balance — the one number the sky,
the bow and the castles read — is who has more fighters alive, smoothed. The
player's verb is god mode: a touch strikes down the unicorn nearest to it.

Next, in order: unclaimed castles to fight over, capture, what ends a run,
deaths with some ceremony, unicorn classes beyond the fighter, then sound.

The clouds are a volumetric march ported close to Valentin Galea's
[XtBXDw](https://www.shadertoy.com/view/XtBXDw) (MIT), tuned by hand, on its
value noise (Worley and Perlin were tried and dropped). The hills are a
raymarched heightfield and the grass on them is the far field of a
Voronoi-blade march, both after David Hoskins'
[lsfXz4](https://www.shadertoy.com/view/lsfXz4) — that one is CC BY-NC-SA, so
nothing is copied from it, and the blade march itself is gone: the blade field
is sampled once as a texture on the ground. Rain falls under the clouds:
that began as a bug in how the horizon sky was sampled and was kept. A
castle stands at each foot of the bow, the sunicorns' in sandstone and the
rainicorns' in obsidian: one signed distance field, marched only inside its
bounding sphere, built the way the buildings in dr2's
[WtjSzR](https://www.shadertoy.com/view/WtjSzR) are (CC BY-NC-SA, nothing
copied). `?b=0.5` opens the dev page with the balance frozen at that value.
The dev page shows the frame rate and the counts under the clock, and takes
`?off=clouds,castle` to compile features out of the shaders, to see what each
costs. The slider panel that tuned the constants is in git history (commit
0e0063e): a slider per `const … // min max` line, "bake" to recompile with
the values as constants, "copy GLSL" to get them back. Restore `src/debug.js`
from there and give the lines their ranges back to tune again.

```
[build]  7666 / 13312 bytes — 5646 free (42.4%)
  esbuild    15248 B
  terser     14775 B  (-3%)
  roadroller  7626 B  (-48%)
  glsl       11265 B  (-72% of 39787 B raw)
```

## Layout

| | |
|---|---|
| `src/gl.js` | WebGL2 context, programs, uniforms, the fullscreen triangle, instanced quad `Batch` |
| `src/rainbow.js` | three passes: the world (sky, clouds, hills, grass), a castle, the bow — one number in |
| `src/unicorn.js` | one signed-distance unicorn, instanced — draws the herd it is handed |
| `src/sparks.js` | the burst a unicorn goes out in, instanced dots in its own colours |
| `src/sim.js` | the fight: castles spawn, fighters pair off and fight, balance is who is left |
| `scripts/sim_test.js` | the fight headless — unit tests on hand-built situations, then a long run checked for invariants |
| `src/main.js` | boot, fixed-step loop, the page and clock, god mode, and the depth-ordered draw of herd, castles and bow |
| `src/debug.js` | frame rate under the clock, and the `?b=` and `?off=` URL switches. Never ships |
| `scripts/build.js` | esbuild → shader-minifier-js → terser → Roadroller → zopfli zip, with the budget gate. The page is a skeleton; `main.js` makes the markup so it is packed, not just deflated |
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
- **Keep tunable shader constants out of constant expressions**: no
  `const x = NAME`, no global initialised from one. The slider panel (git
  history, 0e0063e) rewrites them into uniforms, and that is what lets it
  come back. Feature switches are `const int NAME_ON = 1` and tested with
  `== 1`: the minifier folds that and drops the dead branch, and does not
  fold `!true`.
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

- [ ] Unclaimed castles, capture, and what ends a run.
- [ ] Unicorn classes beyond the fighter.
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
