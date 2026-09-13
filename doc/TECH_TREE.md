# The tech tree

Written 13 September 2026, against `2865070`. Every number in here was
measured rather than estimated: the win rates come from playing the stated
situation out headless the stated number of times, both ways round, and the
byte figures from real builds.

## What it is for

Two swarms fight and the player commands neither. The player's whole job is
keeping them level, and before this went in that job was the same job in the
tenth minute as in the first — a smite every second and a half held a board
indefinitely, and the only thing that changed over a run was how many animals
were on it.

The tree is what makes the job get harder. Both sides research the whole time,
neither is told to, and it is the one thing on the field that only goes one
way: a run held level is not a run in which nothing happens, and the hand that
kept the two sides level in the first minute is not the hand that keeps them
level in the fifth. It is Lord of the Swarm's two-pool tree with the pieces
that suit a two-side game kept and the rest left out — see **What is not here**
at the end.

## Income

`RESEARCH`, `BOUNTY` — `src/sim.js:320`. Paid in `research()` (`:839`) and in
`wound()` (`:880`).

A side is paid for what it holds and for what it kills.

| | |
|---|---|
| a home castle at a full claim | 1 point a second |
| an outpost | half of that, being `OUTPOST` of a home castle in this as in everything else |
| a castle whose claim is being broken | less in proportion — `_cap / CAP`, exactly the factor that also slows its spawning |
| a fallen enemy | 1 point per recruit's worth of it, by size, so a veteran pays two |

Kills are paid where the blow lands rather than in `research()`, because the
blow is the only place that knows who struck it. Both the fighter's swing and
the wizard's bolt go through `wound()`; the player's own hand does not, and so
pays nobody. A smite that fed the side it was meant to hold back would be a
strange thing to hand a player.

What is earned is earned **twice over**, into two pools that buy different
things and are never traded against each other. One is spent on the five areas
a little at a time and permanently; the other is saved whole until it can buy
the next power outright. Keeping them apart is what stops a side that is
saving up from standing still while it saves — the same reason Lord of the
Swarm splits them, and the same 1:1 rate.

## The five areas

`PACE, SWING, SIGHT, HORN, GATE` — `src/sim.js:326`. `GAIN` at `:358`,
`FULL` at `:372`.

A side works on one at a time and reconsiders every `THINK` (20) seconds,
moving `SWAP` (half) of the time. What is already in an area stays there —
nothing is ever taken back out — so two sides come out of a long run good at
different things, and which things is the run's own doing rather than
anybody's plan. An area that fills is left for another at once, in `earn()`,
rather than being poured onto the floor.

Points go in on a square root, so the first are worth more than the last and a
side that has just taken up an area shows for it within seconds:

```
multiplier = 1 + GAIN[area] * sqrt(points / FULL)
```

| Area | Glyph | `GAIN` | At full | Reaches the field at |
|---|---|---|---|---|
| pace | 🏃 | 0.4 | walks 1.4× | `:1111`, the walking speed |
| swing | ⚔️ | 0.25 | swings 1.25× | `:1242`, the lunge — and `:1164`, a wizard's cooldown, a spell being a swing |
| sight | 👁️ | 0.6 | sees 1.6× | `:1027`, how far a fighter picks an enemy out — and `:1041`, how far a spell carries |
| reach | ↔️ | 0.15 | reaches 1.15× | `:1076`, the distance the horns connect at |
| creation | 🏰 | 0.35 | 1.35× the recruits | `:915`, the castle's spawn timer |

`FULL` is 300, which is about two minutes of a side's whole income, so five
areas is a good deal longer than a run. That is the point of the number rather
than a consequence of it: **at 150, ten minutes of play left both sides full in
all five and fighting with identical unicorns**, and a tree whose two sides
converge has stopped being one.

### They are not equally strong

They cannot be. The fight underneath is a knife edge — whoever takes the first
castle wins about nine unattended runs in ten — so *any* standing advantage
decides one. Measured both ways round, one side full in an area and the other
in nothing, fifty unattended runs each (`worth3.js` pattern: give side A the
area, play it out, then give side B the same area and play the same seeds, and
count wins for the side that has it, so the side bias cancels):

| Area at full | Wins | |
|---|---|---|
| creation | 100% | it feeds itself — more recruits, more kills, more castles, and the herd cap of 64 is shared, so a faster gate starves the other side of the board |
| swing | 96% | straight damage |
| reach | 92% | it buys the first blow |
| pace | 78% | |
| sight | 54% | |
| nothing (control) | 50% | the measurement is sound; the seeds are not biased |

Read those as how sharply each cuts, **not** as how unfair the game is. An
unattended run is decided by any asymmetry at all, which is why there is a
player. Lowering the gains does not equalise them: creation still won 78% at a
gain of 0.03, which is a 3% spawn advantage.

### Sight is the weak one, honestly

A fighter takes the *nearest* enemy within its look, so a longer look never
puts a better target in front of it — it only adds further ones. What it
really buys is a willingness to break off towards a fight instead of walking
on to a castle, and that is not how runs are won here. No value of `GAIN`
fixes that: at 1.0 it measured 50%, at 0.5 it measured 44%.

What redeems it is the wizard. A spell is aimed at whatever its caster can
pick out, so `CAST` scales with sight rather than with reach, and sight is
what gives a side with capes the reach to use them: 42% without wizards on the
field, 54% with. Weak until freeze and worth having after it — the one place
in the tree where what to research depends on what has already been learned,
which is the shape Lord of the Swarm gets from excluding `capital_chance`
until a faction has a capital ship.

### Reach is kept small on purpose

It is the one of the five that changes what a fight *looks like* rather than
only how it goes. Two unicorns swinging at each other from a length apart read
as two unicorns missing. 0.15 buys the first blow and stops well short of
that.

## The powers

`COST` — `src/sim.js:399`. Bought in `research()`; the chain is ordered and
cheapest-first, so `_got` (how many a side has) is the whole of which ones it
has.

They are the god's own hands, which is the point of them: a side that has
watched a whole rainbow's worth of its own frozen and struck down out of a
clear sky works out in the end how it was done. In a played run they land at
about 36 seconds, 2 minutes and 4 minutes.

| | Cost | What it buys |
|---|---|---|
| **freeze** ❄️ | 45 | the cape. One recruit in `MAGE_EVERY` comes out a wizard. Before this there are none at all and the field is horn to horn and nothing else |
| **smite** ✨ | 140 | a bolt that lands rather than a hold that waits: `SMITE` (2.5) off a recruit's six |
| **rage** 🔥 | 250 | `RAGE` (6) seconds of swinging `FURY` (2) times as fast, cast on one of the caster's own |

Rage is the first of the three worth anything to a side that is losing: the
other two both need an enemy in reach, and this one needs a friend in a fight.

### One cooldown, one rule

`src/sim.js:1183`. A wizard has one `_cast` timer however many spells it owns,
and chooses between them in this order:

1. **A mark already standing still is blasted**, not frozen again. A freeze on
   something that cannot move is a freeze thrown away — and this is what makes
   two wizards worth more than twice one: the first holds and the second
   strikes, and the held one never swings back. (A wizard that has *only* the
   freeze still wastes that cast, which is the waste the smite is there to
   turn into damage.)
2. **Otherwise the rage**, on the nearest of its own that is horn to horn and
   is not already roaring (`ally()`, `:714`).
3. **Otherwise the frost**, which is what it started with.

Putting the rage above the freeze does not bury the freeze, because the rage
saturates: it lasts the best part of two cooldowns and never stacks, so a
wizard is back to freezing as soon as the fights around it are all roaring.
Over ten minutes the mix comes out about **1,460 frosts, 1,110 smites and 270
rages** — all three in play, and the newest of them the rarest, since it only
exists for the last third of a run.

A rage burns down whatever the animal is doing, standing frozen included, so
an enemy wizard's frost is the answer to a berserker: held still for a second
and a half is a second and a half less of it.

## What it looks like

Everything the tree does is on screen, because a player asked to counter it
and not shown it is being asked to guess.

- **The panel**, bottom left (`src/main.js:199`): a row a side in that side's
  stone — sandstone `#ffcf6b`, obsidian `#b48ce8` — five bars of how far it
  has got in each area, and the powers it has bought at the end of the row.
  The bar is the *effect* (`sqrt(p / FULL)`), not the points; they are not the
  same shape, and what the other side has to live with is the effect. It is
  rewritten only when something on it changes.
- **A power bought** is a white shower over every castle its side holds
  (`src/main.js:72`) — the same one a promotion and a capture get. The one
  thing on the field that says the run just got harder wants saying somewhere
  other than a corner.
- **A berserker** beats red and its neck is going at twice the speed. The tint
  rides the *negative* end of the float the frost is at the positive end of,
  the way `aState.w` already carries the cape on a sign. Frost wins the float
  when a berserker is frozen: an animal that cannot move is the more important
  of the two to show.
- **Three colours of streak**: frost blue for a hold, gold for a bolt, red for
  a rage. `_u` −3, −4, −5 in `sparks.js:155`.

## What it did to the game

### The player's job roughly doubled, and stayed reachable

Seven seeds, 600 seconds each, the harness's smite-the-leader policy at
several strengths:

| The hand | Without the tree | With it |
|---|---|---|
| a smite every 1.50s while 2 ahead | 0/7 wiped out, 33% pinned | **5/7 wiped out, 42% pinned** |
| every 0.75s | 0/7, 0% | 1/7, 12% |
| every 0.33s | 0/7, 0% | 0/7, 0% |
| every 0.33s while **1** ahead | 0/7, 0% | 3/7 — holding the board level by keeping it empty |

("pinned" is the share of samples with `|balance| > 0.8`.) So the tree roughly
doubles the hand the game asks for and does not put it out of reach. The
harness's own hand moved from 1.5s to 0.75s to match, which re-baselines every
end-to-end number in `sim_test.js`; the last row is the old warning about too
heavy a hand holding good.

### It does not tilt the game

Two hundred games played to a finish: the sides win **97 and 103**. The side
that takes the first castle goes on to win **87%** of them, against **90%** on
the same seeds without the tree — unchanged. The tree neither rescues a side
that has lost the ground nor runs away with a side that has taken it.

### It does not fix the mage silting

Worth writing down because it is easy to assume otherwise. Gating the cape
behind research delays the problem by about half a minute and no more: nothing
about a mage dying less often than a fighter has changed. Ten minutes with the
tree ends with 15 of the 24 living in capes; ten minutes without it, played by
the same hand, ends with 37 of 54. Three in five against seven in ten is not a
fix. That question is still open in the README.

## Bytes

The whole tree — simulation, three spells, two shader states, the panel — cost
**830 bytes of zip**, 9,803 → 10,633 of the 13,312 allowed. Roadroller's
packer is stochastic to about ±20 B, so treat the last two digits as noise.

## Adding a fourth power

Two edits, and they are the two the rule was written to keep small:

1. An entry in `COST` (`src/sim.js:399`).
2. A case in the choosing rule (`:1183`), and a `_k` for its streak colour in
   `sparks.js` if it wants one of its own.

Then a case in `techTree()` in `scripts/sim_test.js`, and — if it needs a new
visual state — a case in `CASES` in `scripts/check_shaders.js`, per the
convention in the README. The panel picks up a new glyph from the `POWERS`
array in `main.js` and needs nothing else.

## What is not here

Kept out of Lord of the Swarm's tree deliberately, mostly because it has four
factions and a shipyard where this has two sides and one animal:

- **Exclusive techs** — first to claim locks the other out. With two sides that
  is a coin flip that hands one of them a permanent advantage, which is the
  one thing this game cannot afford.
- **Counter techs** (`requires_opponent`) — worth revisiting once there is a
  class past the wizard for a counter to be about.
- **Tech inheritance on elimination** — this game ends when a side loses every
  castle; there is nothing after it to inherit into.
- **Unit types and weight classes** — this game has fighters and wizards. The
  open question in the README is a third class, and that is where a branch in
  the chain would come from.
- **Per-level scaling** — there are no levels.
