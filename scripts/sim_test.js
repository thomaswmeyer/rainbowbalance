#!/usr/bin/env node
/**
 * The simulation, headless — `npm run sim`.
 *
 * `src/sim.js` imports nothing and draws nothing: it is the whole fight in
 * plain arithmetic, off one seed, so it runs in Node at whatever speed the
 * machine manages and the same seed gives the same run every time. That makes
 * two kinds of test possible that the browser does not.
 *
 * The unit tests build a situation by hand — two unicorns standing in each
 * other, a crowd on one spot, a pair swinging at each other — step it, and
 * say exactly what should have happened. They are the ones that fail loudly
 * when a rule is broken.
 *
 * The end-to-end run plays the game for ten minutes at about a thousand times
 * real speed, checking the invariants every half second and collecting the
 * numbers a design question actually turns on: how long is a fight, how often
 * do two die in the same instant, how far does a side run away with it.
 * It plays the player too, badly: since castles can be taken, a board left to
 * itself is over inside a minute — a side that loses a castle loses the
 * spawns it needed to take one back — and a run that is over measures
 * nothing. So the harness smites the leading side when the board tilts far
 * enough, which is the game's one verb used the way the game asks for it.
 * The stats say how often it had to, and whether a side was wiped out
 * anyway: both are worth watching when the fight is retuned.
 *
 *   npm run sim              # both, with the numbers
 *   npm run sim -- 3600      # a longer end-to-end run
 *   npm run sim -- 600 quiet # pass or fail only, for a hook or CI
 */

import * as sim from '../src/sim.js';

const T = sim.TUNE;
/**
 * How far into each other two are allowed to stand. The simulation lets a
 * crowd touch rather than correcting every hair every step, because a crowd
 * that may touch is a crowd that settles; what it does instead is stop a
 * unicorn walking into whatever is already against it. So these tests ask
 * that nothing stands *well* inside anything, not that nothing touches.
 */
const TOUCH = 0.2;
/**
 * How far into a castle a unicorn stands, as a fraction of the footprint.
 * A castle's walls are walls: the same ground whatever depth it stands at.
 */
function inCastle(u, c) {
    const w = T.CASTLE_W;
    const ex = w + u._s * T.LONG * 0.5, ey = w + u._s * T.DEEP * 0.5;
    const ox = ex - Math.abs(u._x - c._x), oy = ey - Math.abs(u._y - c._y);
    return ox > 0 && oy > 0 ? Math.min(ox / ex, oy / ey) : 0;
}
/**
 * Half the ground the picture shows at this depth. The board opens away from
 * the camera, so a bound across it is not one number but a wedge.
 */
const wideAt = (y) => sim.edgeAt() * y / 0.866;
const STEP = 1 / 60;
const seconds = Number(process.argv[2]) || 600;
const quiet = process.argv.includes('quiet');
/** `npm run sim -- games 100` plays that many out to a finish and counts them. */
const games = process.argv.includes('games')
    ? Number(process.argv[process.argv.indexOf('games') + 1]) || 100 : 0;
/** A game is called drawn after this long, so one that cannot end still ends. */
const LIMIT = 900;

let failed = 0, passed = 0;
const say = (...a) => { if (!quiet) console.log(...a); };

/** @param {string} what @param {boolean} ok @param {string} [detail] */
function ok(what, ok_, detail) {
    if (ok_) { passed++; say(`  ok    ${what}`); }
    else { failed++; console.error(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------------------
// A hand-built situation
// ---------------------------------------------------------------------------

/**
 * Wipe the herd and put exactly these unicorns in it. Everything a unicorn
 * needs that is not given takes a sensible default.
 * @param {Partial<import('../src/sim.js').Unicorn>[]} them
 */
function stage(them) {
    sim.reset();
    for (const t of them) {
        sim.herd.push({
            _x: 0, _y: 18.61, _s: 1.041, _side: 0, _face: 1, _ph: 0, _lane: 0,
            _hp: T.HP, _max: T.HP, _lvl: 0,
            _fight: 0, _rest: false, _foe: null, _att: 0, _eng: false, _hit: null,
            _mage: false, _cast: 0, _held: 0, _block: false,
            ...t,
        });
        // The trailing point starts under it, or it would read as walking
        // out of whatever spot it was staged in.
        const un = sim.herd[sim.herd.length - 1];
        un._px = un._ox = un._x;
        un._py = un._oy = un._y;
    }
    return sim.herd;
}

/**
 * Step n times with the castles holding their spawns, so only the unicorns
 * that were staged are in the experiment. Ownership is left alone: taking it
 * away would change where everyone thinks the enemy is.
 */
function run(n) {
    for (let i = 0; i < n; i++) {
        for (const c of sim.castles) c._t = 1e9;
        sim.step(STEP);
    }
}

/** Step n times with the castles spawning as they would in the game. */
function play(n) {
    for (let i = 0; i < n; i++) sim.step(STEP);
}

/** The castles by where they stand: the sunicorns', the middle, the rainicorns'. */
const [SUN_CASTLE, MID_CASTLE, RAIN_CASTLE] = sim.castles;

/**
 * Put unicorns of one side on a castle, close enough to press their claim.
 * They are spread along the castle's line so that separating them does not
 * shove any of them out of the capture radius.
 * @param {typeof MID_CASTLE} c
 * @param {number} side
 * @param {number} n
 * @param {number} [lvl] veterancy, which is what weighs a claim
 */
const on = (c, side, n, lvl = 0) => Array.from({ length: n }, (_, i) => ({
    _x: c._x + (i - (n - 1) / 2) * 0.03,
    _y: c._y,
    _side: side,
    _lvl: lvl,
    _s: T.BODY * 0.5 * (1 + 0.25 * lvl),
    _hp: 1e6,
    _max: 1e6,
}));

/** How far into each other a pair stands, as a fraction of the footprint. */
function overlap(a, b) {
    const w = (a._s + b._s) * 0.5;
    const ox = w * T.LONG - Math.abs(b._x - a._x);
    const oy = w * T.DEEP - Math.abs(b._y - a._y);
    return ox > 0 && oy > 0 ? Math.min(ox / (w * T.LONG), oy / (w * T.DEEP)) : 0;
}

/** The worst overlap anywhere among the living. */
function worstOverlap(where = sim.herd) {
    const live = where.filter((u) => u._hp > 0);
    let worst = 0, pair = null;
    for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
            const o = overlap(live[i], live[j]);
            if (o > worst) { worst = o; pair = [live[i], live[j]]; }
        }
    }
    return { worst, pair };
}

const show = (u) => `x ${u._x.toFixed(3)} y ${u._y.toFixed(3)} s ${u._s.toFixed(3)}` +
    ` hp ${u._hp.toFixed(2)} side ${u._side}${u._foe ? ' engaged' : ''}${u._rest ? ' resting' : ''}`;

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

function units() {
    say('\n[sim] unit');

    // Two standing in the same place come apart, and apart in depth.
    {
        const [a, b] = stage([{ _x: 0, _y: 18.61 }, { _x: 0, _y: 18.61 }]);
        run(30);
        ok('two in one place come apart', overlap(a, b) < 0.02,
            `${overlap(a, b).toFixed(2)} still overlapping — ${show(a)} / ${show(b)}`);
        ok('and they come apart in depth, not sideways',
            Math.abs(b._y - a._y) > Math.abs(b._x - a._x),
            `dy ${Math.abs(b._y - a._y).toFixed(3)} dx ${Math.abs(b._x - a._x).toFixed(3)}`);
    }

    // One of its own standing in the way is walked around, not through: it
    // is a marching sunicorn and a sunicorn parked in its path. The middle
    // castle is handed to the sunicorns first, or the pair have arrived
    // where they were going before either has to get past the other.
    {
        const [a, b] = stage([
            { _x: -6.447, _y: 18.61, _side: 0 },
            { _x: 0, _y: 18.61, _side: 0 },
        ]);
        MID_CASTLE._side = 0;
        MID_CASTLE._own = true;
        MID_CASTLE._cap = T.CAP;
        const y0 = a._y;
        run(300);
        ok('a unicorn walks around one of its own that is in the way',
            a._x > b._x || Math.abs(a._y - y0) > 0.01,
            `it is still stuck behind it — ${show(a)} / ${show(b)}`);
        ok('and it does not walk through it', overlap(a, b) < TOUCH,
            `${overlap(a, b).toFixed(2)} overlapping`);
    }

    // A crowd on one spot spreads out and stops overlapping. They are stood
    // on their own castle with every castle already theirs, so that they
    // have arrived and this measures the separation rather than twenty
    // unicorns converging on somewhere they are all walking to.
    {
        stage(Array.from({ length: 20 }, (_, i) => ({
            _x: SUN_CASTLE._x + 0.001 * i, _y: SUN_CASTLE._y,
        })));
        for (const c of sim.castles) { c._side = 0; c._own = true; c._cap = T.CAP; }
        run(300);
        const { worst, pair } = worstOverlap();
        ok('a crowd of twenty on one spot comes apart', worst < TOUCH,
            pair ? `${(worst * 100) | 0}% — ${show(pair[0])} / ${show(pair[1])}` : '');
    }

    // Nobody leaves the band, however hard they are shoved.
    {
        stage(Array.from({ length: 30 }, () => ({ _x: 0, _y: T.NEAR_Y })));
        run(120);
        const out = sim.herd.filter((u) => u._y < T.NEAR_Y - 1e-9 || u._y > T.FAR_Y + 1e-9);
        ok('a crowd shoved at the edge stays inside the band', out.length === 0,
            out.length ? `${out.length} outside, worst y ${Math.min(...out.map((u) => u._y)).toFixed(3)}` : '');
    }

    // Swings land some of the time, not all of it. One long fight against
    // something that cannot die, counting the swings: many short runs would
    // replay the same random numbers off the same seed and prove nothing.
    {
        const [a, b] = stage([
            { _x: -0.43, _y: 18.61, _side: 0 },
            { _x: 0.43, _y: 18.61, _side: 1, _hp: 1e9, _max: 1e9 },
        ]);
        a._foe = b;
        let hits = 0, swings = 0, ph = a._ph;
        for (let i = 0; i < 60 * 300; i++) {
            for (const c of sim.castles) c._t = 1e9;
            const hp = b._hp;
            sim.step(STEP);
            if (Math.floor(a._ph / 6.2832 - 0.5) > Math.floor(ph / 6.2832 - 0.5)) swings++;
            ph = a._ph;
            if (b._hp < hp) hits++;
        }
        const rate = hits / Math.max(swings, 1);
        ok('a swing lands sometimes and misses sometimes', hits > 0 && hits < swings,
            `${hits} of ${swings} landed`);
        ok('and it lands about as often as it should',
            Math.abs(rate - T.HIT) < 0.08, `${(rate * 100) | 0}% over ${swings} swings,` +
            ` against ${(T.HIT * 100) | 0}%`);
    }

    // A pair that fight to the death do not both die in the same instant.
    {
        let together = 0, fights = 0;
        for (let k = 0; k < 40; k++) {
            const [a, b] = stage([
                { _x: -0.43, _y: 18.61, _side: 0, _ph: k * 0.7 },
                { _x: 0.43, _y: 18.61, _side: 1, _ph: k * 0.3 + 1 },
            ]);
            a._foe = b; b._foe = a;
            for (let i = 0; i < 60 * 30; i++) {
                sim.step(STEP);
                if (sim.fallen.length) {
                    if (sim.fallen.length > 1) together++;
                    fights++;
                    sim.fallen.length = 0;
                    break;
                }
            }
        }
        ok('a pair fighting to the death rarely fall together', together <= 1,
            `${together} of ${fights} fights ended with both falling in one step`);
    }

    // Anything nearer to fight than what it is walking at, it turns to.
    {
        const [a, far, near] = stage([
            { _x: 0, _y: 18.61, _side: 0 },
            { _x: 6.447, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
            { _x: -1.495, _y: 16.183, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._foe = far; far._att = 1;
        run(2);
        ok('a fighter turns to anything nearer than what it is walking at',
            a._foe === near, 'it kept walking at the far one');
    }
    {
        // But not one already horn to horn: that fight is seen out.
        const [a, b] = stage([
            { _x: 0, _y: 18.61, _side: 0, _hp: 1e6, _max: 1e6 },
            { _x: 0.645, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._foe = b; b._foe = a;
        run(30);                       // long enough to be horn to horn
        sim.herd.push({ ...sim.herd[0], _x: -0.419, _y: 18.156, _side: 1,
            _hp: 1e6, _max: 1e6, _foe: null, _att: 0, _eng: false });
        run(60);
        ok('but not one it is already horn to horn with', a._foe === b,
            'it was drawn off a fight it had joined');
    }
    {
        // Nearest full stop: it takes whichever is closer, by however little.
        const [a, first, other] = stage([
            { _x: 0, _y: 18.61, _side: 0 },
            { _x: 4.298, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
            { _x: -4.083, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._foe = first; first._att = 1;
        run(2);
        ok('and it is the nearer of two, by however little', a._foe === other,
            'it stayed with the one a hair further off');
    }

    // A unicorn that is struck while walking turns on whoever struck it.
    {
        const [a, b, c] = stage([
            { _x: 0, _y: 18.61, _side: 0 },                  // a, minding its own business
            { _x: 10.745, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },  // b, far off, a's target
            { _x: 1.075, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 }, // c, right on top of a
        ]);
        a._foe = b; c._foe = a;
        run(90);
        ok('a unicorn struck while walking turns on whoever struck it', a._foe === c,
            `it is still after ${a._foe === b ? 'its old target' : 'nothing'}`);
    }

    // One already horn to horn finishes that fight before answering another.
    {
        const [a, b, c] = stage([
            { _x: 0, _y: 18.61, _side: 0, _hp: 1e6, _max: 1e6 },
            { _x: 0.645, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
            { _x: -0.645, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._foe = b; b._foe = a; c._foe = a;
        run(180);
        ok('one already horn to horn does not turn to a second attacker', a._foe === b,
            'it was drawn off its fight');
    }

    // No more than the cap choose the same target.
    {
        stage([
            { _x: 0, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
            ...Array.from({ length: 6 }, (_, i) => ({ _x: -0.1 - i * 0.02, _y: -0.35 + i * 0.02, _side: 0 })),
        ]);
        run(60);
        const target = sim.herd[0];
        const on = sim.herd.filter((u) => u._foe === target).length;
        ok('no more than the cap choose one target', on <= T.CROWD,
            `${on} chose it, cap is ${T.CROWD}`);
    }

    // A castle is ground too: nothing stands in one but its own garrison.
    {
        const c = sim.castles[1];
        const [a] = stage([{ _x: c._x, _y: c._y, _side: 0 }]);
        run(60);
        ok('a unicorn is put out of a castle it does not hold', inCastle(a, c) < TOUCH,
            `${(inCastle(a, c) * 100) | 0}% inside it — ${show(a)}`);
    }
    {
        const c = sim.castles[0];
        const [a] = stage([{ _x: c._x, _y: c._y, _side: 0, _rest: true, _hp: 1 }]);
        run(60);
        ok('but its own garrison heals standing on it',
            Math.abs(a._x - c._x) < 0.05 && a._hp > 1, show(a));
    }
    {
        const c = sim.castles[1];
        stage(Array.from({ length: 12 }, (_, i) => ({ _x: c._x + 0.002 * i, _y: c._y, _side: 0 })));
        run(180);
        const worst = Math.max(...sim.herd.map((u) => inCastle(u, c)));
        ok('a crowd driven onto a castle ends up around it', worst < TOUCH,
            `${(worst * 100) | 0}% of one is still inside it`);
    }

    // One that has arrived and stopped stands still, all four feet down.
    {
        const c = sim.castles[0];
        const [a] = stage([{ _x: c._x, _y: c._y - 0.1, _side: 0, _rest: true, _hp: 1 }]);
        run(300);
        const ph = a._ph, y = a._y;
        run(60);
        ok('a unicorn that has arrived stands still', Math.abs(a._ph - ph) < 0.02,
            `its legs are still going: phase moved ${(a._ph - ph).toFixed(3)} in a second`);
        ok('and stands with its feet down, not mid-stride',
            a._fight > 0.9 && Math.abs(a._ph) < 0.05,
            `pose ${a._fight.toFixed(2)}, phase ${a._ph.toFixed(3)}`);
        ok('and it has not wandered off', Math.abs(a._y - y) < 0.01, show(a));
    }
    {
        // One still walking is still walking.
        const [a] = stage([{ _x: -8.596, _y: 14.888, _side: 0 }]);
        run(30);
        const ph = a._ph;
        run(30);
        ok('but one on the move keeps moving its legs', a._ph - ph > 0.5,
            `phase moved only ${(a._ph - ph).toFixed(3)} in half a second`);
    }

    // The ice.
    {
        const [a, b] = stage([
            { _x: 0, _y: 18.61, _side: 0 },
            { _x: 1.075, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._held = T.FREEZE;
        a._block = true;
        const x = a._x, y = a._y, hp = b._hp;
        run(60 * 3);
        ok('a unicorn under the ice does not move', Math.hypot(a._x - x, a._y - y) < 1e-9,
            `it shifted ${Math.hypot(a._x - x, a._y - y).toFixed(4)}`);
        ok('and does not fight back', b._hp === hp, `it took ${(hp - b._hp).toFixed(2)} off its enemy`);
        ok('and is still cut down where it stands', a._hp < T.HP,
            `it took no hurt at all under there`);
    }
    {
        const [a] = stage([{ _x: 0, _y: 18.61, _side: 0 }]);
        a._held = T.FREEZE;
        a._block = true;
        run(60 * (T.FREEZE - 1));
        const still = a._held > 0;
        run(60 * 2);
        ok('and the block melts off it in the time it should',
            still && a._held <= 0, `it had ${a._held.toFixed(1)}s left`);
    }
    {
        // It is in the way while it is under there: whoever meets it goes
        // round, and the block itself does not budge.
        const [a, b] = stage([
            { _x: 0, _y: 18.61, _side: 0 },
            { _x: -4.298, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._held = T.FREEZE;
        a._block = true;
        const x = a._x, y = a._y;
        run(60 * 4);
        ok('and nothing shoves the block aside', Math.hypot(a._x - x, a._y - y) < 1e-9,
            `the block moved ${Math.hypot(a._x - x, a._y - y).toFixed(4)}`);
        ok('and nothing stands inside it', overlap(a, b) < TOUCH,
            `${overlap(a, b).toFixed(2)} overlapping`);
    }

    // A run ends when one side holds the lot.
    {
        stage([]);
        run(1);
        ok('a run with the castles as they start has no winner', sim.winner < 0,
            `side ${sim.winner} has already won it`);
    }
    {
        stage([]);
        for (const c of sim.castles) { c._side = 1; c._own = true; c._cap = T.CAP; }
        run(1);
        ok('a side that holds every castle has won the run', sim.winner === 1,
            `winner came out ${sim.winner}`);
    }
    {
        stage([]);
        for (const c of sim.castles) { c._side = 0; c._own = true; c._cap = T.CAP; }
        run(1);
        // One of them not yet fully claimed is one still being fought for.
        sim.castles[1]._own = false;
        sim.castles[1]._cap = T.CAP * 0.5;
        const won = sim.winner;
        sim.reset();
        run(1);
        ok('holding every castle but one is not winning it', won === 0 && sim.winner < 0,
            `won ${won}, and after a reset ${sim.winner}`);
    }

    // Nothing in sight is nothing to fight.
    {
        const [a] = stage([
            { _x: -12.894, _y: 18.61, _side: 0 },
            { _x: 12.894, _y: 18.61, _side: 1 },
        ]);
        run(1);
        ok('an enemy beyond sight is not a target', a._foe === null,
            `it picked one ${(1.2).toFixed(1)} away, sight is ${T.LOOK}`);
    }

    // The board has sides, and they are the sides of the picture. On the
    // ground they are not parallel: the camera's wedge opens away from it, so
    // the far field is a wider piece of ground than the near one.
    {
        sim.setEdge(16 / 9);
        const deep = 40, shallow = 14;
        const [a, b] = stage([
            { _x: wideAt(deep) + 8, _y: deep, _side: 0 },
            { _x: -wideAt(shallow) - 8, _y: shallow, _side: 0 },
        ]);
        run(1);
        const out = (u) => Math.abs(u._x) + u._s * T.LONG * 0.5 - wideAt(u._y);
        ok('one standing off the board is put back on it',
            out(a) <= 1e-9 && out(b) <= 1e-9,
            `over the edge by ${out(a).toFixed(4)} and ${out(b).toFixed(4)}`);
        ok('and it is the whole animal that is kept on, not its middle',
            Math.abs(a._x) < wideAt(a._y) && Math.abs(b._x) < wideAt(b._y),
            `standing at ${a._x.toFixed(2)} and ${b._x.toFixed(2)},`
            + ` the board being ${wideAt(a._y).toFixed(2)} and ${wideAt(b._y).toFixed(2)} wide there`);
        ok('and the far field is the wider piece of ground',
            wideAt(deep) > wideAt(shallow) * 1.5,
            `${wideAt(deep).toFixed(1)} at ${deep} against ${wideAt(shallow).toFixed(1)} at ${shallow}`);
    }
    {
        // Walking at the edge does not walk off it: one sent after an enemy
        // that is beyond the board stops at the board.
        sim.setEdge(16 / 9);
        const y = 18.61, w = wideAt(y);
        const [a] = stage([
            { _x: w - 1, _y: y, _side: 0 },
            { _x: w + 6, _y: y, _side: 1 },
        ]);
        run(180);
        ok('one walking at the edge is stopped by it',
            Math.abs(a._x) + a._s * T.LONG * 0.5 <= wideAt(a._y) + 1e-9,
            `three seconds of walking put it at ${a._x.toFixed(2)},`
            + ` the board being ${wideAt(a._y).toFixed(2)} wide there`);
    }
    {
        // A crowd shoved along the edge is shoved inwards, not through it.
        sim.setEdge(16 / 9);
        const y = 18.61;
        const them = stage(Array.from({ length: 12 }, () => (
            { _x: wideAt(y) - 0.5, _y: y, _side: 0, _hp: 1e6, _max: 1e6 }
        )));
        run(120);
        const worst = Math.max(...them.map(
            (u) => Math.abs(u._x) + u._s * T.LONG * 0.5 - wideAt(u._y)));
        ok('a crowd pressed on the edge is shoved inwards, not through it',
            worst <= 1e-9, `the furthest out is over by ${worst.toFixed(4)}`);
    }
    {
        // A window narrower than the castles stand does not squeeze the
        // board: the picture shows less of it instead.
        sim.setEdge(9 / 19.5);
        const narrow = sim.edgeAt();
        sim.setEdge(16 / 9);
        const wide = sim.edgeAt();
        // Where the outer wall of a home castle falls on the screen, which is
        // what the floor has to leave room for.
        const [cx, , cw] = sim.project(T.FOOT_X, T.FOOT, T.CASTLE_W);
        const outer = cx + cw;
        ok('a tall window does not squeeze the board narrower than its castles',
            narrow > outer && narrow < wide,
            `a phone gives ${narrow.toFixed(3)}, the castles reach to ${outer.toFixed(3)}`);
    }
}

// ---------------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------------

/**
 * The field has depth, and the rules that make anything of it: a castle far
 * up it, a march that goes up the field rather than across it, a column that
 * arrives on a front, and distances that shrink with depth the way the
 * drawing does.
 */
function field() {
    say('\n[sim] ground');

    // The middle castle is what makes the fight two-dimensional. It stands
    // most of the way up the field, and neither side starts nearer it.
    {
        sim.reset();
        const band = T.FAR_Y - T.NEAR_Y;
        ok('the middle castle stands far up the field',
            MID_CASTLE._y - T.NEAR_Y > band * 0.5,
            `it is ${(MID_CASTLE._y - T.NEAR_Y).toFixed(2)} up a band of ${band.toFixed(2)}`);
        const reach = (c) => Math.hypot(c._x - MID_CASTLE._x, c._y - MID_CASTLE._y);
        ok('and neither side starts nearer to it',
            Math.abs(reach(SUN_CASTLE) - reach(RAIN_CASTLE)) < 1e-9,
            `${reach(SUN_CASTLE).toFixed(3)} against ${reach(RAIN_CASTLE).toFixed(3)}`);
    }

    // Which means a fighter with nothing in sight walks along the field and
    // not only across it. This is the whole point of the unclaimed castles
    // standing where they do: one far up the field, one in the foreground,
    // and a fighter leaving a home castle for either of them crosses ground
    // in both directions.
    {
        const [a] = stage([{ _x: SUN_CASTLE._x, _y: SUN_CASTLE._y, _side: 0 }]);
        const x0 = a._x, y0 = a._y;
        run(60 * 3);
        ok('a fighter with nothing in sight walks along the field, not just across it',
            Math.abs(a._y - y0) > 1 && a._x - x0 > 1,
            `it went ${(a._x - x0).toFixed(3)} across and ${(a._y - y0).toFixed(3)} along`);
    }

    // A column walks to a front rather than in single file: each fighter is
    // given a lane of its own a little to one side of the castle in depth,
    // and marches to that instead of to the castle's exact depth.
    {
        const arrive = (lane) => {
            stage([{ _x: MID_CASTLE._x - 19, _y: MID_CASTLE._y, _side: 0, _lane: lane }])[0];
            run(60 * 5);
            return sim.herd[0]._y - MID_CASTLE._y;
        };
        const deep = arrive(T.LANE / 2), level = arrive(0), shallow = arrive(-T.LANE / 2);
        ok('a fighter marches to a lane of its own, not to the castle\'s exact depth',
            deep > level + 0.4 && shallow < level - 0.4,
            `lanes came out at ${deep.toFixed(3)} / ${level.toFixed(3)} / ${shallow.toFixed(3)}`);
        ok('so a column of them arrives on a front', deep - shallow > 1,
            `only ${(deep - shallow).toFixed(3)} between the outermost two`);
    }

    // The outermost lane is still on the castle: half a lane is inside the
    // reach CAP_R measures, and both are the castle's own size, so that
    // holds at any depth. A fighter that marched to the far edge of the
    // front would otherwise queue up outside the claim it came to press.
    {
        ok('a lane is narrower than the ground a castle is held from',
            T.LANE / 2 < T.CAP_R, `half a lane is ${T.LANE / 2}, the reach ${T.CAP_R}`);
        stage([{ _x: MID_CASTLE._x - 0.4, _y: MID_CASTLE._y, _side: 0, _lane: T.LANE / 2 }]);
        run(60 * 5);
        ok('and a fighter that walked to the outermost one is pressing the claim',
            MID_CASTLE._cap > 0 && MID_CASTLE._side === 0,
            `claim ${MID_CASTLE._cap.toFixed(2)} to side ${MID_CASTLE._side}` +
            `, standing ${Math.hypot(sim.herd[0]._x - MID_CASTLE._x,
                sim.herd[0]._y - MID_CASTLE._y).toFixed(3)} off`);
    }

    // The castles hand the lanes out: recruits out of one gate get different
    // ones, which is what makes a front of a column. The lane is read as
    // each recruit appears, since a lane is not fixed for life — what a
    // fighter is shoved to at a gate it takes for its own.
    {
        stage([]);
        for (const c of sim.castles) c._t = 1e9;
        SUN_CASTLE._t = 0.01;
        const seen = new Set(), lanes = [];
        for (let i = 0; i < 60 * 12; i++) {
            play(1);
            for (const u of sim.herd) if (!seen.has(u)) { seen.add(u); lanes.push(u._lane); }
        }
        ok('a castle turns its recruits out on lanes of their own',
            lanes.length > 2 && new Set(lanes).size === lanes.length
            && lanes.every((l) => Math.abs(l) <= T.LANE / 2),
            `${lanes.length} out of the gate, lanes ${lanes.map((l) => l.toFixed(3)).join(' ')}`);
    }

    // And what the crowd settles at the gate, nobody walks back out of:
    // being shoved aside in depth changes a fighter's mind about its lane.
    {
        // It has to be a castle it is marching on — a fighter standing on one
        // of its own is not walking a lane at all — and it starts on a lane in
        // front of the middle one, so that a shove deeper has band left to be
        // shoved into rather than being stopped by the back of the ground.
        const [a] = stage([{ _x: MID_CASTLE._x, _y: MID_CASTLE._y, _side: 0, _lane: -0.05 }]);
        run(30);
        const shoved = a._y + 0.06;
        a._y = shoved;
        run(60);
        ok('shoved aside at the gate, a fighter holds the depth it was shoved to',
            Math.abs(a._y - shoved) < 0.005,
            `it walked ${(a._y - shoved).toFixed(3)} back into the crowd`);
    }

    // A castle's ground is real ground, the same at every castle. One far up
    // the field is not a smaller thing to stand on; it is the same thing,
    // further off, and only the picture makes it small.
    {
        // Far enough off to press either castle, and near enough to press
        // both. One step, before anyone can walk anywhere.
        const off = T.CAP_R * 0.8;
        stage([{ _x: SUN_CASTLE._x, _y: SUN_CASTLE._y - off, _side: 1 }]);
        run(1);
        const front = SUN_CASTLE._cap;
        stage([{ _x: MID_CASTLE._x, _y: MID_CASTLE._y - off, _side: 1 }]);
        run(1);
        ok('a castle at the feet is pressed from this far off', front < T.CAP,
            `claim still ${front}`);
        ok('and one deep in the field is pressed from exactly as far',
            MID_CASTLE._cap > 0,
            `claim ${MID_CASTLE._cap.toFixed(2)} to side ${MID_CASTLE._side}`);
    }

    // The doorstep goes the same way: a castle is walked up to from the same
    // distance whatever depth it stands at.
    {
        const [a] = stage([{ _x: MID_CASTLE._x + 14, _y: MID_CASTLE._y, _side: 0 }]);
        run(60 * 20);
        const deep = Math.hypot(a._x - MID_CASTLE._x, a._y - MID_CASTLE._y);
        const [b] = stage([{ _x: SUN_CASTLE._x + 8, _y: SUN_CASTLE._y, _side: 1 }]);
        run(60 * 20);
        const front = Math.hypot(b._x - SUN_CASTLE._x, b._y - SUN_CASTLE._y);
        ok('a fighter stands the same distance off a castle at any depth',
            Math.abs(deep - front) < 0.2,
            `${deep.toFixed(3)} deep against ${front.toFixed(3)} at the feet`);
    }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * The castles change hands, and everything about that is a rule worth
 * pinning down: what a claim costs, who presses one, what a castle does
 * while it is being taken, and where a fighter goes because of it.
 */
function capture() {
    say('\n[sim] capture');

    // Nobody's castle, one recruit standing on it. The claim comes up at a
    // known rate, and until it is full the castle is nobody's and spawns
    // nothing.
    {
        stage(on(MID_CASTLE, 0, 1));
        run(60);
        ok('standing on an unclaimed castle claims it',
            MID_CASTLE._side === 0 && MID_CASTLE._cap > 0,
            `side ${MID_CASTLE._side}, claim ${MID_CASTLE._cap.toFixed(2)}`);
        ok('and it spawns nothing while the claim is part made',
            !MID_CASTLE._own, `it is spawning at ${MID_CASTLE._cap.toFixed(1)} of ${T.CAP}`);

        let took = 0;
        while (!MID_CASTLE._own && took < 60 * 120) { run(1); took++; }
        const want = T.CAP / T.TAKE;
        ok('a full claim takes the castle', MID_CASTLE._own && MID_CASTLE._side === 0,
            `still ${MID_CASTLE._cap.toFixed(1)} of ${T.CAP} after ${(took / 60).toFixed(1)}s`);
        ok('and a lone recruit takes as long over it as it should',
            Math.abs(took / 60 - want) < want * 0.1,
            `${(took / 60).toFixed(1)}s against ${want.toFixed(1)}s`);
        ok('a castle taken is reported once', sim.captured.length === 1 && sim.captured[0] === MID_CASTLE,
            `${sim.captured.length} reported`);
    }

    // Only the difference between the two sides tells: an even crowd holds
    // everything where it is, however big it is.
    {
        stage([...on(MID_CASTLE, 0, 3), ...on(MID_CASTLE, 1, 3)]);
        run(60 * 20);
        ok('an even crowd on a castle takes nothing',
            !MID_CASTLE._own && MID_CASTLE._cap < T.CAP * 0.25,
            `claim ${MID_CASTLE._cap.toFixed(1)} of ${T.CAP} to side ${MID_CASTLE._side}`);
    }

    // Size is the weight, so one veteran outpresses one recruit.
    {
        stage([...on(MID_CASTLE, 0, 1, 4), ...on(MID_CASTLE, 1, 1)]);
        run(60 * 10);
        ok('a veteran presses a claim harder than a recruit',
            MID_CASTLE._side === 0 && MID_CASTLE._cap > 1,
            `claim ${MID_CASTLE._cap.toFixed(1)} to side ${MID_CASTLE._side}`);
    }

    // A crowd past the cap does no more than the cap: what a mob buys is a
    // fight it wins, not a castle it takes on arrival.
    {
        stage(on(MID_CASTLE, 0, T.MOB));
        run(60);
        const few = MID_CASTLE._cap;
        stage(on(MID_CASTLE, 0, T.MOB * 3));
        run(60);
        ok('a crowd past the cap presses no harder', Math.abs(MID_CASTLE._cap - few) < 0.05,
            `${T.MOB} pressed ${few.toFixed(2)}, ${T.MOB * 3} pressed ${MID_CASTLE._cap.toFixed(2)}`);
        ok('and the cap is what the tuning says it is',
            Math.abs(few - T.TAKE * T.MOB) < 0.05,
            `${few.toFixed(2)} in a second, against ${(T.TAKE * T.MOB).toFixed(2)}`);
    }

    // Taking a held castle is two jobs: break the claim on it, which leaves
    // it nobody's and silent, and only then build one of your own.
    {
        stage(on(SUN_CASTLE, 1, T.MOB));
        ok('a castle at the start of a run is held and spawning',
            SUN_CASTLE._own && SUN_CASTLE._side === 0 && SUN_CASTLE._cap === T.CAP,
            `side ${SUN_CASTLE._side}, claim ${SUN_CASTLE._cap}`);
        let broke = -1, sideWhenBroken = 99, took = -1;
        for (let i = 0; i < 60 * 60; i++) {
            run(1);
            if (broke < 0 && !SUN_CASTLE._own) { broke = i / 60; sideWhenBroken = SUN_CASTLE._side; }
            if (broke >= 0 && took < 0 && SUN_CASTLE._own) { took = i / 60; break; }
        }
        ok('a held castle is broken before it can be claimed', broke >= 0 && took > broke,
            `broken at ${broke.toFixed(1)}s, taken at ${took.toFixed(1)}s`);
        ok('and while it is broken it is nobody\'s', sideWhenBroken === -1,
            `it went straight to side ${sideWhenBroken}`);
        ok('and then it is the attackers\'', SUN_CASTLE._side === 1 && SUN_CASTLE._own,
            `side ${SUN_CASTLE._side}, claim ${SUN_CASTLE._cap.toFixed(1)}`);
        ok('breaking a claim goes faster than making one', broke < took - broke,
            `${broke.toFixed(1)}s to break, ${(took - broke).toFixed(1)}s to claim`);
    }

    // A castle nobody holds spawns nothing at all, and one that is held
    // spawns at the rate of the claim on it: a castle being broken falls
    // quiet before it changes hands.
    {
        stage([]);
        for (const c of sim.castles) c._t = 1e9;
        SUN_CASTLE._side = -1; SUN_CASTLE._own = false; SUN_CASTLE._cap = 0; SUN_CASTLE._t = 0.01;
        play(60 * 5);
        ok('a castle that is nobody\'s spawns nothing', sim.herd.length === 0,
            `${sim.herd.length} came out of it`);

        stage([]);
        for (const c of sim.castles) c._t = 1e9;
        SUN_CASTLE._t = 0.01;
        play(6);
        ok('and one that is held spawns', sim.herd.length === 1,
            `${sim.herd.length} came out of it`);

        stage([]);
        for (const c of sim.castles) c._t = 1e9;
        SUN_CASTLE._t = 10;
        SUN_CASTLE._cap = T.CAP / 2;
        play(60);
        ok('a castle whose claim is half broken spawns half as fast',
            Math.abs(10 - SUN_CASTLE._t - 0.5) < 0.02,
            `a second took ${(10 - SUN_CASTLE._t).toFixed(3)}s off the spawn`);
    }

    // The middle castle is an outpost, not a barracks. Taking it is worth
    // having — the recruits, the ground half way to the last castle
    // standing, and the denying of it — but at a home castle's rate it
    // would double its holder's spawning as well.
    {
        stage([]);
        for (const c of sim.castles) c._t = 1e9;
        MID_CASTLE._side = 0;
        MID_CASTLE._own = true;
        MID_CASTLE._cap = T.CAP;
        MID_CASTLE._t = SUN_CASTLE._t = 10;
        play(60);
        const outpost = 10 - MID_CASTLE._t, home = 10 - SUN_CASTLE._t;
        // Half a home castle's rate at the outside, and whatever the tuning
        // says besides: the bound is what makes this a test of the rule
        // rather than of the constant agreeing with itself.
        ok('the middle castle turns recruits out slower than a home castle',
            Math.abs(home - 1) < 0.02 && outpost < home
            && Math.abs(outpost - T.OUTPOST) < 0.02,
            `a second took ${outpost.toFixed(3)}s off the middle's spawn` +
            ` against ${home.toFixed(3)}s off a home castle's`);

        // And in recruits, over a minute of it. The whole field is handed to
        // the sunicorns first so that nothing can change hands while they
        // are counted.
        const count = (castle) => {
            stage([]);
            for (const c of sim.castles) { c._side = 0; c._own = true; c._cap = T.CAP; c._t = 1e9; }
            castle._t = 0.01;
            play(60 * 60);
            return sim.herd.length;
        };
        const outposts = count(MID_CASTLE), homes = count(SUN_CASTLE);
        ok('and it turns out about that fraction of the recruits',
            outposts < homes && Math.abs(outposts / homes - T.OUTPOST) < 0.05,
            `${outposts} out of the middle against ${homes} out of a home castle`);
    }

    // Where a fighter with nothing to fight walks: the nearest castle its
    // side does not hold outright, which is what takes both sides to the
    // middle and what brings one back to a claim it left half made.
    {
        const [a] = stage([{ _x: 14, _y: MID_CASTLE._y, _side: 0 }]);
        MID_CASTLE._side = 0; MID_CASTLE._own = false; MID_CASTLE._cap = T.CAP / 2;
        run(60);
        ok('a fighter goes back to finish a claim its side left half made', a._x < 13.9,
            `it walked to ${a._x.toFixed(3)} from 14`);

        const [b] = stage([{ _x: 14, _y: MID_CASTLE._y, _side: 0 }]);
        MID_CASTLE._side = 0; MID_CASTLE._own = true; MID_CASTLE._cap = T.CAP;
        run(60);
        ok('and past one its side holds, to the next one that is not theirs', b._x > 0.31,
            `it walked to ${b._x.toFixed(3)} from 0.300`);
    }

    // A castle that cannot spawn cannot heal anyone either.
    {
        const [a] = stage([{ _x: SUN_CASTLE._x, _y: SUN_CASTLE._y, _side: 0, _hp: 1, _rest: true }]);
        SUN_CASTLE._own = false;
        SUN_CASTLE._cap = 1;
        run(1);
        ok('a castle whose claim is not full is no home to heal at', !a._rest,
            'it settled in to heal at a castle that is not properly its side\'s');
    }

    // A run starts from the same board every time.
    {
        MID_CASTLE._side = 1; MID_CASTLE._own = true; MID_CASTLE._cap = T.CAP;
        SUN_CASTLE._side = -1; SUN_CASTLE._own = false; SUN_CASTLE._cap = 0;
        sim.reset();
        ok('reset puts the castles back the way a run starts',
            SUN_CASTLE._side === 0 && SUN_CASTLE._own && SUN_CASTLE._cap === T.CAP
            && MID_CASTLE._side === -1 && !MID_CASTLE._own && MID_CASTLE._cap === 0
            && RAIN_CASTLE._side === 1 && RAIN_CASTLE._own,
            sim.castles.map((c) => `${c._side}:${c._cap}${c._own ? '*' : ''}`).join(' '));
    }
}

// ---------------------------------------------------------------------------
// Jostling
// ---------------------------------------------------------------------------

/**
 * Ground covered by the whole crowd over a second, in unicorn-walks: one
 * unicorn walking flat out for that second is 1. A crowd that has settled
 * covers almost none. One shoving itself round a castle covers a lot while
 * going nowhere, which is the thing worth catching — it reads on screen as
 * a knot of animals treading water, and no still frame shows it.
 * @param {number} seconds
 */
function ground(seconds, how = run) {
    const was = sim.herd.filter((u) => u._hp > 0).map((u) => ({ u, x: u._x, y: u._y }));
    let path = 0;
    for (let i = 0; i < 60 * seconds; i++) {
        how(1);
        for (const w of was) {
            if (!sim.herd.includes(w.u)) continue;
            path += Math.hypot(w.u._x - w.x, w.u._y - w.y);
            w.x = w.u._x; w.y = w.u._y;
        }
    }
    return path / (T.SPEED * seconds);
}

/** How many of the living are stood squarely rather than walking. */
const standing = () => sim.herd.filter((u) => u._hp > 0 && u._fight > 0.85).length;

/**
 * Step with the herd held wounded, so that a garrison stays a garrison.
 * Healing is a share of a unicorn's own maximum, so handing one a huge
 * maximum to keep it resting heals it in a single frame instead: it levels
 * up and marches off, and what gets measured is twenty unicorns crossing the
 * field rather than twenty standing at a gate.
 * @param {number} n
 */
function wounded(n) {
    for (let i = 0; i < n; i++) {
        for (const u of sim.herd) u._hp = Math.min(u._hp, u._max * 0.3);
        run(1);
    }
}

function jostle() {
    say('\n[sim] jostling');

    // A garrison settles rather than shoving each other round the walls.
    {
        const c = sim.castles[0];
        stage(Array.from({ length: 6 }, (_, i) => ({
            _x: c._x + 1.2 * (i - 2), _y: c._y - 1 + 0.6 * i,
            _side: 0, _rest: true, _hp: 1,
        })));
        wounded(60 * 5);
        const walked = ground(2, wounded);
        ok('a garrison of six settles at its castle', walked < 0.35,
            `they covered ${walked.toFixed(2)} unicorn-walks in two seconds, going nowhere`);
        ok('and every one of them is stood squarely', standing() === 6,
            `${standing()} of 6 are on their feet`);
        // Six will not all fit on the stone; the ones that do not queue at
        // the wall rather than circling it.
        const near = sim.herd.filter((u) => Math.hypot(u._x - c._x, u._y - c._y) < 4).length;
        const on = sim.herd.filter((u) => inCastle(u, c) > TOUCH).length;
        ok('and the garrison gathers at its own castle', near >= 5 && on >= 1,
            `${near} of 6 are at it and ${on} are on the stone itself`);
    }

    // So does a siege, which has a wall in the way instead of a welcome.
    {
        const c = sim.castles[2];
        stage(Array.from({ length: 6 }, (_, i) => ({
            _x: c._x - 0.25 - 0.03 * i, _y: c._y - 0.06 + 0.025 * i, _side: 0,
            _hp: 1e6, _max: 1e6,
        })));
        run(60 * 8);
        const walked = ground(2);
        ok('a siege of six settles at the wall', walked < 0.5,
            `they covered ${walked.toFixed(2)} unicorn-walks in two seconds`);
        const inside = sim.herd.filter((u) => inCastle(u, c) > TOUCH).length;
        ok('and none of them stands well inside the castle', inside === 0,
            `${inside} of 6 are in the walls`);
        const pressing = sim.herd.filter((u) =>
            (u._x - c._x) ** 2 + (u._y - c._y) ** 2 <= T.CAP_R * T.CAP_R).length;
        ok('and enough of them are near enough to press the claim', pressing >= T.MOB,
            `only ${pressing} are inside the reach, and ${T.MOB} is what a claim needs`);
    }

    // Twenty of them, which is a good deal more than the ground round a
    // castle holds. They are a garrison rather than a siege: a siege takes
    // the castle and marches off to the next one, and twenty unicorns
    // crossing the field is not jostling, it is going somewhere.
    {
        const c = sim.castles[0];
        stage(Array.from({ length: 20 }, (_, i) => ({
            _x: c._x + 0.2 - 0.02 * i, _y: c._y - 0.06 + 0.006 * i,
            _side: 0, _rest: true, _hp: 1,
        })));
        wounded(60 * 10);
        const walked = ground(2, wounded);
        ok('twenty at one castle settle rather than milling about', walked < 1.0,
            `they covered ${walked.toFixed(2)} unicorn-walks in two seconds, going nowhere`);
        ok('and nearly all of them are stood squarely', standing() >= 18,
            `${standing()} of 20 are on their feet`);
    }
}

/**
 * With nothing in sight to fight, a unicorn walks to the nearest castle that
 * is not its side's to hold — an enemy's, an unclaimed one, or one of its own
 * whose claim an enemy has broken. That is the whole of how the two sides
 * find each other, and how a castle changes hands.
 */
function marching() {
    say('\n[sim] marching on castles');
    const [SUN, MID, RAIN, NEAR] = sim.castles;
    /** Where a lone sunicorn dropped here walks to. */
    const walksTo = (x, y, set) => {
        stage([{ _x: x, _y: y, _side: 0 }]);
        if (set) set();
        const from = sim.castles.map((c) => Math.hypot(c._x - x, c._y - y));
        run(60 * 6);
        const a = sim.herd[0];
        const to = sim.castles.map((c) => Math.hypot(c._x - a._x, c._y - a._y));
        // Whichever castle it closed the distance on.
        let best = -1, gain = 0.4;
        for (let i = 0; i < to.length; i++) if (from[i] - to[i] > gain) { gain = from[i] - to[i]; best = i; }
        return best;
    };

    /** Hand a castle to the sunicorns outright, so it stops being a target. */
    const held = (...cs) => () => {
        for (const c of cs) { c._side = 0; c._own = true; c._cap = T.CAP; }
    };
    ok('with nothing in sight it walks on an unclaimed castle',
        walksTo(-5, 35) === 1, 'it went somewhere else');
    ok('and on the one in the foreground when that is the nearer',
        walksTo(-4, 17) === 3, 'it walked up the field past the near one');
    ok('and on an enemy castle when that is the nearer',
        walksTo(12, 18, held(MID, NEAR)) === 2, 'it did not make for the enemy castle');
    ok('and on one of its own that an enemy has broken',
        walksTo(-10, 21, () => {
            held(MID, RAIN, NEAR)();
            SUN._own = false; SUN._cap = T.CAP * 0.4;
        }) === 0, 'it left its own half-broken castle alone');
    // Far enough out to have to walk: one already standing at a castle has
    // arrived at it, and standing still is the right thing for it to do.
    // Both of these stand on the line between the two unclaimed castles, so
    // the only thing telling them apart is which is nearer.
    ok('and it is the nearest of them it makes for, not the first',
        walksTo(0, 26) === 3 && walksTo(0, 30) === 1,
        'it walked past a nearer one');
}

/**
 * The end of a run, which is where a crowd is at its worst: one side has all
 * but won and its whole army is stood round the last castle. The claim is
 * held down so the siege cannot end, because what is being measured is the
 * standing about, not the taking.
 * @param {number} n
 */
function siege(n) {
    const c = sim.castles[2];
    stage(Array.from({ length: n }, (_, i) => ({
        _x: c._x - 10 + 0.4 * (i % 5), _y: 14.9 + 0.6 * (i % 7),
        _side: 0, _hp: 1e6, _max: 1e6, _lane: ((i % 5) - 2) * 0.5,
    })));
    const hold = (k) => {
        for (let i = 0; i < k; i++) {
            c._side = 1; c._own = true; c._cap = T.CAP;
            run(1);
        }
    };
    hold(60 * 20);
    return { c, walked: ground(3, hold) };
}

function endgame() {
    say('\n[sim] the last castle');
    for (const n of [10, 20, 40]) {
        const { c, walked } = siege(n);
        const per = walked / n;
        // The bigger the crowd the more of it is still arriving: forty
        // cannot all be inside the reach a castle is held from.
        ok(`${n} besieging the last castle settle round it`, per < 0.2,
            `each covered ${per.toFixed(2)} of a unicorn-walk in three seconds while going nowhere`
            + ` (${walked.toFixed(1)} between them over three seconds)`);
        ok(`and most of the ${n} are stood squarely`, standing() >= n * 0.7,
            `${standing()} of ${n} are on their feet`);
        const inside = sim.herd.filter((u) => inCastle(u, c) > TOUCH).length;
        ok(`and none of the ${n} stands well inside the walls`, inside === 0,
            `${inside} are in the castle`);
    }
}

/**
 * Bouncing: the ground a unicorn covers against the ground it gains, and how
 * often it reverses. A unicorn walking anywhere covers about what it gains
 * and never doubles back. One that keeps walking into something it cannot
 * pass covers ground it does not gain and reverses several times a second,
 * which is what a shuddering herd looks like from the outside. Measured in a
 * game left to run, because it is the crowd around a fight that does it.
 */
function bouncing() {
    say('\n[sim] bouncing');
    // One second of one game is far too noisy a thing to judge a herd on: a
    // fight breaking out or a castle falling inside the window moves these
    // numbers more than any amount of walking does, and a single sample of
    // them swings between 1.0 and 2.5 on the same code. So this is the middle
    // of eighteen of them, off six seeds at three times each.
    const windows = [];
    for (const seed of [1, 3, 5, 7, 11, 13]) {
        for (const at of [30, 45, 60]) {
            sim.reset(seed);
            for (let i = 0; i < 60 * at && sim.winner < 0; i++) sim.step(1 / 60);
            const w = sim.herd.filter((u) => u._hp > 0)
                .map((u) => ({ u, x: u._x, y: u._y, sx: u._x, sy: u._y, path: 0, back: 0, px: 0, py: 0 }));
            if (!w.length) continue;
            for (let i = 0; i < 60; i++) {
                sim.step(1 / 60);
                for (const q of w) {
                    if (!sim.herd.includes(q.u)) continue;
                    const dx = q.u._x - q.x, dy = q.u._y - q.y;
                    q.path += Math.hypot(dx, dy);
                    if (i && dx * q.px + dy * q.py < 0) q.back++;
                    q.px = dx; q.py = dy; q.x = q.u._x; q.y = q.u._y;
                }
            }
            const path = w.reduce((t, q) => t + q.path, 0);
            const net = w.reduce((t, q) => t + Math.hypot(q.u._x - q.sx, q.u._y - q.sy), 0);
            windows.push({ ratio: path / Math.max(net, 1e-9),
                back: w.reduce((t, q) => t + q.back, 0) / w.length });
        }
    }
    const mid = (pick) => {
        const v = windows.map(pick).sort((x, y) => x - y);
        return v[v.length >> 1];
    };
    ok('a herd covers about the ground it gains', mid((q) => q.ratio) < 1.3,
        `it walked ${mid((q) => q.ratio).toFixed(2)} times the ground it got anywhere on`);
    ok('and does not double back on itself several times a second', mid((q) => q.back) < 1.5,
        `each unicorn reversed ${mid((q) => q.back).toFixed(1)} times in a second`);

    // And the worst half-second any of a handful of games can produce, which
    // is a crowd of two dozen pressing the last castle. This is the number
    // that reads as a shuddering herd, and it is here to be driven down: it
    // was thirteen reversals in half a second; it is three, and that is with
    // eight, since a unicorn stopped walking straight back into whatever
    // had just shoved it. A crowd this dense has not stopped moving; what it
    // has stopped doing is moving back and forth.
    let worst = { back: 0 };
    for (const seed of [3, 11, 23, 47, 71, 101, 137, 199]) {
        sim.reset(seed);
        for (let t = 0; t < 300 && sim.winner < 0; t += 1 / 60) {
            sim.step(1 / 60);
            if (Math.round(t * 60) % 60) continue;
            const q = sim.herd.filter((u) => u._hp > 0)
                .map((u) => ({ u, x: u._x, y: u._y, back: 0, px: 0, py: 0 }));
            if (q.length < 8) continue;
            for (let i = 0; i < 30; i++) {
                sim.step(1 / 60); t += 1 / 60;
                for (const r of q) {
                    if (!sim.herd.includes(r.u)) continue;
                    const dx = r.u._x - r.x, dy = r.u._y - r.y;
                    if (i && dx * r.px + dy * r.py < 0) r.back++;
                    r.px = dx; r.py = dy; r.x = r.u._x; r.y = r.u._y;
                }
            }
            const b = q.reduce((a, r) => a + r.back, 0) / q.length;
            if (b > worst.back) worst = { back: b, seed, n: q.length, t: t.toFixed(0) };
        }
    }
    ok('and the worst crowd any of eight games throws up does not shudder',
        worst.back < 10, `${worst.back.toFixed(1)} reversals in half a second,`
        + ` with ${worst.n} alive at ${worst.t}s of seed ${worst.seed}`);
}

// ---------------------------------------------------------------------------
// A hundred games
// ---------------------------------------------------------------------------

/**
 * Play games out, each off its own seed, and say who won them. Nothing
 * interferes: no smiting, no hand on the scales. This is the question of
 * whether the two sides are actually even, which watching one run cannot
 * answer — and everything random in the simulation comes off one seed, so a
 * hundred runs of the same seed would be one run counted a hundred times.
 * @param {number} n
 */
function tournament(n) {
    const wins = [0, 0];
    const times = [[], []];
    const first = [0, 0, 0];
    let draws = 0, held = 0;
    const began = process.hrtime.bigint();
    for (let g = 0; g < n; g++) {
        sim.reset(1 + g * 7919);
        let t = 0, took = -1;
        for (; t < LIMIT && sim.winner < 0; t += STEP) {
            sim.step(STEP);
            if (took < 0 && sim.captured.length) took = sim.captured[0]._side;
            sim.fallen.length = sim.promoted.length = sim.captured.length = 0;
        }
        if (sim.winner < 0) draws++;
        else { wins[sim.winner]++; times[sim.winner].push(t); }
        first[took >= 0 ? took : 2]++;
        if (took >= 0 && took === sim.winner) held++;
    }
    const real = Number(process.hrtime.bigint() - began) / 1e9;
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const all = [...times[0], ...times[1]].sort((a, b) => a - b);
    const played = wins[0] + wins[1];

    ok(`neither side wins every one of ${n} games`, wins[0] > 0 && wins[1] > 0,
        `sunicorns ${wins[0]}, rainicorns ${wins[1]}, drawn ${draws}`);
    // Even-ish is a band, not a point: a hundred fair games land inside
    // 40–60 about nineteen times in twenty, so outside it is worth a look.
    ok('and the two sides win about as often as each other',
        played > 0 && Math.abs(wins[0] - wins[1]) <= 0.2 * played + 2,
        `sunicorns ${wins[0]}, rainicorns ${wins[1]} of ${played} decided`);
    if (quiet) return;
    const row = (k, v) => console.log(`    ${k.padEnd(26)} ${v}`);
    row('sunicorns won', `${wins[0]}`);
    row('rainicorns won', `${wins[1]}`);
    row(`drawn after ${LIMIT}s`, `${draws}`);
    row('first castle taken by', `sunicorns ${first[0]}, rainicorns ${first[1]}, nobody ${first[2]}`);
    row('and that side went on to win', `${held} of ${first[0] + first[1]}` +
        ` (${(held / Math.max(first[0] + first[1], 1) * 100).toFixed(0)}%)`);
    row('mean game', `${mean(all).toFixed(0)}s` +
        ` (sunicorn wins ${mean(times[0]).toFixed(0)}s, rainicorn ${mean(times[1]).toFixed(0)}s)`);
    row('shortest, longest', all.length ? `${all[0].toFixed(0)}s, ${all[all.length - 1].toFixed(0)}s` : '—');
    row('median', all.length ? `${all[all.length >> 1].toFixed(0)}s` : '—');
    row('real time', `${real.toFixed(2)}s for ${n}, ${(real / n * 1000).toFixed(0)}ms a game`);
}

// ---------------------------------------------------------------------------
// The mage
// ---------------------------------------------------------------------------

/**
 * The unicorn in the cape. It fights nothing: it holds off at the length of
 * its spell, freezes what its side is fighting, and gives ground rather than
 * meeting anything that comes through for it. What the tests below are really
 * checking is that none of that leaks into the fighter's rules — a mage takes
 * no melee target, so it uses up nobody's place in a crowd and answers no
 * blow — and that a freeze takes a unicorn out of its fight without taking it
 * off the field.
 */
function mages() {
    say('\n[sim] the mage');

    // One recruit in MAGE_EVERY comes out in a cape, and they are counted
    // rather than rolled, so both sides get the same share of them.
    {
        sim.reset();
        for (let i = 0; i < 60 * 120; i++) {
            for (const c of sim.castles) if (c !== SUN_CASTLE) c._t = 1e9;
            sim.step(STEP);
        }
        const sun = sim.herd.filter((u) => !u._side);
        const capes = sun.filter((u) => u._mage).length;
        ok('a castle turns out one recruit in MAGE_EVERY in a cape',
            capes > 0 && Math.abs(capes / sun.length - 1 / T.MAGE_EVERY) < 0.1,
            `${capes} of ${sun.length} in capes`);
    }

    // A mage walks up to the length of its spell and stops there. A fighter
    // in its place would have closed to horn range. The enemy is locked in a
    // fight of its own so that it stays where it is put: one free to walk
    // into the mage would be answered by the mage backing off, which is the
    // next case rather than this one.
    {
        const [m, e, f] = stage([
            { _x: -10.745, _y: 18.61, _side: 0, _mage: true, _cast: 1e9 },
            { _x: 2.149, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
            { _x: 3.438, _y: 18.61, _side: 0, _hp: 1e6, _max: 1e6 },
        ]);
        e._foe = f;
        f._foe = e;
        run(60 * 12);
        const d = Math.hypot(e._x - m._x, e._y - m._y);
        ok('a mage closes to the length of its spell and no further',
            d > T.KEEP * 0.7 && d < T.CAST,
            `it stood ${d.toFixed(3)} off, for a stand-off of ${T.KEEP}`);
        ok('and it takes no melee target on the way', m._foe === null,
            'it had picked a foe');
    }

    // Something inside the stand-off is backed away from, not met.
    {
        const [m] = stage([
            { _x: 0, _y: 18.61, _side: 0, _mage: true, _cast: 1e9 },
            { _x: 1.289, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        run(30);
        ok('a mage gives ground to what is in its face', m._x < -0.02,
            `it gave ${(-m._x).toFixed(3)}`);
        ok('and takes no part in the fight', m._foe === null && !m._eng);
    }

    // And is run down anyway, being the slower animal. This is the whole of
    // what a mage costs its side, so it is worth a test of its own: a fighter
    // walks at full speed right up to what it is walking to, and if it eased
    // off as it arrived — as it used to — it would settle at the distance
    // where its own speed matched the mage's and follow it off the field for
    // ever without ever reaching it.
    {
        const [m, e] = stage([
            { _x: 0, _y: 18.61, _side: 0, _mage: true, _cast: 1e9 },
            { _x: 6.447, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        run(60 * 6);
        ok('but a fighter runs it down all the same', e._eng,
            `they ended ${Math.hypot(e._x - m._x, e._y - m._y).toFixed(3)} apart`);
        ok('and it has nothing to fight back with', m._hp < T.HP,
            `the mage is on ${m._hp.toFixed(2)} of ${T.HP}`);
    }

    // The spell itself: it lands on the nearest enemy in range, it is
    // reported for the drawing, and it does not come round again until the
    // cooldown is up.
    {
        const [m, near, far] = stage([
            { _x: 0, _y: 18.61, _side: 0, _mage: true, _cast: 0 },
            { _x: T.KEEP, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
            { _x: T.KEEP + 1, _y: 18.61, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        run(1);
        ok('a spell freezes the nearest enemy in range', near._held > 0 && far._held === 0,
            `near ${near._held.toFixed(2)}, far ${far._held.toFixed(2)}`);
        ok('and is reported once, from the horn to what it was aimed at',
            sim.casts.length === 1 && Math.abs(sim.casts[0]._tx - near._x) < 1e-9,
            `${sim.casts.length} cast`);
        sim.casts.length = 0;
        // A whole freeze goes by. Only the one cooldown has come round in it,
        // so only the one spell.
        run(Math.round(60 * T.FREEZE));
        ok('the frost lets go after its time', near._held === 0);
        ok('and the spell comes round no faster than the cooldown',
            sim.casts.length <= Math.ceil(T.FREEZE / T.COOL),
            `${sim.casts.length} casts in ${T.FREEZE}s of a ${T.COOL}s cooldown`);
    }

    // What a freeze is worth: the frozen one cannot swing back, cannot walk,
    // and cannot heal — but it is still there to be hit, which is what keeps
    // a mage from being a way of removing a unicorn from the field.
    {
        const [a, b] = stage([
            { _x: -0.645, _y: 18.61, _side: 0 },
            { _x: 0.645, _y: 18.61, _side: 1, _held: 1e9, _hp: 1e6, _max: 1e6 },
        ]);
        const x0 = b._x, hp0 = a._hp, b0 = b._hp;
        run(60 * 4);
        ok('a frozen unicorn takes its beating and gives none',
            a._hp === hp0 && b._hp < b0,
            `the one swinging is on ${a._hp.toFixed(2)} of ${hp0}, the frozen one took ${(b0 - b._hp).toFixed(2)}`);
        ok('and it does not walk out of it', Math.abs(b._x - x0) < 0.02,
            `it moved ${Math.abs(b._x - x0).toFixed(3)}`);
        ok('but it is still on the field, which a removal would not be',
            sim.herd.includes(b) && b._hp > 0);
    }

    // Nor does it heal under the frost, which is what keeps a freeze from
    // being a rest.
    {
        const [f] = stage([{ _x: 0, _y: 18.61, _side: 0, _hp: T.HP / 2, _held: 1e9 }]);
        run(60 * 5);
        ok('and heals none of it either', f._hp === T.HP / 2,
            `it healed to ${f._hp.toFixed(2)} of ${T.HP}`);
    }

    // A mage answers no blow. A fighter struck from behind turns on whoever
    // struck it; a mage has no fight to turn to, and taking one would put it
    // horn to horn with something that would kill it.
    {
        const [m, e] = stage([
            { _x: 0, _y: 18.61, _side: 0, _mage: true },
            { _x: 1.075, _y: 18.61, _side: 1 },
        ]);
        m._hit = e;
        run(1);
        ok('a mage struck does not turn and fight', m._foe === null);
    }
}

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

/** Everything that has to be true of a running game, whatever state it is in. */
function invariants(t) {
    const live = sim.herd.filter((u) => u._hp > 0);
    const bad = [];
    if (sim.herd.length > T.MAX + 2) bad.push(`herd of ${sim.herd.length}`);
    for (const u of sim.herd) {
        if (!Number.isFinite(u._x + u._y + u._s + u._hp)) bad.push(`NaN: ${show(u)}`);
        else if (u._y < T.NEAR_Y - 1e-6 || u._y > T.FAR_Y + 1e-6) bad.push(`outside the band: ${show(u)}`);
        else if (Math.abs(u._x) + u._s * T.LONG * 0.5 > wideAt(u._y) + 1e-6) bad.push(`off the side of the board: ${show(u)}`);
        if (u._hp > u._max + 1e-6) bad.push(`over its maximum: ${show(u)}`);
        if (u._foe && u._foe._side === u._side) bad.push(`targeting its own side: ${show(u)}`);
        if (u._foe && !sim.herd.includes(u._foe)) bad.push(`targeting something not in the herd: ${show(u)}`);
    }
    for (const u of live) {
        // Answering a blow may break the cap, so the ceiling here is one over.
        const on = live.filter((o) => o._foe === u);
        if (on.length > T.CROWD + 1) {
            bad.push(`${on.length} set upon one: ${show(u)} (att ${u._att})\n` +
                on.map((o) => `          by ${show(o)} eng ${o._eng} rest ${o._rest}`).join('\n'));
        }
    }
    for (const c of sim.castles) {
        if (c._cap < -1e-9 || c._cap > T.CAP + 1e-9) bad.push(`claim of ${c._cap} on a castle`);
        if (c._side < 0 && (c._own || c._cap > 0)) bad.push(`nobody's castle with a claim of ${c._cap}`);
        if (c._own && c._side < 0) bad.push('a castle spawning for nobody');
    }
    if (bad.length) {
        failed++;
        console.error(`  FAIL  at ${t.toFixed(2)}s: ${bad[0]}` +
            (bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''));
    }
    return bad.length === 0;
}

function e2e() {
    say(`\n[sim] end to end — ${seconds}s`);
    sim.reset();
    const st = {
        deaths: 0, together: 0, promotions: 0, worst: 0, broke: 0, taken: 0, smitten: 0, decided: -1,
        capes: 0, casts: 0, frozen: 0, living: 0,
        /** @type {number[]} */ balances: [], /** @type {number[]} */ fights: [],
        /** @type {number[]} */ depth: [], /** @type {number[]} */ across: [],
        /** @type {Map<object, number>} */ since: new Map(),
    };

    for (let n = 0; n * STEP < seconds; n++) {
        const t = n * STEP;
        sim.step(STEP);

        if (sim.fallen.length > 1 && new Set(sim.fallen.map((u) => u._side)).size > 1) st.together++;
        st.deaths += sim.fallen.length;
        st.capes += sim.fallen.filter((u) => u._mage).length;
        sim.fallen.length = 0;
        st.casts += sim.casts.length;
        sim.casts.length = 0;
        st.promotions += sim.promoted.length;
        sim.promoted.length = 0;
        st.taken += sim.captured.length;
        sim.captured.length = 0;

        // The player, every second and a half, and only while one side is two
        // fighters ahead: its best, struck down where it stands. The
        // lightest hand that keeps a run going — heavier holds the board
        // level by keeping it empty, which measures as little as a wipeout
        // does, and lighter lets the run be decided and the rest of it
        // measure nothing.
        if (n % 90 === 0) {
            let sun = 0, rain = 0;
            for (const u of sim.herd) if (u._hp > 0) u._side ? rain++ : sun++;
            // Not in the first seconds, when the board is empty because
            // nothing has spawned yet.
            if (t > 10 && (!sun || !rain) && st.decided < 0) st.decided = t;
            if (Math.abs(sun - rain) >= 2) {
                const side = sun > rain ? 0 : 1;
                let best = null;
                for (const u of sim.herd) {
                    if (u._side === side && u._hp > 0 && (!best || u._lvl > best._lvl)) best = u;
                }
                if (best) {
                    // Through the camera first. The pick is made in the
                    // picture and not on the plain — what a player aims at is
                    // a screen — so the harness has to aim at one too. These
                    // were the herd's own x and y until the world-space
                    // conversion, and every smite since has missed the field
                    // entirely, which is why the run below was one-sided.
                    const [px, py, ps] = sim.project(best._x, best._y, best._s);
                    sim.strike(px, py - ps * 0.4, false);
                    // Counted where it landed, rather than where it was aimed.
                    if (best._hp <= 0) st.smitten++;
                }
            }
        }

        for (const u of sim.herd) {
            if (u._eng && !st.since.has(u)) st.since.set(u, t);
            else if (!u._eng && st.since.has(u)) { st.fights.push(t - st.since.get(u)); st.since.delete(u); }
        }

        if (n % 30 === 0) {
            if (st.broke < 5 && !invariants(t)) st.broke++;
            // How much of the fight a mage is taking out of it at any moment.
            for (const u of sim.herd) {
                if (u._hp <= 0) continue;
                st.living++;
                if (u._held > 0 && !u._block) st.frozen++;
            }
            st.worst = Math.max(st.worst, worstOverlap().worst);
            // How much of the field the fight is actually spread over. The
            // fight used to happen along the line of the bow's feet, and the
            // castle deep in the middle is what took it off that line, so
            // this is the number that says whether it still has.
            const live = sim.herd.filter((u) => u._hp > 0);
            if (live.length > 3) {
                const ys = live.map((u) => u._y), xs = live.map((u) => u._x);
                st.depth.push(Math.max(...ys) - Math.min(...ys));
                st.across.push(Math.max(...xs) - Math.min(...xs));
            }
        }
        if (n % 300 === 0) st.balances.push(sim.balance);
    }
    ok('the invariants held for the whole run', st.broke === 0, `${st.broke} steps broke one`);

    const live = sim.herd.filter((u) => u._hp > 0);
    const sun = live.filter((u) => !u._side).length;
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const pinned = st.balances.filter((b) => Math.abs(b) > 0.8).length;
    if (quiet) return;
    const row = (k, v) => console.log(`    ${k.padEnd(26)} ${v}`);
    row('deaths', st.deaths);
    row('both sides in one step', `${st.together} (${(st.together / Math.max(st.deaths, 1) * 100).toFixed(1)}% of deaths)`);
    row('promotions', st.promotions);
    row('mean fight', `${mean(st.fights).toFixed(2)}s of ${st.fights.length}`);
    row('alive at the end', `${sun} sunicorns v ${live.length - sun} rainicorns`);
    row('top level', Math.max(0, ...live.map((u) => u._lvl)));
    row('balance |b| > 0.8', `${pinned} of ${st.balances.length} samples`);
    row('smitten by the harness', st.smitten);
    row('mages', `${live.filter((u) => u._mage).length} alive, `
        + `${st.capes} of ${st.deaths} deaths`);
    row('spells cast', `${st.casts}, holding ${(st.frozen / Math.max(st.living, 1) * 100).toFixed(1)}%`
        + ' of the living frozen');
    row('castles taken', st.taken);
    row('a side first wiped out', st.decided < 0 ? 'never' : `${st.decided.toFixed(0)}s`);
    row('ground held at once', `${mean(st.depth).toFixed(2)} deep of ${(T.FAR_Y - T.NEAR_Y).toFixed(2)}`
        + `, ${mean(st.across).toFixed(2)} across`);
    row('castles at the end', sim.castles
        .map((c) => (c._side < 0 ? 'nobody' : c._side ? 'rainicorn' : 'sunicorn')
            + (c._own ? '' : ` (claim ${(c._cap / T.CAP * 100) | 0}%)`)).join(', '));
    row('worst overlap seen', `${(st.worst * 100).toFixed(0)}% of a footprint`);
}

// ---------------------------------------------------------------------------

if (games) {
    say(`\n[sim] ${games} games, each to a finish`);
    tournament(games);
    console.log(failed ? `\n[sim] ${failed} failed, ${passed} passed`
        : `\n[sim] all ${passed} passed`);
    process.exit(failed ? 1 : 0);
}

units();
field();
capture();
jostle();
marching();
endgame();
bouncing();
mages();
e2e();
console.log(failed
    ? `\n[sim] ${failed} failed, ${passed} passed`
    : `\n[sim] all ${passed} passed — ${seconds}s of play in ${process.uptime().toFixed(2)}s`);
process.exit(failed ? 1 : 0);
