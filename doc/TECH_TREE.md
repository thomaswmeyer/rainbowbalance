# The tech tree

Written 13 September 2026, against `2865070`, and revised the same day for the
two trees. Every number in here was measured rather than estimated: the win
rates come from playing the stated situation out headless the stated number of
times, both ways round. Where a number was taken against the earlier tree — one
chain of freeze, smite and rage, and five areas with reach among them — and has
not been taken again since, it says so.

## What it is for

Two swarms fight and the player commands neither. The player's whole job is
keeping them level, and before this went in that job was the same job in the
tenth minute as in the first — a strike from the player's hand every second and
a half held a board indefinitely, and the only thing that changed over a run
was how many animals were on it.

The tree is what makes the job get harder. Both sides research the whole time,
neither is told to, and it is the one thing on the field that only goes one
way: a run held level is not a run in which nothing happens, and the hand that
kept the two sides level in the first minute is not the hand that keeps them
level in the fifth. It is Lord of the Swarm's two-pool tree with the pieces
that suit a two-side game kept and the rest left out — see **What is not here**
at the end.

## Income

`RESEARCH`, `BOUNTY` — `src/sim.js:346`. Paid in `research()` (`:906`) and in
`wound()` (`:948`).

A side is paid for what it holds and for what it kills.

| | |
|---|---|
| a home castle at a full claim | 1 point a second |
| an outpost | half of that, being `OUTPOST` of a home castle in this as in everything else |
| a castle whose claim is being broken | less in proportion — `_cap / CAP`, exactly the factor that also slows its spawning |
| a fallen enemy | 1 point per recruit's worth of it, by size, so a veteran pays two |

Kills are paid where the blow lands rather than in `research()`, because the
blow is the only place that knows who struck it. Only the fighter's swing goes
through `wound()` — a wizard does no damage of its own — and the player's hand
does not, and so pays nobody. A strike that fed the side it was meant to hold
back would be a strange thing to hand a player.

What is earned is earned **twice over**, into two pools that buy different
things and are never traded against each other. One is spent on the four areas
a little at a time and permanently; the other is saved whole until it can buy
the next power outright. Keeping them apart is what stops a side that is
saving up from standing still while it saves — the same reason Lord of the
Swarm splits them, and the same 1:1 rate.

## The four areas

`PACE, SWING, SIGHT, GATE` — `src/sim.js:353`. `GAIN` at `:379`,
`FULL` at `:393`.

A side works on one at a time and reconsiders every `THINK` (20) seconds,
moving `SWAP` (half) of the time. What is already in an area stays there —
nothing is ever taken back out — so two sides come out of a long run good at
different things, and which things is the run's own doing rather than
anybody's plan. An area that fills is left for another at once, in `earn()`,
rather than being poured onto the floor. Pace and swing never fill: points
keep going into them past `FULL` on the same square root, so a side can always
learn to walk and to swing faster. Sight and creation stop at `FULL`.

Points go in on a square root, so the first are worth more than the last and a
side that has just taken up an area shows for it within seconds:

```
multiplier = 1 + GAIN[area] * sqrt(points / FULL)
```

| Area | Glyph | `GAIN` | At full | Reaches the field at |
|---|---|---|---|---|
| pace | 🏃 | 0.4 | walks 1.4×, and on past it | `:1175`, the walking speed |
| swing | ⚔️ | 0.25 | swings 1.25×, and on past it | `:1298`, the lunge — and `:1228`, a wizard's cooldown, a spell being a swing |
| sight | 👁️ | 0.6 | sees 1.6× | `:1091`, how far a fighter picks an enemy out — and `:1105`, how far a wizard casts, which is the same distance |
| creation | 🏰 | 0.35 | 1.35× the recruits | `:991`, the castle's spawn timer |

`FULL` is 300, which is about two minutes of a side's whole income, so filling
the areas takes a good deal longer than a run. That is the point of the number
rather than a consequence of it: **at 150, when there were five areas and all
of them filled, ten minutes of play left both sides full in all five and
fighting with identical unicorns**, and a tree whose two sides converge has
stopped being one.

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
| pace | 78% | |
| sight | 54% | |
| nothing (control) | 50% | the measurement is sound; the seeds are not biased |

These were measured against the earlier tree and have not been taken again.

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

What redeems it is the wizard. There is no separate range for a spell: a
wizard casts at the nearest enemy within `LOOK` × sight, the same radius a
fighter picks its targets in, so sight is what gives a side with capes the
reach to use them: 42% without wizards on the field, 54% with. Weak until
freeze and worth having after it — the one place in the tree where what to
research depends on what has already been learned, which is the shape Lord of
the Swarm gets from excluding `capital_chance` until a faction has a capital
ship.

## The powers

`COST`, `TREES` and `sequence()` — `src/sim.js:417`. Bought in `research()`
(`:924`). `_got` is a bit per power, and `COST` is indexed by that bit:
`P_FREEZE` 0, `P_TURNCOAT` 1, `P_STEALTH` 2, `P_BERSERK` 3.

There are **two trees of two**, bought out of the same saved pool:

```
the mage's tree      freeze 45 -> turncoat 250
the fighter's tree   berserk 45 -> stealth 250
```

At reset a coin flip off the seed gives one side the mage's tree to go down
first and the other side the fighter's (`tech[0]._tree` is 0 or 1, and
`tech[1]._tree` the other). A side buys strictly in order — its first tree,
then the other — and takes the next power the moment its saved pool covers it,
never skipping ahead to something cheaper. So both sides can learn all four,
in opposite orders, and for the middle of a run they field different things.

The mage's tree is spells. The fighter's tree is not a spell at all: it is a
side breeding for something, and what it buys arrives in the recruits rather
than in a cape.

All four are the god's own hands, which is the point of them: a side that has
watched a whole rainbow's worth of its own frozen, hidden, maddened and turned
out of a clear sky works out in the end how it was done. When they land in a
played run has not been measured since the two trees went in.

| | Cost | What it buys |
|---|---|---|
| **freeze** ❄️ | 45 | the cape. One recruit in `MAGE_EVERY` (4) comes out a wizard. Before this a side has no wizards at all |
| **turncoat** 🔄 | 250 | a wizard's second spell: an enemy of level 1 or above changes sides and keeps everything it had. The only power that takes an animal off the board without killing it: a side down a fighter and the other up one is worth two of anything else |
| **berserk** 🔥 | 45 | one recruit in `BERSERK_EVERY` (7) comes out of the gate a berserker, swinging `FURY` (2) times as fast and walking `BERSERK_V` (1.5) times as fast for the whole of its life |
| **stealth** 🥷 | 250 | the ninja. One recruit in `NINJA_EVERY` (9) comes out unseen. `seek()` skips it, so nobody ever sets off after it — it is not harder to shove, and half the blows that land on it miss (`EVADE`), but mostly it simply arrives at fights nobody chose to have. Drawn as its own shadow |

A recruit is only ever one of the three. The counts are all of a castle's own
recruits, and where two fall due on the same one the cape comes first, then
the berserker, then the ninja (`spawn()`, `:680`).

### One cooldown, one rule

`src/sim.js:1224`. A wizard has one `_cast` timer, `COOL` (7) seconds, run
down faster by swing. When it comes round, the wizard takes the nearest enemy
within `LOOK` × sight that is not a ninja — the same `seek()` a fighter uses,
without the crowding cap — turns to face it, lowers its neck, and:

1. **Turns it**, if its side has learned the turncoat and the mark is level 1
   or above.
2. **Otherwise freezes it**, for `FROST` (4.8) seconds.

A wizard never levels, so a wizard's turncoat never takes another wizard. A
freeze on a mark that is already held tops the hold back up to `FROST`, or
does nothing if the player's ice has longer than that to run: a hold is never
cut short by a shorter one.

There is no spell that harms and no spell cast on a friend. A berserker comes
only out of the gate or from the player's hand, and never calms down, so the
other side's frost is the answer to one: held still for 4.8 seconds is 4.8
seconds less of it.

## The god's five hands, and what they cost

`HANDS`, `HAND_MAX`, `HAND_SECS`, `HAND_POWER` — `src/main.js`. Spent in
`smite()`, filled in the frame loop, painted by `paintHands()`.

The player used to have two hands and infinite use of both, which made the
whole job a question of reaction rather than of choice. They are rationed now,
after Lord of the Swarm's per-power charge counters — no shared pool, no global
lockout, one independent counter each.

| Hand | Held | One back every | What it does |
|---|---|---|---|
| sparklify ✨ | 3 | 1.5s | strikes a unicorn down |
| freeze ❄️ | 3 | 5s | a block of ice for `FREEZE` seconds |
| stealth 🥷 | 2 | 12s | unseen and evading half the blows that land, for the life of the animal |
| berserk 🔥 | 2 | 12s | swinging twice as fast and walking half again as fast, for the life of the animal |
| turncoat 🔄 | 1 | 20s | changes its side, keeping everything |

A hand only appears once **either side** has learned its power: freeze with
freeze, stealth with stealth, berserk with berserk, turncoat with turncoat.
The row grows with the run, and a new run starts it over. When one appears a
banner across the top of the screen says so — "Stealth Power Unlocked!" — for
a couple of seconds, and the hand's own sound plays, so the player hears what
it is before first reaching for it. Sparklify is always there, since a run
starts before anyone has learned anything and it is the one intervention the
balance was tuned against.

A charge is **a float**, and that one number is the whole of the state: its
whole part is how many uses are in hand, the number at the bottom right of the
button, and its fraction is how far along the
next one is, which is the bar across the foot of the button. A hand under a
whole charge is dimmed and does nothing.

Sparklify is deliberately the metronome, and deliberately the only one always
about to be available. One charge every 1.5 seconds, up to three held, is the hand the
tree was measured against in the table further down, less the store, so a player who has spent
everything else still has the one intervention the balance depends on. The
rest are scarce in proportion to how permanent they are: the freeze wears off
in twenty seconds, and the last three never wear off at all.

A hand that finds nothing is not spent. The charge is for what it did, not for
the gesture, so a miss costs only the moment.

They fill on the **game's** clock rather than the wall's, so pausing pauses
them and running at speed fills them at speed. The same second of play costs
the same second of recharge however it is watched.

## What it looks like

Everything the tree does is on screen, because a player asked to counter it
and not shown it is being asked to guess.

- **The panels** ship in the release build, the sunicorns' bottom left and the
  rainicorns' bottom right (`src/main.js`): one a side in that side's
  claim-bar colour — yellow `#ffd61f`, blue `#387aff` — with four bars of how
  far it has got in each area, and the powers it has bought on the inside of
  the bars in the order it bought them, so the sunicorns' read left to right
  and the rainicorns' right to left. The bar is the *effect*
  (`sqrt(p / FULL)`), not the points; they are not the same shape, and what
  the other side has to live with is the effect. It is rewritten only when
  something on it changes.
- **A power bought** is a white shower over every castle its side holds
  (`src/main.js:109`) — the same one a promotion and a capture get. The one
  thing on the field that says the run just got harder wants saying somewhere
  other than a corner.
- **A berserker** beats red and its neck is going at twice the speed. The tint
  rides the negative end of a float of its own, the way `aState.w` already
  carries the cape on a sign. A frozen berserker shows only the ice: an animal
  that cannot move is the more important of the two to show.
- **Two colours of line**, each drawn from the caster's horn to its mark and
  left to fade where it is, since nothing about a spell travels: frost blue
  for a hold, purple for a turncoat. `_u` −3 and −4 in `sparks.js`. Each spell
  has its own sound too, and so does each of the player's hands.

## What it did to the game

Everything in this section was measured against the earlier tree, and none of
it has been measured again since the two trees went in. It is kept because it
is the last measurement there is, not because it is known still to hold.

### The player's job roughly doubled, and stayed reachable

Seven seeds, 600 seconds each, the harness's strike-the-leader policy at
several strengths:

| The hand | Without the tree | With it |
|---|---|---|
| a strike every 1.50s while 2 ahead | 0/7 wiped out, 33% pinned | **5/7 wiped out, 42% pinned** |
| every 0.75s | 0/7, 0% | 1/7, 12% |
| every 0.33s | 0/7, 0% | 0/7, 0% |
| every 0.33s while **1** ahead | 0/7, 0% | 3/7 — holding the board level by keeping it empty |

("pinned" is the share of samples with `|balance| > 0.8`.) So the tree roughly
doubled the hand the game asks for and did not put it out of reach. The
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
fix. With the two trees, one side now reaches the cape later than the other,
which has not been measured either. That question is still open in the README.

## Bytes

What the tree costs in the zip has not been measured since the two trees went
in, and the research panels now ship as well. The figure taken for the
earlier tree no longer describes what is built.

## Adding a power

Every power is a bit, and the edits follow it:

1. A `P_` constant, an entry in `COST`, and a place in one of the `TREES`
   (`src/sim.js:417`). `sequence()` and the buying in `research()` take it
   from there.
2. What it does: a case in the wizard's rule (`:1233`), with a `_k` for its
   line colour in `sparks.js` and its sound in `cast()` in `audio.js`; or a
   share of the recruits in `spawn()` (`:680`).
3. A glyph in the `POWERS` array in `main.js`, which is indexed by the same
   bit, and the panels need nothing else. If the player is to have it as a
   hand as well, an entry in each of `HANDS`, `HAND_MAX`, `HAND_SECS`,
   `HAND_POWER` and `HAND_NAME`, a case in `strike()` in `sim.js`, and a sound
   in `hand()` in `audio.js`.

Then a case in `techTree()` in `scripts/sim_test.js`, and — if it needs a new
visual state — a case in `CASES` in `scripts/check_shaders.js`, per the
convention in the README.

## What is not here

Kept out of Lord of the Swarm's tree deliberately, mostly because it has four
factions and a shipyard where this has two sides and one animal:

- **Exclusive techs** — first to claim locks the other out. With two sides that
  is a coin flip that hands one of them a permanent advantage, which is the
  one thing this game cannot afford. The coin flip at the start of a run is
  not that: it decides only which tree a side goes down first, and both sides
  can learn all four.
- **Counter techs** (`requires_opponent`) — worth revisiting once there is a
  class past the wizard for a counter to be about.
- **Tech inheritance on elimination** — this game ends when a side loses every
  castle; there is nothing after it to inherit into.
- **Unit types and weight classes** — this game has fighters and wizards, and
  the berserkers and ninjas bred out of the gate are fighters with one thing
  changed. The open question in the README is a third class, and that is where
  a third tree would come from.
- **Per-level scaling** — there are no levels.
