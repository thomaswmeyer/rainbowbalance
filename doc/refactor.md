# Refactor plan

Written 12 September 2026, against `fcd82ea`. Every number here was measured,
not estimated: the byte figures come from building patched copies of the tree
in a scratchpad and reading the zip, and the GLSL figures from running the
real `minifyGlsl` on each candidate edit.

## Read this first

Byte-hunting is close to pointless in this codebase right now.

Roadroller's packer is stochastic. Four builds of *identical* source gave
9,843, 9,849, 9,856 and 9,862 bytes, a spread of ±20 B. The total safe saving
across every dead-code item below is 93 B, and the build currently has 3,449 B
free. So no item here should be done for its size. Do them because the code is
wrong, duplicated, or says something untrue.

Two corollaries worth remembering when this comes up again:

- Any saving under about 100 B cannot be measured in the zip at all. An edit
  that removed 38 B of GLSL produced a zip 2 B *larger* than baseline.
- Roadroller folds duplicated text at roughly 86%. Deduplicating 633 B of
  repeated shader source recovered 89 B of zip. Duplication is much cheaper
  here than it looks, which changes what DRY is for: clarity, not size.

## Stage 1 — duplication worth removing

Ordered by how much they simplify the code, not by bytes.

### 1.1 `home()` and `foeHome()` are one function

`src/sim.js:499` and `src/sim.js:517`. Identical line for line except the skip
condition, and the two conditions are exact logical inverses:

```js
if (c._side !== un._side || !c._own) continue;   // home
if (c._side === un._side && c._own) continue;    // foeHome
```

Replace with one search taking a boolean for which side of that test to keep.
Two call sites, both in `step()`.

### 1.2 Two freezes, two implementations of one effect

The player's ice and the mage's frost both hold a unicorn still, stop it
fighting, stop it healing and settle its pose. They are written twice:

- Ice: a self-contained early-exit block at `src/sim.js:626`.
- Frost: eight guards threaded through `step()` at lines 650, 738, 763, 795,
  800, 843, 844 and 845.

The only behavioural difference is that a unicorn under ice is immovable in
the crowd and one under frost is not (`sim.js:961`, `:990`, `:1012`). That
looks like an accident rather than a decision. Decide whether it is one, then
collapse both into a single held state carrying a flag for which of the two
the renderer should draw.

This is the largest simplification available and the one most likely to change
behaviour, so it wants its own commit and a look at the game afterwards.

### 1.3 `_scale` is redundant with `_s`

Since the world-space conversion (`e95b49a`), `_s` is always exactly
`BODY * _scale`, maintained at `src/sim.js:827`. `_scale` is read in four
places. Drop the field, keep `_s`, and derive the level ratio where the
capture weight needs it (`sim.js:550`).

### 1.4 `smite()` and `freeze()` are the same shape

`src/sim.js:1059` and `:1064`. Both find the nearest unicorn to a screen point
and set one field on it. Three lines apart. Minor, but free.

### 1.5 `step()` is 345 lines

`src/sim.js:581`, a third of the file. It covers spawning, ice, frost,
targeting, goal choice, walking, lanes, healing, casting, levelling,
animation, separation, bounds, culling, depth sorting and scoring. The seams
are already visible in the comment blocks. Splitting the per-unicorn decision
loop from the whole-herd passes that follow it would make the rest of this
list easier to carry out.

## Stage 2 — dead code that ships

Each measured by a real build. Safe unless noted.

| item | where | saving |
| --- | --- | --- |
| single-valued `castle._w` field | `sim.js:345`, `:964` | 40 B |
| null-location guard in `uniforms()` | `gl.js:130` | 39 B |
| `Batch.push` overflow guard | `gl.js:225` | 28 B |
| `state._manual`, written only by dev code | `main.js:30`, `:65` | 11 B |
| `drawUnicorns` herd parameter and its default | `unicorn.js:494` | 11 B |
| two uncalled functions in `CASTLE_FS` | `rainbow.js:527`, `:562` | 11 B |
| two context attributes that are spec defaults | `gl.js:45` | 8 B |

Together they give 93 B, not the 132 they sum to, because Roadroller shares
context between the repeated shapes.

Notes on three of them:

- `castle._w` holds `CASTLE_W` in all four castles and has one reader. It is a
  leftover from when footprints were scaled by depth. `scripts/sim_test.js:48`
  reads it too and needs the same edit. Its typedef at `sim.js:329` still says
  "at the bow's feet", which stopped meaning anything at the conversion.
- The `Batch.push` guard is the one item with real risk. It is unreachable
  today, because both batches are sized to caps their producers respect, but
  without it an overrun becomes a thrown `RangeError` rather than a dropped
  instance. Leave it unless the budget is actually tight.
- `state._manual` need not be deleted. Changing `main.js:65` to test
  `!__DEBUG__ || !state._manual` keeps the dev screenshot switch working and
  folds to a bare assignment in production, for the same saving.

Separately, and not for the bytes: `terrain(vec2(0.0))` at `rainbow.js:347`
and `:691` is provably zero, since the value-noise hash returns zero at the
origin. Removing it saves 22 B but, more usefully, takes a three-octave
terrain evaluation out of every fragment of two shaders. It is a silent
dependency on that hash, so it needs a comment saying so.

## Stage 3 — things that say something untrue

No bytes in any of these. They are wrong, which is worse.

Left behind by the screen-space to world-space conversion in `e95b49a`:

- `src/sparks.js` lines 83, 104 and 131 each contain `s / 0.155`. That constant
  was `NEAR_S`, the screen size of a full-grown unicorn at the front row, and
  it was deleted from `sim.js` in that commit. The arithmetic still happens to
  be right. Nothing defines the number any more, in three places.
- `src/sim.js:281` documents `_s` as "size, from y". Size has not depended on
  depth since the conversion.
- `src/main.js:178` computes `sim.FOOT / c._y`, a second perspective ratio
  living outside `project()`, which `sim.js:88` calls the only place
  perspective happens. It is correct, and it is the last hand-rolled one.
- `src/main.js:77` says "pixels to the herd's units". The herd's units are
  world units now; that line converts to screen units.
- `src/unicorn.js:84` refers to `QUAD_CORNER` exported from `gl.js`. There is
  no such export. The reasoning around it is still sound.
- `src/rainbow.js:509` explains `SKY_MIN`, which that shader does not declare.

Stale beyond the source:

- `README.md:111` says there are three castles. There are four.
- `README.md:125` says the middle castle spawns at a third of a home castle's
  rate. Both outposts spawn at half.
- `README.md:84` describes a mage being squeezed "out past x −2.7 ... half a
  screen behind", which is in the old screen coordinates.
- `scripts/check_shaders.js:98` passes a `uIntegrity` uniform that no shader
  declares, and samples castles at the old screen positions. It never samples
  the foreground castle at all.

## Measured and deliberately not doing

- **Sharing the duplicated terrain block between `FS` and `CASTLE_FS`.**
  `rainbow.js:514-566` duplicates `rainbow.js:180-248` character for
  character, 633 B of minified GLSL. Blocked three ways: the `g` tag at
  `gl.js:24` returns only the first literal chunk, so any interpolation is
  silently dropped; `glsl.js:36` scrapes shader bodies from source text before
  any JS runs; and `glsl.js:20` documents the one-translation-unit rule
  explicitly. Worth 89 B of zip if all three were changed. Not worth it.
- **A `drain(list, fn)` helper for the four identical loops at
  `main.js:45-63`.** Measured at 20 B *worse* than the duplication.
- **The pace controls** (`main.js:212-233`, `:113`, `:149`, `:260`) are the
  largest removable block at 137 B, but `README.md:170` documents them as a
  feature. Listed so the cost is known, not as a candidate.
- **Rebuilding the cloud shader's 3D value noise on the ground shader's 2D
  hash.** About 150 B, but it changes the cloud fractal and would fail the
  equivalence check. That is a visual redesign.

## One process note

`npm run check`, the shader equivalence test, had been silently skipping with
"no puppeteer" for an unknown length of time. `puppeteer-core` is installed but
the script needs pointing at a browser:

```sh
PUPPETEER_PATH=puppeteer-core \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
npm run check
```

All five shaders pass. Worth wiring those two variables into the script or an
`.env` so the check stops being optional.
