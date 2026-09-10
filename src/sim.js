/**
 * The simulation — the fight the player never commands.
 *
 * Castles spawn fighters. A fighter with no foe seeks the nearest enemy that
 * nobody else has claimed, and the two lock on each other: each is the
 * other's foe until one of them dies. They close, stand horn to horn, and
 * trade damage; the loser is gone and the winner seeks again. With no enemy
 * left to find, a fighter walks to the enemy's castle, which is where
 * capture will happen when there is capture.
 *
 * Positions are in the space the rainbow and the unicorn shader use: x in
 * screen units, y from the front row up to the horizon, and a unicorn's size
 * follows its y. The castles stand at the bow's feet, at FOOT.
 *
 * Balance — the one number the sky, the bow and the castles read — is who
 * has more fighters alive, smoothed so the weather does not flicker with
 * every death.
 */

/** Where the castles stand: the bow's feet. Keep in step with rainbow.js. */
const FOOT = -0.24;
const FOOT_X = 0.6965;

/** The ground band, front row to the horizon, and a unicorn's size across it. */
export const NEAR_Y = -0.44, FAR_Y = 0.15;
const NEAR_S = 0.155, FAR_S = 0.038;

/** Fighters alive at once, both sides together. The batch is sized to it. */
export const MAX = 64;
/** Seconds between a castle's spawns. */
const SPAWN = 2.2;
/** Hit points at the first level, damage per second, walking speed. */
const HP = 6;
const DPS = 1.2, SPEED = 0.22;
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

/**
 * @typedef {object} Unicorn
 * @property {number} _x
 * @property {number} _y
 * @property {number} _s size, from y
 * @property {number} _side 0 sunicorn, 1 rainicorn
 * @property {number} _face +1 looks right, -1 looks left
 * @property {number} _ph gallop phase
 * @property {number} _hp above 0 alive; 0 down to −1 is the half-second it fades out
 * @property {number} _max hit points at its level
 * @property {number} _lvl how many fights it has won its way up
 * @property {number} _scale size multiplier, eased toward its level's
 * @property {number} _fight 0…1, the fighting pose, eased so it does not snap
 * @property {boolean} [_fell] reported to `fallen` already
 * @property {boolean} [_rest] withdrawing to a friendly castle to heal
 * @property {Unicorn|null} _foe
 */

/** @type {Unicorn[]} */
export const herd = [];

/**
 * The castles: where they stand, whose they are (0, 1, or -1 for nobody's),
 * and the time to their next spawn.
 */
export const castles = [
    { _x: -FOOT_X, _y: FOOT, _side: 0, _t: 1 },
    { _x: FOOT_X, _y: FOOT, _side: 1, _t: 1 },
];

/** −1 rainicorns ahead … +1 sunicorns ahead, smoothed. */
export let balance = 0;

/** Who fell this step, for main.js to make sparks of. Drained by the reader. */
export const fallen = [];
/** Who came up a level this step, likewise. */
export const promoted = [];

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sizeAt = (y) => NEAR_S + (FAR_S - NEAR_S) * ((y - NEAR_Y) / (FAR_Y - NEAR_Y));

export function reset() {
    herd.length = 0;
    fallen.length = 0;
    promoted.length = 0;
    balance = 0;
    for (const c of castles) c._t = 1;
}

/**
 * @param {{_x:number,_y:number,_side:number}} castle
 */
function spawn(castle) {
    const y = Math.max(NEAR_Y, castle._y - 0.02 - rnd() * 0.06);
    herd.push({
        _x: castle._x + (rnd() - 0.5) * 0.1,
        _y: y, _s: sizeAt(y) * SCALE0,
        _side: castle._side,
        _face: castle._side ? -1 : 1,
        _ph: rnd() * 6.283,
        _hp: HP,
        _max: HP,
        _lvl: 0,
        _scale: SCALE0,
        _fight: 0,
        _rest: false,
        _foe: null,
    });
}

/**
 * The nearest enemy that is free, or already paired with this one.
 * @param {Unicorn} un
 */
function seek(un) {
    let best = null, bd = Infinity;
    for (const e of herd) {
        // One foe at a time, and nobody hunts a unicorn that has withdrawn.
        if (e._side === un._side || e._hp <= 0 || e._rest || (e._foe && e._foe !== un)) continue;
        const d = (e._x - un._x) ** 2 + (e._y - un._y) ** 2;
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

/**
 * The nearest castle of this unicorn's own side, or null if it has none left.
 * @param {Unicorn} un
 */
function home(un) {
    let best = null, bd = Infinity;
    for (const c of castles) {
        if (c._side !== un._side) continue;
        const d = (c._x - un._x) ** 2 + (c._y - un._y) ** 2;
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}

/**
 * One fixed step.
 * @param {number} dt seconds
 */
export function step(dt) {
    for (const c of castles) {
        if (c._side < 0) continue;
        c._t -= dt;
        if (c._t <= 0 && herd.length < MAX) { spawn(c); c._t = SPAWN; }
    }

    for (const un of herd) {
        if (un._hp <= 0) {
            // Fading out over half a second. The moment it fell it is
            // reported, and whoever it was fighting is free to seek again.
            if (!un._fell) {
                un._fell = true;
                fallen.push(un);
                if (un._foe) {
                    // Whoever it was fighting has won. A winner left under
                    // HURT withdraws to a castle of its own rather than
                    // looking for the next fight.
                    const won = un._foe;
                    won._foe = null;
                    if (won._hp > 0 && won._hp < won._max * HURT) won._rest = true;
                    un._foe = null;
                }
            }
            un._hp -= dt * 2;
            un._fight = Math.max(0, un._fight - dt * 4);
            continue;
        }
        // A unicorn that has withdrawn looks for no fight until it is whole.
        const rest = un._rest ? home(un) : null;
        if (!rest) un._rest = false;
        if (!un._foe && !un._rest) {
            un._foe = seek(un);
            if (un._foe) un._foe._foe = un;
        }
        // Its foe, or the castle it is resting at, or the enemy's castle.
        const goal = un._foe || rest || castles[1 - un._side];
        const dx = goal._x - un._x, dy = goal._y - un._y;
        const d = Math.hypot(dx, dy);
        // Where to stop, and from how close the horns connect: a little
        // further out than the stop, so a pair that eases to a halt at the
        // stop is fighting by the time it gets there.
        const stop = un._foe ? REACH * (un._s + un._foe._s) : rest ? 0.012 : 0.08;
        const fighting = un._foe && d < stop * 1.3;
        // Standing on the castle: four times the healing, and no walking.
        const healing = rest && d <= stop;
        let v = 0;
        if (healing) {
            // Squarely on it, rather than creeping the last hair toward it.
            un._x = goal._x;
            un._y = goal._y;
        } else if (d > stop) {
            v = SPEED * Math.min(1, (d - stop) / 0.05 + 0.15);
            un._x += dx / d * v * dt;
            un._y += dy / d * v * dt;
        }
        // Horn to horn; and out of a fight, healing, four times as fast at home.
        if (fighting) un._foe._hp -= DPS * dt * (0.7 + 0.6 * rnd());
        else un._hp = Math.min(un._max, un._hp + un._max / HEAL * dt * (healing ? 4 : 1));
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
        } else {
            // A walk at rest, a gallop on the move; a lunge a second in a fight.
            un._ph += dt * (fighting ? 6.3 : 2.5 + Math.min(v * 55, 12));
        }
    }

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
    if (best) best._hp = 0;
}
