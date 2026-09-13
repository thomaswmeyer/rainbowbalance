# Rainbow Balance

A js13kGames 2026 entry — theme **Unicorns and Rainbows**. Submissions close
13 September 2026. The whole game must fit in a 13,312-byte zip, with no
externally hosted anything.

Two swarms fight and the player commands neither. What the player does is keep
them level, against two sides that are getting better at the fight the whole
time. The rainbow is the readout: it fades from whichever side is
winning, and is whole only when the board is level. Hold it there and a second
bow appears above it. What ends a run is not decided yet.

## Quickstart

```bash
npm install
npm run dev      # http://localhost:8080 — raw ES modules, no build, debug panel
npm run build    # → dist/index.html and dist/rainbowbalance.zip, size-gated
npm run size     # the byte count on its own
npm run check    # do the minified shaders render what the source rendered?
npm run sim      # the fight, headless: unit tests, then ten minutes of play
npm run sim -- games 100   # a hundred whole games, and who won them
```

`check` needs a browser and goes looking for one itself: `puppeteer-core` comes
with `npm install`, and Chrome or Chromium is picked up from the usual places
on macOS and Linux, or from wherever `PLAYWRIGHT_BROWSERS_PATH` keeps one.
`CHROME_PATH` overrides that, `PUPPETEER_PATH` names a different driver to
import. Only with no browser anywhere does it skip rather than fail, and it
says what it looked for — it had been skipping quietly for an unknown length
of time, which is worse than not having the check.

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
lunge and may miss. Everything on the field walks at one speed and stops
exactly where it is going rather than easing into the last inch of it — a
walk that slowed as it arrived could never close on anything that was walking
away from it, which is a thing the field now has on it. Nobody stands in
anyone else's ground — a unicorn blocked in its path steps aside in depth to
get by — nor in a castle's, which is as deep as it is wide, unless it is the
garrison healing there — feet planted, necks lunging, a health bar over the
horn — and the loser fades out over half a second in a burst of sparks in
its own colours. A winner left under half health withdraws to its
nearest own castle, stands squarely on it healing four times as fast — it can be run down on
the way or at the gate, and turns and fights if it is — and
comes back a level up: a quarter of a recruit's size and half a recruit's
hit points added — added, not compounded — grown into over a second in a
white shower of sparks. A recruit starts at half
size, so a field of veterans is visibly a field of veterans. Balance — the one number the sky,
the bow and the castles read — is who has more fighters alive, smoothed. The
player's verbs are both god mode, chosen from the two buttons at the top left:
a touch strikes the nearest unicorn down in a burst of sparks, or freezes it
into a block of ice. Frozen, it stands there for twenty seconds doing nothing
and taking nothing but damage, in the way of the fight but out of it, while
the block melts off it from the top down.

Not every recruit fights, once a side has paid for the wizards. One in four
then comes out of the gate in a cape and never goes horn to horn with
anything: a mage marches where a fighter
marches, stops short as soon as the nearest enemy is within a spell's length,
gives ground to anything that gets well inside that, and every three and a
half seconds freezes the nearest enemy within reach for a second and a half —
a unicorn that cannot walk, cannot swing and cannot heal, but is still a
target, still presses whatever claim it was standing on, and still stands in
everyone's way. What that hands a side is not damage. It is a fight where one
of the two is not swinging back. What it costs is a fighter's place in the
herd, and a mage never levels besides, a unicorn that never wins a fight
never walking off to heal from one. It walks at three quarters of a fighter's
pace, which is what lets anything that picks it out run it down.

It stops short rather than holding a distance, and the difference is the
whole of why it stays on the field: holding a spell's length from the nearest
enemy is a circle of places to stand, so a mage shoved along that circle had
nothing pulling it back, and the crowd squeezed mages out one at a time —
off the side of the board, and a long way behind the fight they were casting
into. (How far was measured in the screen coordinates the herd walked in
before the world-space conversion, and has not been taken again.)

Two things about the mage are not settled, and both are visible in
`npm run sim`. A mage that gives ground freezes its pursuer every three and a
half seconds, which takes more off that pursuer's speed than being slow takes
off the mage's, so it kites a fighter off the field instead of being caught
by it. The second thing a mage did was silt the herd up: a mage dies less
often than a fighter, standing as it does behind its own line, so ten minutes
of it filled the herd with capes — sixty-odd alive of a ceiling of
sixty-four, better than a third of them in capes, the fights down from about
six hundred and ninety to three hundred, and a run that went one-sided
because there was nobody left doing the killing. Three mages to a side fixed
it, and so did having fighters pick the cape out of a crowd first. Neither is
in, and the tech tree does not replace them. It delays the problem and no
more: capes have to be paid for now, so they turn up about thirty-six seconds
into a run instead of in its first recruits, but nothing about a mage dying
less often than a fighter has changed, and a long run still silts up. Ten
minutes with the tree ends with fifteen of the twenty-four living in capes;
ten minutes without it, played by the same hand, ends with thirty-seven of
fifty-four. Three in five against seven in ten is not a fix. What a mage
costs its side is still a design question, and the answer to it is still not
a patch.

A wizard has three spells once its side has bought all three, and the rule for
choosing between them is in the tech tree section below. There are still only
two *freezes*, though, and that is deliberate until both have been played. The player's is a block of ice: twenty seconds,
cast by the second god-mode hand, and nothing of the animal inside it moves at
all. The mage's is frost: a second and a half, cast by an animal rather than
by the player, and it stops a unicorn walking, swinging and healing without
taking it out of the crowd. They are meant to be told apart at a glance — the
ice is a block standing on the ground with the unicorn inside it, the frost is
the unicorn itself gone pale and crystalline — and which of them stays, or
whether both do, is a question for after playing them.

Castles change hands, which is what a fighter with nothing in front of it walks
off to do. There are four: one at each foot of the bow, held from the first
frame, and two standing unclaimed for the two sides to meet over — one far up
the field between them, one in the foreground under the middle of the arch.
What moves a claim is who is standing on the castle — every fighter within
reach presses with its size, so a veteran counts for more than a recruit, and
only the difference between the two sides tells, so a castle with as many
defenders on it as attackers is held however big the crowd. Past three
recruits' worth a crowd does no more, or a side that is already winning would
take a castle in the second it arrived. Taking a held one is two jobs, and that
is what makes it worth fighting over: the claim on it has to be broken first,
which leaves it nobody's and silent, and only then can a claim of your own be
built up to full — breaking goes twice as fast as building. A castle spawns at
the rate of the claim on it, so one being broken falls quiet well before it
changes hands, and it is no place to heal at until its claim is full again. An
unclaimed castle spawns at half a home castle's rate on top of that: an
outpost, not a barracks. At the full rate one of them doubled its holder's
spawning, from ground half a field closer to the last castle standing, and the
fight was over as soon as either changed hands. Half is worth going for — the
recruits, the forward ground, and the denying of it — without being a second
army on its own, and taking both is worth as much again as a home castle, which
is the point: there are two of them, at opposite ends of the field, and a side
cannot sit on both. All of that is on the field to read: a castle nobody holds
is bare grey stone, and the claim on one is how much of its holder's sandstone
or obsidian has come in, so a castle changing hands bleaches and then takes the
other colour on. Taken, it goes up in the same white shower a promotion does.

Where the two unclaimed castles stand is what makes the fight two-dimensional.
One is most of the way back to the horizon and one is in the foreground, so
both sides walk the diagonals and meet across the whole ground rather than
along the one line the bow's feet make: over ten minutes of play the mean depth
of a fight is 17.0, where that line stands at 21, and the front of the field is
busy rather than empty, there being a castle down there to be taken. Two rules
come with that. Everything on the ground that is a distance rather than a
unicorn's own size — a castle's reach, the doorstep a fighter stops at, the
ground its recruits come out onto — is the one distance wherever it is, because
the herd walks a flat plain in world units and only the picture of it is drawn
in perspective: a castle deep in the field is not a smaller thing to walk to,
to stand on or to hold, it only looks smaller because it is further away. And a
fighter marching on a castle walks to a lane of its own a little to one side of
it in depth, so that a column arrives on a front rather than in single file. A
lane is half the reach at most, so the far edge of the front is still standing
on the castle. What the crowd settles at a gate is left settled: once a fighter
is on a castle's ground it stops correcting its depth, so a garrison shoved
along the wall stays spread along it instead of packing back onto the doorstep.

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
badly — a smite on the leading side every three quarters of a second while it
is two fighters ahead, the lightest hand that keeps a run going — since
otherwise every number it collects comes from the first minute of a run that
is already over.

That hand was every second and a half until the tech tree went in, and the
tree is what made it too light: over seven seeds it left a side wiped out in
five of them and the balance pinned past 0.8 for 42% of the run, where three
quarters of a second leaves one wipeout and 12%, and a third of a second
leaves none and none. Smiting at a lead of one rather than two wipes three of
the seven out by keeping the board empty, which is the old warning holding
good. Roughly: the tree doubles the hand the game asks for, and does not put
it out of reach.

## The tech tree

The whole of it, with the measurements behind every number and what was left
out of Lord of the Swarm's version, is in [`doc/TECH_TREE.md`](doc/TECH_TREE.md).

Both sides research, and neither is told to. It is the one thing on the field
that only goes one way: a run held level is not a run in which nothing
happens, and the hand that kept the two sides level in the first minute is not
the hand that keeps them level in the fifth.

A side is paid for what it holds and for what it kills — a home castle at a
full claim pays a point a second, an outpost its half, a claim being broken
less in proportion exactly as it spawns less, and a fallen enemy pays what its
size says, so a veteran is worth two recruits. What is earned is earned twice
over, into two pools that buy different things and are never traded against
each other, after the two-pool tree in Lord of the Swarm. One is spent a
little at a time on five areas, permanently. The other is saved whole until it
can buy the next power outright, which is what stops a side saving up from
standing still while it saves.

The five areas are how fast a unicorn walks, how fast it swings, how far off
it can pick an enemy out, how far it can reach one, and how fast its castles
turn recruits out. A side works on one at a time and reconsiders every twenty
seconds, moving half the time; what is already in an area stays there, so two
sides come out of a long run good at different things and which things is the
run's own doing. Points go in on a square root, so the first of them are worth
more than the last and a side that has just taken up an area shows for it
within seconds. Three hundred points fills one, which is about two minutes of
a side's whole income — at half that, ten minutes left both sides full in all
five and fighting with identical unicorns, and a tree whose two sides converge
has stopped being one.

They are not equally strong, and no set of numbers would make them so, because
the fight underneath is a knife edge: whoever takes the first castle wins about
nine unattended runs in ten, so *any* standing advantage decides one. Measured
both ways round — one side full in an area, the other in nothing, over fifty
unattended runs each — a side full in creation wins 100%, in swing 96%, in
reach 92%, in pace 78% and in sight 54%. Read those as how sharply each cuts
rather than as how unfair the game is.

Sight is the weak one and honestly so. A fighter takes the *nearest* enemy
within its look, so a longer look never puts a better target in front of it —
it only adds further ones, and what it really buys is a willingness to break
off towards a fight instead of walking on to a castle, which is not how runs
are won. What redeems it is the wizard: a spell is aimed at whatever its
caster can pick out, so sight is what gives a side with capes the reach to use
them. Weak until freeze and worth having after it, which is the one place here
where what to research depends on what has already been learned. Reach is kept
small for a different reason — it is the one of the five that changes what a
fight looks like rather than only how it goes, and two unicorns swinging at
each other from a length apart read as two unicorns missing.

The powers are the god's own hands, which is the point of them: a side that
has watched a whole rainbow's worth of its own frozen and struck down out of a
clear sky works out in the end how it was done. They come in a chain, cheapest
first, and in a played run they land about thirty-six seconds, two minutes and
four minutes in.

- **Freeze**, 45 points. The cape. One recruit in four comes out a wizard, and
  before this there are none at all and the field is horn to horn and nothing
  else.
- **Smite**, 140. A bolt that lands rather than a hold that waits: two and a
  half hit points off a recruit's six.
- **Rage**, 250. Six seconds of swinging twice as fast, cast on one of the
  caster's own rather than at the other side — and the first of the three that
  is worth anything to a side that is losing, the other two both needing an
  enemy in reach where this one needs a friend in a fight.

One wizard, one cooldown, and one rule for choosing. A mark already standing
still is blasted rather than frozen again, a freeze on something that cannot
move being a freeze thrown away — which is what makes two wizards worth more
than twice one, the first holding and the second striking while the held one
never swings back. With nothing helpless in front of it the rage goes on one
of its own that is in a fight, and never on one already roaring, so it
saturates: a rage lasts the best part of two cooldowns, and a wizard is back
to freezing as soon as the fights around it are all roaring. That is why
putting the rage above the freeze does not bury the freeze. Over ten minutes
the mix comes out about 1,460 frosts, 1,110 smites and 270 rages.

A rage burns down whatever the animal is doing, standing frozen included, so
an enemy wizard's frost is the answer to a berserker: held still for a second
and a half is a second and a half less of it. It never stacks either — casting
on one already roaring would only set the clock back — which is why a side's
wizards spread it about instead of piling it on one animal.

All of it is on screen. The panel at the bottom left is a row a side, in that
side's stone: five bars of how far it has got in each area, and the powers it
has bought at the end of the row. A power bought is a white shower over every
castle its side holds, the same one a promotion and a capture get, because the
one thing on the field that says the run just got harder wants saying
somewhere other than a corner. A berserker beats red and its neck is going at
twice the speed. The three spells are three colours of streak: frost blue for
a hold, gold for a bolt, red for a rage.

What the tree does not do is tilt the game. Over two hundred games played to a
finish the sides win 97 and 103, and the side that takes the first castle goes
on to win 87% of them against 90% on the same seeds without the tree — that is
unchanged, and the tree neither rescues a side that has lost the ground nor
runs away with a side that has taken it.

Sound is written as it plays, because there is no room to record any. Every
noise in the game is an oscillator or a burst of white noise through a filter,
and the whole of it — the tune and the field both — is one file, `src/audio.js`,
of about a kilobyte and a half in the zip. Nothing starts until the first
touch: a browser will not let a sound out before a gesture, and the game's
first gesture is the first smite. [`doc/music.md`](doc/music.md) is the whole
of how it works — the graph, every sound's parameters, the scale and how it
bends, and how to record the page and measure what came out.

The music is the readout the rainbow is. It reads the same one number, and it
is bent by it rather than switched between two states: the thirds, sixths and
sevenths of the scale flatten by a fraction of a semitone as `|balance|` grows,
so a board going wrong is heard going wrong before it has gone. Level, there
is a tune — major, two notes in three, and once the board is level enough to
earn the second bow there is a second voice an octave above the first,
appearing on the same 0.08 the bow does, so the reward is heard as well as
seen. Tipped, the melody thins to one note in three, the drone under it swells
and detunes, and a heartbeat comes in beneath that. The drone also gathers on
the side that is winning, which is the side the bow is fading from: sunicorns
are the left of the screen and `balance > 0` is sunicorns ahead, so that is one
more thing on the list of cues that have to move together. Under it all is a
four-bar round in D, and the tempo follows the pace the fight is watched at,
though not one for one — three times the speed is twice the tempo, which is
quick and still a tune. Paused, the music is held at a third rather than
stopped: the field is holding still too, and silence would say the run had
ended.

Everything the field does is placed where it happened. A sound is handed the
same projected triple the sparks are — screen x, screen y, screen size — so it
pans across the picture and quietens with the size the camera gave it, and a
castle falling at the back of the field is a long way off and sounds it. A
gate opening, a horn landing on a horn, a unicorn going down, a mage's frost, a
promotion, a castle taken, a claim broken, and both of the god's hands all have
one, and the god's are the loudest things in the game because they are the only
two that are not on the field. Nothing rations itself, so the whole of it is
capped at eighteen voices in a sixtieth of a second — a tab that was away comes
back and the loop runs three hundred steps in one frame — and blows, which are
the commonest thing that happens by a wide margin, are rationed again to twenty
a second on top of that. The button at the top left that is not a hand turns it
all off.

`f` buys another second of the fight for every second of watching — 2×, then
3×, and up — `s` gives it back a step at a time down to a stop, and space
plays or pauses at whatever pace was last set. The step is fixed, so a run
watched fast is the same run.

One clock runs here. The simulation is a fixed sixtieth of a second a step,
and `state._elapsed` counts those, so it is game time: the clock in the corner
shows it, it runs at whatever pace is set, and it stops when the game does.
The shaders are handed the same number, so the clouds, the rain, the grass and
the manes keep pace with the fight and stop with it. A paused frame is
identical to the one before it, down to the pixel.

A claim being made or broken shows as a bar over the castle, in the colour of
whoever is making it. When one side holds every castle the run is over: the
field stops where it stands, the clock holds at the time it took, and a touch
begins another.

A unicorn that is getting nowhere stands still with its four feet on the
ground, and its legs are driven by the ground it covers rather than the speed
it meant to walk at, so one held up by the crowd stops rather than walking on
the spot. Horn to horn it holds its ground instead of walking at its foe every
step, which is what stopped a fighting pair shuddering every time the crowd
nudged them. A unicorn shoved away from where it was going waits a
step rather than walking straight back into what shoved it, which is what a
crowd pressing the last castle was doing thirteen times a second. A fighter takes the
nearest enemy it can see, every step, unless it is already horn to horn with
one — packed into a crowd it is forever carried away from whatever it first
picked, and walking back across the press to reach that one rather than the
one under its nose is how a fight becomes a crush of animals going past each
other.

Letting a crowd overlap a little and stopping on contact was tried, and it all
but removed the shudder — but crowds packed tight, fights started half as
often, and a game that took a minute took three. Drawing a unicorn a step or
two behind where it stands was tried too, and halved what a dense crowd shows
for nothing at all, but it is a coat of paint over the thing rather than the
thing. Neither is in. `npm run
sim` measures all of it: ground covered against ground gained, how often a
unicorn doubles back, and the worst crowd eight games can throw up — what counts is the ground it covers,
not whether it is trying, because a crowd at a gate walks into the wall and is
pushed back out of it all day. `npm run sim` measures that directly — ground
covered by a crowd that finished where it started, in unicorn-walks — for a
garrison, a siege, and the endgame crowd of forty round the last castle.

A hundred games play out headless in a second, which is how the two sides are
known to be even — 2,463 against 2,537 over five thousand — and how the one
thing that decides a run was found: whoever takes the first castle wins 99 of
every 100.

Next, in order: what ends a run with some ceremony, then whatever class comes
after the mage — the wizard now has three spells but it is still the only
thing on the field that is not a fighter.

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
[build] 12375 / 13312 bytes — 937 free (7.0%)
  esbuild    35924 B
  terser     33831 B  (-6%)
  roadroller 16272 B  (-52%)
  glsl       14425 B  (-72% of 51972 B raw)
```

Roadroller's optimiser searches, so the last two stages move about fifty bytes
either way between builds of identical source. The number above is the worst
of several; treat the free space as the pessimistic figure it is.

## Layout

| | |
|---|---|
| `src/gl.js` | WebGL2 context, programs, uniforms, the fullscreen triangle, instanced quad `Batch` |
| `src/rainbow.js` | three passes: the world (sky, clouds, hills, grass), a castle, the bow — one number in |
| `src/unicorn.js` | one signed-distance unicorn, instanced — draws the herd it is handed, cape, frost, rage and all |
| `src/sparks.js` | instanced dots: the burst a unicorn goes out in, the shower a promotion or a power bought rises in, the streak each of the three spells is drawn as |
| `src/sim.js` | the fight: castles spawn and are captured, fighters cross the field and fight, both sides research as they go, wizards freeze, blast and enrage, balance is who is left |
| `src/audio.js` | every sound, made on the spot: two voices — an oscillator, and noise through a filter — a sound for each thing the field reports, and a tune written as it plays off the balance |
| `doc/music.md` | what that file does and why, in full |
| `scripts/sim_test.js` | the fight headless — unit tests on hand-built situations, then a long run checked for invariants, with a crude player keeping it alive |
| `src/main.js` | boot, fixed-step loop, the page and clock, the panel of what the two sides have learned, god mode, and the depth-ordered draw of herd, castles and bow |
| `src/debug.js` | frame rate under the clock, and the `?b=` and `?off=` URL switches. Never ships |
| `scripts/build.js` | esbuild → shader-minifier-js → terser → Roadroller → zopfli zip, with the budget gate. The page is a skeleton; `main.js` makes the markup so it is packed, not just deflated |
| `scripts/glsl.js` | the shader minifier seam around shader-minifier-js |
| `doc/TECH_TREE.md` | the tech tree: income, the five areas and what each is worth measured, the three powers and the rule that chooses between them, and how to add a fourth |
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
  case in `CASES` if the sweep does not already reach it. A new per-instance
  attribute needs its sample in `INSTANCES` widened to match in the same
  breath: the check reads the stride off the vertex shader, so a sample
  instance left short feeds every shader after it in the buffer somebody
  else's floats. An optimising
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
- **A sound is not verified by reading it.** Levels, panning and whether a
    voice comes out at all are all things a recording answers and nothing else
    does. Two of them were wrong and looked right: the clash measured at a
    fortieth of a spawn because a Q of 6 over 50ms leaves nothing behind, and
    the voice cap was reset by the music tick, so any run of events longer than
    eighteen voices fell silent from the tenth one on — a promotion, a castle
    taken and a claim broken, three in a row, all silent. The cap is a time
    window now, so nothing depends on being called from inside the loop. What
    caught both was recording the shipped `dist/index.html` out of headless
    Chromium: subclass `AudioContext` so `destination` returns a tap, hang a
    `ScriptProcessorNode` off it, drive the page with the mouse, and measure
    peak, RMS and left-against-right per event.
- **Which side fades is a paired decision.** `balance > 0` means sunicorns
  ahead, and sunicorns are the *left* of the screen: the sky glows on the
  left, the clouds roll in on the left, and the bow fades from its left foot.
  Move one of those without the others and the cues contradict each other.

## What is left

- [ ] What ends a run. Losing every castle is the obvious answer and is
      already reachable; nothing acts on it yet.
- [ ] What a mage costs its side, so that a herd stops silting up with
      them, and what it does about something walking in on it, so that it
      stops kiting its pursuer off the field. Both are above, with numbers.
      Having to research the cape delays the first of those by half a minute
      and does not answer it: three in five of the living are still in capes
      after ten minutes, against seven in ten without the tree.
- [ ] A class past the mage — something a side can answer one with. The
      wizard has three spells now, but it is still the only class there is.
- [ ] A fourth power, and a fifth. The chain in `sim.js` is a list of costs
      and a rule for choosing a spell; another is one entry and one case.
- [x] Procedural music, tied to the balance state — melody in while level,
      detuning as it frays. In, with a sound for everything the field
      reports; above, and in full in [`doc/music.md`](doc/music.md).
- [ ] Title, game-over and score, without shipping a font.
- [ ] Mobile: touch is wired, but nothing has been tested on a phone.

## Rules to check before submitting

The zip must be self-contained and play from the filesystem, with no
externally hosted libraries, fonts, or data. Bundled libraries are fine.
Confirm the current wording on how "created during the competition" treats
pre-existing code — none is reused here, but the rule is worth reading rather
than assuming.
