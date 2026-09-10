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
/** Hit points, damage per second, and walking speed in screen units. */
export const HP = 6;
const DPS = 1.2, SPEED = 0.22;
/** Out of a fight, a unicorn heals from nothing to full in this many seconds. */
const HEAL = 30;
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
 * @property {number} _hp
 * @property {number} _fight 0…1, the fighting pose, eased so it does not snap
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

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const sizeAt = (y) => NEAR_S + (FAR_S - NEAR_S) * ((y - NEAR_Y) / (FAR_Y - NEAR_Y));

export function reset() {
    herd.length = 0;
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
        _y: y, _s: sizeAt(y),
        _side: castle._side,
        _face: castle._side ? -1 : 1,
        _ph: rnd() * 6.283,
        _hp: HP,
        _fight: 0,
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
        if (e._side === un._side || (e._foe && e._foe !== un)) continue;
        const d = (e._x - un._x) ** 2 + (e._y - un._y) ** 2;
        if (d < bd) { bd = d; best = e; }
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
        if (un._hp <= 0) continue;
        if (!un._foe || un._foe._hp <= 0) {
            un._foe = seek(un);
            if (un._foe) un._foe._foe = un;
        }
        // Toward the foe, or failing one, the enemy's castle.
        const goal = un._foe || castles[1 - un._side];
        const dx = goal._x - un._x, dy = goal._y - un._y;
        const d = Math.hypot(dx, dy);
        // Where to stop, and from how close the horns connect: a little
        // further out than the stop, so a pair that eases to a halt at the
        // stop is fighting by the time it gets there.
        const stop = un._foe ? REACH * (un._s + un._foe._s) : 0.08;
        const fighting = un._foe && d < stop * 1.3;
        let v = 0;
        if (d > stop) {
            v = SPEED * Math.min(1, (d - stop) / 0.05 + 0.15);
            un._x += dx / d * v * dt;
            un._y += dy / d * v * dt;
            un._s = sizeAt(un._y);
        }
        // Horn to horn; and out of a fight, healing.
        if (fighting) un._foe._hp -= DPS * dt * (0.7 + 0.6 * rnd());
        else un._hp = Math.min(HP, un._hp + HP / HEAL * dt);
        if (Math.abs(dx) > 0.01) un._face = dx > 0 ? 1 : -1;
        // The pose eases into and out of the fight over a quarter second.
        un._fight += ((fighting ? 1 : 0) - un._fight) * Math.min(1, dt * 6);
        // A walk at rest, a gallop on the move; a lunge a second in a fight.
        un._ph += dt * (fighting ? 6.3 : 2.5 + Math.min(v * 55, 12));
    }

    // The fallen. Whoever was fighting them is free to seek again.
    for (let i = herd.length; i--;) {
        if (herd[i]._hp <= 0) {
            const dead = herd[i];
            for (const un of herd) if (un._foe === dead) un._foe = null;
            herd.splice(i, 1);
        }
    }

    // Back to front, since the draw order is the depth order.
    herd.sort((a, b) => b._y - a._y);

    let sun = 0, rain = 0;
    for (const un of herd) un._side ? rain++ : sun++;
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
        const d = (un._x - x) ** 2 + (un._y - (y + un._s * 0.4)) ** 2;
        if (d < bd) { bd = d; best = un; }
    }
    if (best) best._hp = 0;
}
