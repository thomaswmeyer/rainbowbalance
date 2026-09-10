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
 *
 *   npm run sim              # both, with the numbers
 *   npm run sim -- 3600      # a longer end-to-end run
 *   npm run sim -- 600 quiet # pass or fail only, for a hook or CI
 */

import * as sim from '../src/sim.js';

const T = sim.TUNE;
const STEP = 1 / 60;
const seconds = Number(process.argv[2]) || 600;
const quiet = process.argv.includes('quiet');

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
            _x: 0, _y: -0.2, _s: 0.06, _side: 0, _face: 1, _ph: 0,
            _hp: T.HP, _max: T.HP, _lvl: 0, _scale: 0.5,
            _fight: 0, _rest: false, _foe: null, _att: 0, _eng: false, _hit: null,
            ...t,
        });
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
        const [a, b] = stage([{ _x: 0, _y: -0.2 }, { _x: 0, _y: -0.2 }]);
        run(30);
        ok('two in one place come apart', overlap(a, b) < 0.02,
            `${overlap(a, b).toFixed(2)} still overlapping — ${show(a)} / ${show(b)}`);
        ok('and they come apart in depth, not sideways',
            Math.abs(b._y - a._y) > Math.abs(b._x - a._x),
            `dy ${Math.abs(b._y - a._y).toFixed(3)} dx ${Math.abs(b._x - a._x).toFixed(3)}`);
    }

    // One of its own standing in the way is walked around, not through: it
    // is a marching sunicorn and a sunicorn parked in its path.
    {
        const [a, b] = stage([
            { _x: -0.3, _y: -0.2, _side: 0 },
            { _x: 0.0, _y: -0.2, _side: 0 },
        ]);
        const y0 = a._y;
        run(300);
        ok('a unicorn walks around one of its own that is in the way',
            a._x > b._x || Math.abs(a._y - y0) > 0.01,
            `it is still stuck behind it — ${show(a)} / ${show(b)}`);
        ok('and it does not walk through it', overlap(a, b) < 0.02,
            `${overlap(a, b).toFixed(2)} overlapping`);
    }

    // A crowd on one spot spreads out and stops overlapping.
    {
        stage(Array.from({ length: 20 }, (_, i) => ({ _x: 0.001 * i, _y: -0.2 })));
        run(120);
        const { worst, pair } = worstOverlap();
        ok('a crowd of twenty on one spot comes apart', worst < 0.02,
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
            { _x: -0.02, _y: -0.2, _side: 0 },
            { _x: 0.02, _y: -0.2, _side: 1, _hp: 1e9, _max: 1e9 },
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
                { _x: -0.02, _y: -0.2, _side: 0, _ph: k * 0.7 },
                { _x: 0.02, _y: -0.2, _side: 1, _ph: k * 0.3 + 1 },
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

    // A unicorn that is struck while walking turns on whoever struck it.
    {
        const [a, b, c] = stage([
            { _x: 0, _y: -0.2, _side: 0 },                  // a, minding its own business
            { _x: 0.5, _y: -0.2, _side: 1, _hp: 1e6, _max: 1e6 },  // b, far off, a's target
            { _x: 0.05, _y: -0.2, _side: 1, _hp: 1e6, _max: 1e6 }, // c, right on top of a
        ]);
        a._foe = b; c._foe = a;
        run(90);
        ok('a unicorn struck while walking turns on whoever struck it', a._foe === c,
            `it is still after ${a._foe === b ? 'its old target' : 'nothing'}`);
    }

    // One already horn to horn finishes that fight before answering another.
    {
        const [a, b, c] = stage([
            { _x: 0, _y: -0.2, _side: 0, _hp: 1e6, _max: 1e6 },
            { _x: 0.03, _y: -0.2, _side: 1, _hp: 1e6, _max: 1e6 },
            { _x: -0.03, _y: -0.2, _side: 1, _hp: 1e6, _max: 1e6 },
        ]);
        a._foe = b; b._foe = a; c._foe = a;
        run(180);
        ok('one already horn to horn does not turn to a second attacker', a._foe === b,
            'it was drawn off its fight');
    }

    // No more than the cap choose the same target.
    {
        stage([
            { _x: 0, _y: -0.2, _side: 1, _hp: 1e6, _max: 1e6 },
            ...Array.from({ length: 6 }, (_, i) => ({ _x: -0.1 - i * 0.02, _y: -0.35 + i * 0.02, _side: 0 })),
        ]);
        run(60);
        const target = sim.herd[0];
        const on = sim.herd.filter((u) => u._foe === target).length;
        ok('no more than the cap choose one target', on <= T.CROWD,
            `${on} chose it, cap is ${T.CROWD}`);
    }

    // Nothing in sight is nothing to fight.
    {
        const [a] = stage([
            { _x: -0.6, _y: -0.2, _side: 0 },
            { _x: 0.6, _y: -0.2, _side: 1 },
        ]);
        run(1);
        ok('an enemy beyond sight is not a target', a._foe === null,
            `it picked one ${(1.2).toFixed(1)} away, sight is ${T.LOOK}`);
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
        deaths: 0, together: 0, promotions: 0, worst: 0, broke: 0,
        /** @type {number[]} */ balances: [], /** @type {number[]} */ fights: [],
        /** @type {Map<object, number>} */ since: new Map(),
    };

    for (let n = 0; n * STEP < seconds; n++) {
        const t = n * STEP;
        sim.step(STEP);

        if (sim.fallen.length > 1 && new Set(sim.fallen.map((u) => u._side)).size > 1) st.together++;
        st.deaths += sim.fallen.length;
        sim.fallen.length = 0;
        st.promotions += sim.promoted.length;
        sim.promoted.length = 0;

        for (const u of sim.herd) {
            if (u._eng && !st.since.has(u)) st.since.set(u, t);
            else if (!u._eng && st.since.has(u)) { st.fights.push(t - st.since.get(u)); st.since.delete(u); }
        }

        if (n % 30 === 0) {
            if (st.broke < 5 && !invariants(t)) st.broke++;
            st.worst = Math.max(st.worst, worstOverlap().worst);
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
    row('worst overlap seen', `${(st.worst * 100).toFixed(0)}% of a footprint`);
}

// ---------------------------------------------------------------------------

units();
e2e();
console.log(failed
    ? `\n[sim] ${failed} failed, ${passed} passed`
    : `\n[sim] all ${passed} passed — ${seconds}s of play in ${process.uptime().toFixed(2)}s`);
process.exit(failed ? 1 : 0);
