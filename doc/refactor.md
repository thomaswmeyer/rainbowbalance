# Where the bytes are

Written 13 September 2026, against `9adbfe2`, at 12,752 of the 13,312 allowed
with 560 free. Every number here was measured by building a patched copy of
the tree and reading the zip, never by eye.

## The noise floor, which decides what counts as a finding

Roadroller's packer is stochastic. Sixteen builds of untouched source gave a
mean of **12,738 bytes**, a range of 12,713 to 12,779, and a standard
deviation of about 20. So **anything under about 25 bytes is not measurable**,
and every figure below is a mean of five to eight builds rather than one.

This is the second time this has caught something that looked obviously right:

- Factoring the eleven repeated `sim.project(o._x, o._y, o._s)` calls into a
  helper measured **30 bytes worse**. The packer already folds the repeats and
  the helper is novel text.
- Deriving the four castle literals from a table and `.map()` measured **4
  bytes worse**, which is nil.

Duplication is cheap here. Novelty is expensive. DRY in this codebase buys
clarity, and should be done for clarity, but it does not buy budget.

## Taken, for 188 bytes

| | Change | Saved |
| --- | --- | --- |
| 1 | Let the GLSL minifier rename externals. Uniforms, attributes and varyings are held long by `preserveExternals`; 23 names across the shaders, about 660 raw bytes of GLSL | **101** |
| 2 | `packer.optimize(2)` instead of `optimize(1)` in `scripts/build.js` | **48** |
| 3 | Collapse `uniforms()` to one indexed call, `gl['uniform' + v.length + 'f']`, with call sites passing an array | **27** |
| 4 | `formatClock` to `m:ss`, dropping the hour and day fields | **40** |

**Applied in `722ca8c`, and worth 188 rather than 218.** Measured at 12,564
against a 12,752 baseline, three builds each. Verified together: all five
shaders render pixel-identical under `npm run check`, all 165 assertions pass,
and the built page runs in Chrome with no console errors.

The 30 bytes not taken are in item 1, and were traded for readability.
Single-character externals are worth 101 but leave a shader talking about `R`
and `W`; two characters are worth 81 and keep the prefix that says whether a
thing is a uniform, an attribute or a varying, which is the half of the name
that carries the meaning. Single letters also collide — `H`, `L` and `U` are
already constants, and `U` is a struct in the unicorn shader — and the shader
equivalence check is what catches that.

Item 1 is therefore **not** free, whatever this document said before it was
done. It costs `uRes` becoming `uR` in three shader files.

A third caution, untaken: `maxMemoryMB: 512` looks like another 18 bytes but
adds nothing once stacked, while raising the decoder's runtime allocation from
146 MB to 315 MB. Not worth it for a judge on a phone.

Item 4 is the only other one that costs anything: a run over an hour now reads
`73:20` rather than `1:13:20`.

## Prices, if more is needed

Not recommendations. Each is the full cost of a feature — shader, JavaScript,
CSS, markup and every call site — so the decision can be made with the number
in front of it.

| Feature | Saved | What goes |
| --- | --- | --- |
| all audio | 1,687 | everything, and 13% of the whole budget |
| the castle shader | 905 | castles stop being visible; the fight over them continues |
| sparks | 583 | death bursts, promotion showers, spell streaks |
| the music, keeping field effects | 418 | the soundtrack as a readout |
| four of the five hands | 368 | freeze, ninja, berserk, turncoat; one smite left |
| clouds and rain | 326 | the weather front loses half its meaning |
| the tech panel | 305 | no way to see why a side is pulling ahead |
| the winner banner | 253 | the end-of-run screen |
| hills | 232 | rolling terrain in two shaders, and a frame-rate win |
| grass detail | 216 | blades, mottle, wind, dapple |
| the mage's cape and horn glow | 186 | wizards look like ordinary unicorns |
| the ice block | 160 | frozen animals keep only the pale tint |
| the claim bar | 151 | a capture shows only in the stone colour |
| pace controls | 159 | fast-forward, slow, pause |
| health bars | 62 | no per-unicorn readout |
| the audio limiter | 60 | clipping when forty blows land under a fanfare |
| obsidian spec and fresnel | 50 | polished black stone goes flat |
| rain shafts alone | 33 | the streaks under dense cloud |

Two things worth saying about that table.

The second bow costs **54 bytes**, for what the README calls the first thing
anyone will screenshot. That is the best value in the file. Leave it.

If 188 is not enough, the two cheapest levers that would not read as a
loss to someone seeing the game for the first time are **grass detail** and
**hills**, at 216 and 232. Both are a single switch, and both also buy frame
rate.

## Dead code: there is none

Checked against the actual bundle rather than by reading. `TUNE`, `turncoat`,
`edgeAt`, `recompile`, `SOURCES`, `initDebug` and the whole of `src/debug.js`
appear zero times in the esbuild output. The `__DEBUG__` discipline is working
and the debug paths cost nothing at all.

## On the audio, which was the one file never size-reviewed

It is not bloated for what it does. 4,646 bundle bytes buys eleven positioned
sound effects and a generative score, and its core is already tight. The only
structurally expensive pieces are the limiter, at 60 bytes, which the file
itself explains the need for, and three of the quieter cues at 94 between them.
The honest lever there is the music as a whole, at 418, not micro-surgery.
