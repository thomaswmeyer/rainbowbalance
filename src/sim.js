/**
 * The simulation — the fight the player never commands.
 *
 * Castles spawn fighters. A fighter picks the nearest enemy it can see —
 * within LOOK of it, and not already set upon by CROWD others — and closes
 * on it. Targeting is one-way: being picked does not make the target pick
 * back. What makes it mutual is being hit. A unicorn that takes a blow turns
 * on whoever landed it, unless it is already horn to horn with someone else,
 * in which case it finishes that fight first. So a unicorn can be jumped
 * from behind while it is busy, and two can gang up on one, but no more.
 *
 * A fight is a sequence of swings, one a second, at the bottom of the neck's
 * lunge, each of which may miss. That is what keeps two evenly matched
 * unicorns from draining each other smoothly and dying in the same instant.
 *
 * With no enemy in sight a fighter walks toward the nearest castle that is
 * not its own, which is what brings the two sides into contact, and is how a
 * castle changes hands: standing on one is what takes it.
 *
 * Positions are in the space the rainbow and the unicorn shader use: x in
 * screen units, y from the front row up to the horizon, and a unicorn's size
 * follows its y. So does everything else that is a distance on the ground:
 * the field is drawn in perspective, and a castle deep in it is a smaller
 * thing to walk to, to stand on and to hold than one at the front. A castle
 * stands under each foot of the bow, at FOOT, and one stands far up the
 * field between them, which is what gives the fight somewhere to go that is
 * not along a single line.
 *
 * Balance — the one number the sky, the bow and the castles read — is who
 * has more fighters alive, smoothed so the weather does not flicker with
 * every death.
 */

/**
 * Where the two home castles stand: under the bow's feet. Keep in step with
 * rainbow.js, whose bow draws its feet from the same numbers. main.js reads
 * FOOT too, to sort the bow into the depth order at its own feet.
 */
export const FOOT = -0.24;
const FOOT_X = 0.6965;
/**
 * And where the unclaimed one stands: on the middle of the field, most of
 * the way back to the horizon. Both sides walk to it on the diagonal, which
 * is what puts the fight across the whole ground rather than along the one
 * line the bow's feet make.
 */
const MID_Y = 0.02;
/**
 * What the middle castle turns recruits out at, against a home castle's
 * rate. It is an outpost, not a barracks: at a home castle's rate it doubled
 * its holder's spawning, from ground half a field closer to the last castle
 * standing, with both corners of the triangle then marching on the third.
 * A third of the rate is still worth taking — the recruits, the forward
 * ground, and the denying of it — without being a second army.
 *
 * It is not what makes a run end quickly, and the measurement is worth
 * keeping: with the middle spawning nothing at all, a run still ends eight
 * seconds after the middle falls, because a claim takes half a minute of
 * standing on a castle unopposed and by then the field is already won.
 */
const OUTPOST = 1 / 3;

/** The ground band, front row to the horizon, and a unicorn's size across it. */
export const NEAR_Y = -0.44, FAR_Y = 0.15;
const NEAR_S = 0.155, FAR_S = 0.038;

/** Fighters alive at once, both sides together. The batch is sized to it. */
export const MAX = 64;
/** Seconds between a castle's spawns. */
const SPAWN = 2.2;
/** Hit points at the first level, and walking speed in screen units. */
const HP = 6;
const SPEED = 0.22;
/**
 * Veterancy. A unicorn starts at half size and wins its way up: every fight
 * it wins and then walks off to heal from earns it a level. A level adds a
 * quarter of a recruit's size and half a recruit's hit points — added, not
 * compounded, so a veteran of ten fights is three and a half times a
 * recruit rather than nine times one. There is no ceiling.
 */
const SCALE0 = 0.5, GROW = 0.25, TOUGH = 0.5;
/** Out of a fight, a unicorn heals from nothing to full in this many seconds. */
const HEAL = 30;
/** Below this much health, a unicorn that wins a fight withdraws to heal. */
const HURT = 0.5;
/** How close, in the pair's size, two horns have to be to be fighting. */
const REACH = 0.7;
/** How far a unicorn can see an enemy to pick it out. */
const LOOK = 0.4;
/** How many can set upon one unicorn at once. */
const CROWD = 2;
/**
 * The ground a unicorn takes up, in its own lengths: as long as it is, half
 * that deep. Nothing else stands in it — a unicorn that finds one in its way
 * goes around in depth rather than through.
 */
const LONG = 1.25, DEEP = 0.625;
/**
 * How broad a front a column marching on a castle spreads over, in depth.
 * Each fighter walks to a lane of its own a little to one side of the castle
 * rather than at the castle's exact depth: a side that all walked the one
 * line would arrive in single file, and the ground either side of it would
 * go unused. A lane is measured in the castle's own scale, like every other
 * distance on the ground, and half of one is less than CAP_R — so a fighter
 * that has arrived in its lane is standing on the castle whatever depth the
 * castle is at, rather than lining up outside the very claim it came for.
 */
const LANE = 0.2;
/** A swing connects this often, and takes off this much when it does. */
const HIT = 0.65, DMG = 1.5;
/** Radians a second the neck lunges while fighting: one swing a second. */
const LUNGE = 6.2832;
/**
 * Capture, after the planets in Lord of the Swarm. A castle is held by a
 * claim worth CAP points, and what moves that claim is whoever is standing
 * within CAP_R of it: each fighter presses with its size, a recruit counting
 * one and a veteran more, and only the difference between the two sides
 * tells. A castle with as many defenders on it as attackers is held, however
 * big the crowd.
 *
 * Taking one is two jobs, and that is the whole of why it is slow enough to
 * fight over. The claim on a held castle has to be broken first — at nothing
 * the castle belongs to nobody and spawns nothing — and only then can the
 * attackers build a claim of their own back up to full. Breaking is the
 * faster of the two. A raid driven off before its claim is full leaves the
 * castle standing empty for whoever comes back for it.
 */
export const CAP = 20;
const CAP_R = 0.16;
/** Points a recruit adds a second claiming, and takes off a held castle. */
const TAKE = 0.75, BREAK = 1.5;
/**
 * Recruits' worth of pressure past which a crowd does no more. Without it a
 * side that is already winning takes a castle in the second it arrives, and
 * the fight for one is over before it can be fought.
 */
const MOB = 3;

/**
 * @typedef {object} Unicorn
 * @property {number} _x
 * @property {number} _y
 * @property {number} _s size, from y
 * @property {number} _side 0 sunicorn, 1 rainicorn
 * @property {number} _face +1 looks right, -1 looks left
 * @property {number} _ph gallop phase
 * @property {number} _lane its own depth to walk a castle down at, so that a
 *   column marching on one arrives on a front rather than in single file
 * @property {number} _hp above 0 alive; 0 down to −1 is the half-second it fades out
 * @property {number} _max hit points at its level
 * @property {number} _lvl how many fights it has won its way up
 * @property {number} _scale size multiplier, eased toward its level's
 * @property {number} _fight 0…1, the fighting pose, eased so it does not snap
 * @property {boolean} [_fell] reported to `fallen` already
 * @property {boolean} [_rest] withdrawing to a friendly castle to heal
 * @property {Unicorn|null} _foe who it is closing on, one way
 * @property {number} _att how many are closing on it
 * @property {boolean} _eng horn to horn right now, so it will not be drawn off
 * @property {Unicorn|null} _hit who landed a blow on it since its last step
 */

/** @type {Unicorn[]} */
export const herd = [];

/**
 * @typedef {object} Castle
 * @property {number} _x
 * @property {number} _y
 * @property {number} _from whose it is at the start of a run, for reset
 * @property {number} _side whose it is now: 0, 1, or −1 for nobody's
 * @property {number} _cap the claim on it, 0…CAP
 * @property {boolean} _own the claim is full, so it spawns
 * @property {number} _rate how fast it turns recruits out, against a home
 *   castle's rate
 * @property {number} _t seconds to its next spawn
 */

/**
 * The castles: one at each foot of the bow, held from the first frame, and
 * one standing unclaimed far up the field between them for the two sides to
 * meet over.
 * @type {Castle[]}
 */
export const castles = [
    { _x: -FOOT_X, _y: FOOT, _from: 0, _side: 0, _cap: CAP, _own: true, _rate: 1, _t: 1 },
    { _x: 0, _y: MID_Y, _from: -1, _side: -1, _cap: 0, _own: false, _rate: OUTPOST, _t: 1 },
    { _x: FOOT_X, _y: FOOT, _from: 1, _side: 1, _cap: CAP, _own: true, _rate: 1, _t: 1 },
];

/** −1 rainicorns ahead … +1 sunicorns ahead, smoothed. */
export let balance = 0;

/** Who fell this step, for main.js to make sparks of. Drained by the reader. */
export const fallen = [];
/** Who came up a level this step, likewise. */
export const promoted = [];
/** Which castles came up to a full claim this step, likewise. */
export const captured = [];

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/**
 * The tuning, for the headless harness to check itself against. The guard is
 * what keeps it out of the build: esbuild replaces __DEBUG__ with false, so
 * the whole object folds to null and goes. In Node, where nothing defines
 * __DEBUG__ at all, the harness gets the real thing.
 */
export const TUNE = typeof __DEBUG__ === 'undefined' || __DEBUG__
    ? { HP, HURT, HEAL, LOOK, CROWD, LONG, DEEP, HIT, DMG, REACH, MAX, NEAR_Y, FAR_Y,
        SPAWN, SCALE0, CAP, CAP_R, TAKE, BREAK, MOB, LANE, OUTPOST }
    : null;
const sizeAt = (y) => NEAR_S + (FAR_S - NEAR_S) * ((y - NEAR_Y) / (FAR_Y - NEAR_Y));
/**
 * How big anything standing at this depth is against the same thing standing
 * at the bow's feet. Every distance on the ground that is not measured off a
 * unicorn's own size goes through this, or a castle at the horizon would
 * keep the reach and the doorstep of one at the front.
 * @param {number} y
 */
const depthScale = (y) => sizeAt(y) / sizeAt(FOOT);

export function reset() {
    // The same seed every time: a run is reproducible, which is what makes
    // the headless harness worth anything.
    seed = 7;
    herd.length = 0;
    fallen.length = 0;
    promoted.length = 0;
    captured.length = 0;
    balance = 0;
    for (const c of castles) {
        c._side = c._from;
        c._own = c._from >= 0;
        c._cap = c._own ? CAP : 0;
        c._t = 1;
    }
}

/**
 * @param {{_x:number,_y:number,_side:number}} castle
 */
function spawn(castle) {
    // Out of the gate and a little to one side of it, both at the castle's
    // own scale: a castle deep in the field turns its recruits out onto
    // proportionately less ground.
    const n = depthScale(castle._y);
    const y = Math.max(NEAR_Y, castle._y - (0.02 + rnd() * 0.06) * n);
    herd.push({
        _x: castle._x + (rnd() - 0.5) * 0.1 * n,
        _y: y, _s: sizeAt(y) * SCALE0,
        _side: castle._side,
        _face: castle._side ? -1 : 1,
        _ph: rnd() * 6.283,
        _lane: (rnd() - 0.5) * LANE,
        _hp: HP,
        _max: HP,
        _lvl: 0,
        _scale: SCALE0,
        _fight: 0,
        _rest: false,
        _foe: null,
        _att: 0,
        _eng: false,
        _hit: null,
    });
}

/**
 * Point `un` at `foe`, keeping the count of who is closing on whom right.
 * @param {Unicorn} un
 * @param {Unicorn|null} foe
 */
function aim(un, foe) {
    if (un._foe === foe) return;
    // The count is of the living closing on the living, so a claim is only
    // given back if the count actually holds it. Undoing one it never held —
    // a unicorn that fell this step, or one whose target did — left a gap
    // that let a fourth in past a cap of two.
    if (un._foe && un._hp > 0 && un._foe._hp > 0) un._foe._att--;
    un._foe = foe;
    if (foe && un._hp > 0 && foe._hp > 0) foe._att++;
}

/**
 * The nearest enemy within sight that is not already set upon by CROWD.
 * @param {Unicorn} un
 */
function seek(un) {
    let best = null, bd = LOOK * LOOK;
    for (const e of herd) {
        if (e._side === un._side || e._hp <= 0 || e._att >= CROWD) continue;
        const d = (e._x - un._x) ** 2 + (e._y - un._y) ** 2;
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

/**
 * The nearest castle of this unicorn's own side, or null if it has none left.
 * One its side is still working its claim up on is no home: a castle that
 * cannot spawn cannot heal anyone either.
 * @param {Unicorn} un
 */
function home(un) {
    let best = null, bd = Infinity;
    for (const c of castles) {
        if (c._side !== un._side || !c._own) continue;
        const d = (c._x - un._x) ** 2 + (c._y - un._y) ** 2;
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}

/**
 * The nearest castle this unicorn's side does not hold outright — where it
 * goes when there is nothing in sight to fight. An unclaimed one counts, and
 * so does one of its own that the side is still working a claim up on: that
 * is what sends both sides to the middle of the field, and what brings them
 * back to finish a claim they walked away from.
 * @param {Unicorn} un
 */
function foeHome(un) {
    let best = null, bd = Infinity;
    for (const c of castles) {
        if (c._side === un._side && c._own) continue;
        const d = (c._x - un._x) ** 2 + (c._y - un._y) ** 2;
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}

/**
 * The claims on the castles, one step. What moves a claim is who is standing
 * on the castle: each living fighter within CAP_R presses with its size, and
 * only the difference between the two sides counts, so an evenly matched
 * crowd holds everything where it is.
 *
 * A claim held by the other side is broken first and built afterwards — the
 * castle passes through belonging to nobody, where it spawns nothing — so
 * taking one off a side that is still spawning into it is the work of two
 * separate stretches of standing there.
 * @param {number} dt seconds
 */
function capture(dt) {
    for (const c of castles) {
        // What counts as standing on this castle. It shrinks with the
        // castle's depth: one far up the field is a smaller thing to stand
        // on, and its garrison gathers as tight as it looks.
        const r = CAP_R * depthScale(c._y);
        let sun = 0, rain = 0;
        for (const un of herd) {
            if (un._hp <= 0) continue;
            if ((un._x - c._x) ** 2 + (un._y - c._y) ** 2 > r * r) continue;
            // Size is the weight: a veteran presses harder than a recruit,
            // the same way it hits harder.
            const w = un._scale / SCALE0;
            if (un._side) rain += w; else sun += w;
        }
        const lead = sun - rain;
        if (!lead) continue;
        const side = lead > 0 ? 0 : 1, force = Math.min(MOB, Math.abs(lead));
        if (c._side >= 0 && c._side !== side) {
            // Breaking someone else's claim. At nothing the castle is
            // nobody's, and stops spawning until a claim is full again.
            c._cap -= BREAK * force * dt;
            if (c._cap <= 0) { c._cap = 0; c._side = -1; c._own = false; }
        } else {
            // Building one's own: on an unclaimed castle, or back up on one
            // of its own that an enemy left half broken.
            c._side = side;
            c._cap = Math.min(CAP, c._cap + TAKE * force * dt);
            if (c._cap >= CAP && !c._own) {
                c._own = true;
                // The new garrison is not the old one: the wait for the
                // first spawn starts here.
                c._t = SPAWN;
                captured.push(c);
            }
        }
    }
}

/**
 * One fixed step.
 * @param {number} dt seconds
 */
export function step(dt) {
    capture(dt);

    for (const c of castles) {
        if (!c._own) continue;
        // A castle spawns at its own rate, and at the rate of the claim on
        // it besides, so one that is being broken falls quiet a while
        // before it changes hands.
        c._t -= dt * c._rate * c._cap / CAP;
        if (c._t <= 0 && herd.length < MAX) { spawn(c); c._t = SPAWN; }
    }

    // Who is closing on whom, counted afresh: the crowding rule reads it.
    for (const un of herd) un._att = 0;
    for (const un of herd) if (un._hp > 0 && un._foe && un._foe._hp > 0) un._foe._att++;

    for (const un of herd) {
        if (un._hp <= 0) {
            // Fading out over half a second. The moment it fell it is
            // reported, and whoever it was fighting is free to seek again.
            if (!un._fell) {
                un._fell = true;
                fallen.push(un);
                // Everyone who was on it has won and is free. A winner left
                // under HURT withdraws to a castle of its own rather than
                // looking for the next fight.
                for (const w of herd) {
                    if (w._foe !== un) continue;
                    aim(w, null);
                    w._eng = false;
                    if (w._hp > 0 && w._hp < w._max * HURT) w._rest = true;
                }
                aim(un, null);
            }
            un._hp -= dt * 2;
            un._fight = Math.max(0, un._fight - dt * 4);
            continue;
        }
        // A target that has fallen frees it.
        if (un._foe && un._foe._hp <= 0) aim(un, null);

        // Struck: it turns on whoever landed the blow, unless it is already
        // horn to horn with someone, in which case it finishes that fight.
        // Answering a blow ignores the crowding cap — being set upon is not
        // a choice — so a mobbed unicorn can briefly have three on it.
        if (un._hit) {
            if (un._hit._hp > 0 && !un._eng) aim(un, un._hit);
            un._hit = null;
        }

        // A unicorn that has withdrawn looks for no fight until it is whole,
        // but it answers one that comes to it.
        const rest = un._rest ? home(un) : null;
        if (!rest) un._rest = false;
        if (!un._foe && !un._rest) aim(un, seek(un));

        // Its foe, or the castle it is resting at, or the nearest castle its
        // side does not hold. With nothing left to take it walks home.
        const goal = un._foe || rest || foeHome(un) || home(un) || castles[1];
        // How large a thing that is to arrive at. A castle's doorstep, its
        // ground and the lanes across it are all its own size, so one deep in
        // the field is walked closer into and held tighter; a foe is measured
        // off the pair's own sizes instead, which already follow their depth.
        const near = un._foe ? 1 : depthScale(goal._y);
        // Marching on a castle it walks to its own lane, a little to one
        // side of the castle in depth, instead of at the castle's exact
        // depth. Every castle stands far enough inside the band for a lane
        // either side of it, so there is nothing to clamp.
        const march = !un._foe && !rest;
        const dx = goal._x - un._x, dy = goal._y + (march ? un._lane * near : 0) - un._y;
        const d = Math.hypot(dx, dy);
        // Where to stop, and from how close the horns connect: a little
        // further out than the stop, so a pair that eases to a halt at the
        // stop is fighting by the time it gets there.
        const stop = un._foe ? REACH * (un._s + un._foe._s) : (rest ? 0.012 : 0.08) * near;
        // Once horn to horn it takes more than a shove from the crowd to
        // break it off, or the pair spend the fight stepping in and out of
        // range of each other.
        const fighting = un._foe && d < stop * (un._eng ? 1.7 : 1.3);
        // Standing on the castle, unmolested: four times the healing, and no
        // walking. The hold is roomier than the stop so that being shoved
        // aside by another of its own does not send it walking back.
        const healing = rest && !un._foe && d <= 0.07 * near;
        let v = 0;
        if (d > stop) {
            v = SPEED * Math.min(1, (d - stop) / 0.05 + 0.15);
            un._x += dx / d * v * dt;
            un._y += dy / d * v * dt;
        }
        // Shoved aside at the gate, it takes the depth it was shoved to for
        // its own rather than pushing back into the crowd. That is what lets
        // a garrison spread along the wall instead of stacking on the
        // doorstep: what the crowd settles in depth, nobody walks back out.
        if (march && d < stop * 2) un._lane = (un._y - goal._y) / near;
        // Horn to horn; and out of a fight, healing, four times as fast at home.
        un._eng = !!fighting;
        if (!fighting) un._hp = Math.min(un._max, un._hp + un._max / HEAL * dt * (healing ? 4 : 1));
        // Whole again, at a castle it withdrew to: that is a level. It grows
        // into it over the next second and goes back to the fight.
        if (un._rest && un._hp >= un._max) {
            un._rest = false;
            un._lvl++;
            un._max = HP * (1 + TOUGH * un._lvl);
            un._hp = un._max;
            promoted.push(un);
        }
        // A level's worth of size, taken on over a second.
        const scale = SCALE0 * (1 + GROW * un._lvl);
        if (un._scale < scale) un._scale = Math.min(scale, un._scale + SCALE0 * GROW * dt);
        un._s = sizeAt(un._y) * un._scale;
        if (!healing && Math.abs(dx) > 0.01) un._face = dx > 0 ? 1 : -1;
        // The fighting pose plants all four feet, which is also how a unicorn
        // stands while it heals; there the phase winds down to zero instead,
        // so the neck comes up rather than lunging.
        un._fight += ((fighting || healing ? 1 : 0) - un._fight) * Math.min(1, dt * 6);
        if (healing) {
            // The short way round to zero, so the neck does not swing through
            // a whole lunge on the way.
            let ph = un._ph % 6.2832;
            if (ph > 3.1416) ph -= 6.2832;
            un._ph = ph * Math.max(0, 1 - dt * 3);
        } else if (fighting) {
            // The blow lands at the bottom of the lunge, or misses there. A
            // pair spawned with different phases swing out of step, which is
            // most of why they no longer fall together.
            const next = un._ph + dt * LUNGE;
            if (Math.floor(next / 6.2832 - 0.5) > Math.floor(un._ph / 6.2832 - 0.5)
                && rnd() < HIT) {
                // Never past zero in one blow: zero is where the fade
                // starts, and a blow that overshot it took the unicorn out
                // of the herd before anyone noticed it had fallen.
                un._foe._hp = Math.max(0, un._foe._hp - DMG * (0.75 + 0.5 * rnd()));
                un._foe._hit = un;
            }
            un._ph = next;
        } else {
            // A walk at rest, a gallop on the move.
            un._ph += dt * (2.5 + Math.min(v * 55, 12));
        }
    }

    separate();

    // Gone once faded.
    for (let i = herd.length; i--;) if (herd[i]._hp <= -1) herd.splice(i, 1);

    // Back to front, since the draw order is the depth order.
    herd.sort((a, b) => b._y - a._y);

    let sun = 0, rain = 0;
    for (const un of herd) if (un._hp > 0) un._side ? rain++ : sun++;
    const target = (sun - rain) / Math.max(sun + rain, 6);
    balance += (target - balance) * Math.min(1, dt * 1.5);
}

/**
 * Nobody stands in anyone else's ground. The shove is in depth: a unicorn
 * blocked head-on goes around rather than through, which is also the only
 * direction that does not undo the walk it is making. One pinned at the
 * edge of the band pushes the other twice as far, and a pair with no depth
 * left to give gives way sideways.
 */
function separate() {
    // Resolving one pair can push a unicorn into another, so it takes a few
    // sweeps to settle. The last one gives way sideways instead: whatever a
    // crowd could not solve by stepping aside in depth, it solves by
    // spreading out along the field.
    sweep(0); sweep(0); sweep(0); sweep(1);
}

/** @param {number} sideways */
function sweep(sideways) {
    for (let i = 0; i < herd.length; i++) {
        const a = herd[i];
        if (a._hp <= 0) continue;
        for (let j = i + 1; j < herd.length; j++) {
            const b = herd[j];
            if (b._hp <= 0) continue;
            const w = (a._s + b._s) * 0.5;
            const oy = w * DEEP - Math.abs(b._y - a._y);
            if (oy <= 0) continue;
            const ox = w * LONG - Math.abs(b._x - a._x);
            if (ox <= 0) continue;

            if (sideways) {
                // Only for what stepping aside could not solve. A pair that
                // depth has already parted is left alone, or every meeting
                // would end with both of them backing off as well.
                if (oy < w * DEEP * 0.05) continue;
                const sx = b._x === a._x ? (i & 1 ? 1 : -1) : Math.sign(b._x - a._x);
                a._x -= sx * ox * 0.5;
                b._x += sx * ox * 0.5;
                continue;
            }
            // Away from each other in depth; a dead heat breaks on the index.
            const dir = b._y === a._y ? (i & 1 ? 1 : -1) : Math.sign(b._y - a._y);
            let da = -dir * oy * 0.5, db = dir * oy * 0.5;
            // One of them pinned at the edge of the band pushes the other
            // twice as far.
            if (a._y + da < NEAR_Y || a._y + da > FAR_Y) { db -= da; da = 0; }
            if (b._y + db < NEAR_Y || b._y + db > FAR_Y) { da -= db; db = 0; }
            const ay = Math.min(FAR_Y, Math.max(NEAR_Y, a._y + da));
            const by = Math.min(FAR_Y, Math.max(NEAR_Y, b._y + db));
            // What the edge of the band ate, they give way sideways instead.
            // This is what stops a crowd with no depth left to give from
            // standing inside itself.
            const left = oy - Math.abs(by - ay) + Math.abs(b._y - a._y);
            a._y = ay;
            b._y = by;
            a._s = sizeAt(a._y) * a._scale;
            b._s = sizeAt(b._y) * b._scale;
            if (left > 0) {
                const sx = b._x === a._x ? (i & 1 ? 1 : -1) : Math.sign(b._x - a._x);
                const give = Math.min(left / (w * DEEP), 1) * ox * 0.5;
                a._x -= sx * give;
                b._x += sx * give;
            }
        }
    }
}

/**
 * God mode: strike down the unicorn nearest the point, if one is near.
 * @param {number} x in the herd's units
 * @param {number} y
 */
export function smite(x, y) {
    let best = null, bd = 0.02;
    for (const un of herd) {
        if (un._hp <= 0) continue;
        const d = (un._x - x) ** 2 + (un._y - (y + un._s * 0.4)) ** 2;
        if (d < bd) { bd = d; best = un; }
    }
    if (best) best._hp = 0;   // zero, not below: that is where the fade starts
}
