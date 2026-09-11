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
lunge and may miss. Nobody stands in anyone else's ground — a unicorn
blocked in its path steps aside in depth to get by — nor in a castle's,
which is as deep as it is wide, unless it is the garrison healing there — feet planted, necks lunging, a health bar over the
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

Castles change hands, which is what a fighter with nothing in front of it
walks off to do. There are three: one at each foot of the bow, held from the
first frame, and one standing unclaimed far up the field between them. What
moves a claim is who is standing on the castle — every fighter within reach
presses with its
size, so a veteran counts for more than a recruit, and only the difference
between the two sides tells, so a castle with as many defenders on it as
attackers is held however big the crowd. Past three recruits' worth a crowd
does no more, or a side that is already winning would take a castle in the
second it arrived. Taking a held one is two jobs, and that is what makes it
worth fighting over: the claim on it has to be broken first, which leaves it
nobody's and silent, and only then can a claim of your own be built up to
full — breaking goes twice as fast as building. A castle spawns at the rate
of the claim on it, so one being broken falls quiet well before it changes
hands, and it is no place to heal at until its claim is full again. The
middle castle spawns at a third of a home castle's rate on top of that: it
is an outpost, not a barracks. Held at the full rate it doubled its holder's
spawning and put it half a field closer to the last castle standing, both
corners of the triangle marching on the third, which is more than a castle
in the middle of the ground ought to be worth. All of
that is on the field to read: a castle nobody holds is bare grey stone, and
the claim on one is how much of its holder's sandstone or obsidian has come
in, so a castle changing hands bleaches and then takes the other colour on.
Taken, it goes up in the same white shower a promotion does.

Where that third castle stands is what makes the fight two-dimensional. It
is most of the way back to the horizon, so both sides walk to it on the
diagonal and meet across the middle of the ground rather than along the one
line the bow's feet make: over ten minutes of play the fighting has moved
from y −0.24, which is that line to the tenth of a unit, to y −0.17, and the
front rank of the field is empty except when someone is driven back onto it.
Two rules come with that. Everything on the ground that is a distance rather
than a unicorn's own size — a castle's reach, the doorstep a fighter stops
at, the ground its recruits come out onto — is scaled by the depth it is at,
because the field is drawn in perspective and a castle at the horizon is a
smaller thing to walk to and to hold; and a fighter marching on a castle
walks to a lane of its own a little to one side of it in depth, so that a
column arrives on a front rather than in single file. A lane is half the
reach at most, so the far edge of the front is still standing on the castle.
What the crowd settles at a gate is left settled: once a fighter is on a
castle's ground it stops correcting its depth, so a garrison shoved along
the wall stays spread along it instead of packing back onto the doorstep.

Capture has a consequence worth writing down: a side that loses a castle
loses the spawns it needed to take one back, so a board left to itself is
decided inside a minute. Which is not the same as capture deciding it. In
an unattended run the middle falls at 43s with the field already standing
12 against 2, and the last castle follows eight seconds later — and it still
follows eight seconds later with the middle castle spawning nothing at all.
A claim takes half a minute of standing on a castle unopposed, so completing
one is a thing a side can only do once it has already won the field. Capture
reads the game rather than deciding it, and the fight for the middle is
either a permanent tug of war — with the sides held within two fighters of
each other it was never once taken in ten minutes — or a formality. Keeping it level is the player's job, and that is
now the game. It is also why `npm run sim`'s long run plays the player,
badly — a smite on the leading side every second and a half while it is two
fighters ahead, the lightest hand that keeps a run going — since otherwise
every number it collects comes from the first minute of a run that is
already over.

Next, in order: what ends a run, deaths with some ceremony, unicorn classes
beyond the fighter, then sound.

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
rainicorns' in obsidian, and a third far up the field between them in
whatever stone belongs to whoever holds it: one signed distance field,
marched only inside its bounding sphere, drawn once per castle at the
position the simulation hands it — x across and y for depth, in the herd's
own units, so a castle deep in the field comes out smaller and hazier with
nothing else said about it — built the way the buildings in dr2's
[WtjSzR](https://www.shadertoy.com/view/WtjSzR) are (CC BY-NC-SA, nothing
copied). `?b=0.5` opens the dev page with the balance frozen at that value.
The dev page shows the frame rate and the counts under the clock, and takes
`?off=clouds,castle` to compile features out of the shaders, to see what each
costs. The slider panel that tuned the constants is in git history (commit
0e0063e): a slider per `const … // min max` line, "bake" to recompile with
the values as constants, "copy GLSL" to get them back. Restore `src/debug.js`
from there and give the lines their ranges back to tune again.

```
[build]  7964 / 13312 bytes — 5348 free (40.2%)
  esbuild    22693 B
  terser     21069 B  (-7%)
  roadroller 10383 B  (-51%)
  glsl       12530 B  (-71% of 43179 B raw)
```

## Layout

| | |
|---|---|
| `src/gl.js` | WebGL2 context, programs, uniforms, the fullscreen triangle, instanced quad `Batch` |
| `src/rainbow.js` | three passes: the world (sky, clouds, hills, grass), a castle, the bow — one number in |
| `src/unicorn.js` | one signed-distance unicorn, instanced — draws the herd it is handed |
| `src/sparks.js` | the burst a unicorn goes out in, instanced dots in its own colours |
| `src/sim.js` | the fight: castles spawn and are captured, fighters cross the field and fight, balance is who is left |
| `scripts/sim_test.js` | the fight headless — unit tests on hand-built situations, then a long run checked for invariants, with a crude player keeping it alive |
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
- **Run `npm run check` after touching a shader**, and give a new state a
  case in `CASES` if the sweep does not already reach it. An optimising
  minifier's failure mode is a shader that compiles and draws something
  subtly wrong. The previous tool, `spglsl` 0.3.1, dropped the parentheses
  from `x - (y - z)` without flipping the sign and drew the bow a full
  band-width out of place; the check caught it as a 205/255 channel delta,
  and it is the same check that now shows a delta of 0 for
  shader-minifier-js. It renders at 640×480 rather than something smaller
  because the smallest thing on screen — a castle deep in the field — covers
  a dozen pixels at 320×240, nearly all of them silhouette, and there a
  sub-pixel disagreement about where a marched edge falls reads as a whole
  pixel's worth of difference: twelve of the fifteen outliers allowed, for
  two renders that agree everywhere at twice the size.
- **Never `pow()` a value that can go negative.** It is undefined in GLSL and
  renders as NaN, which renders as a white screen and no error at all. Square
  by multiplying. This cost an hour on day one.
- **Which side fades is a paired decision.** `balance > 0` means sunicorns
  ahead, and sunicorns are the *left* of the screen: the sky glows on the
  left, the clouds roll in on the left, and the bow fades from its left foot.
  Move one of those without the others and the cues contradict each other.

## What is left

- [ ] What ends a run. Losing every castle is the obvious answer and is
      already reachable; nothing acts on it yet.
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
