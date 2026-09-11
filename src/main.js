/**
 * Endless Rainbows — boot, loop, and the one rule the whole game is about.
 *
 * Two swarms fight; the player never commands either. What the player does is
 * keep them level, and the rainbow is the readout: it fades from whichever
 * side is winning, and is whole only when the board is level. Hold it there
 * and a second bow appears.
 *
 * The fight itself is sim.js: castles spawn fighters, fighters pair off and
 * fight horn to horn, and balance is who has more left. What is here is the
 * loop, the page, the clock, the drawing order and the player's one verb.
 */

import { initGl, resize, setTime } from './gl.js';
import { initRainbow, drawRainbow, drawBow, drawCastle, recompile, SOURCES } from './rainbow.js';
import { initUnicorns, drawUnicorns } from './unicorn.js';
import * as sim from './sim.js';
import { initSparks, burst, shower, stepSparks, drawSparks } from './sparks.js';

// --- the balance ------------------------------------------------------------

/** Simulation step. Fixed, so the rule never depends on frame rate. */
const STEP = 1 / 60;

export const state = {
    /** −1 rainicorns ahead … +1 sunicorns ahead. Read off the sim each step. */
    _balance: 0,
    /** Seconds into the run. */
    _elapsed: 0,
    /** Set from the URL (?b=) to freeze the balance for a screenshot. */
    _manual: false,
};

/**
 * One fixed step.
 * @param {number} dt seconds
 */
function step(dt) {
    // Once a side holds every castle the field holds still, but whatever was
    // in the air when it happened comes down.
    if (sim.winner < 0) {
        state._elapsed += dt;
        sim.step(dt);
    }
    for (const un of sim.fallen) burst(un._x, un._y, un._s, un._side);
    sim.fallen.length = 0;
    for (const un of sim.promoted) shower(un._x, un._y, un._s);
    sim.promoted.length = 0;
    // A castle taken gets the same white shower a promotion does, at the
    // size of the castle rather than of a unicorn.
    for (const c of sim.captured) shower(c._x, c._y, 0.1);
    sim.captured.length = 0;
    stepSparks(dt);
    if (!state._manual) state._balance = sim.balance;
}

/**
 * The player's one verb: god mode. A touch strikes down the unicorn nearest
 * to it. Culling the side that is ahead is how the board is kept level.
 * @param {number} cx pointer x in pixels
 * @param {number} cy
 */
function smite(cx, cy) {
    if (sim.winner >= 0) { reset(); return; }
    // Pixels to the herd's units: the rainbow's space, y up, height 1.
    sim.smite((cx - innerWidth / 2) / innerHeight, (innerHeight / 2 - cy) / innerHeight);
}

export function reset() {
    state._balance = state._elapsed = 0;
    // A fresh seed, or every run would be the one run.
    sim.reset(Date.now() & 0x7fffffff);
}


// --- the page ---------------------------------------------------------------
// Everything on the page is made here rather than in the HTML, so that it is
// inside the script and Roadroller packs it: the HTML around the script is
// only deflated. The build's HTML is a doctype, a charset, a title, a body
// tag and the script; the dev page the same plus the module import.

document.body.innerHTML =
    '<style>html,body{margin:0;height:100%;background:#05060d;overflow:hidden}'
    + 'canvas{display:block;width:100%;height:100%;touch-action:none}'
    + '#t{position:fixed;top:8px;right:12px;color:#fff;font:600 54px/1 system-ui,sans-serif;'
    + 'text-shadow:0 1px 3px #000c}'
    + '#o{position:fixed;inset:0;display:none;place-content:center;text-align:center;'
    + 'color:#fff;font:700 64px/1.3 system-ui,sans-serif;text-shadow:0 2px 8px #000e;'
    + 'background:#0006;cursor:pointer}#o i,#o b{display:block;font-style:normal}'
    + '#o i{font-size:96px;margin:.08em 0}#o b{font-size:28px;font-weight:400;opacity:.8}'
    + '</style>'
    + '<canvas id=c></canvas><div id=t></div><div id=o></div>';

// --- the clock --------------------------------------------------------------

const clock = /** @type {HTMLElement} */ (document.getElementById('t'));
let _shown = -1;

/**
 * Seconds into the run as a clock that grows a field at a time: 11, then
 * 45:11, then 22:45:11, then 1:22:45:11. Only the leading field is unpadded.
 * @param {number} s
 */
function formatClock(s) {
    s |= 0;
    const f = [s / 86400 | 0, (s / 3600 | 0) % 24, (s / 60 | 0) % 60, s % 60];
    let i = 0;
    while (i < 3 && !f[i]) i++;
    return f.slice(i).map((v, j) => (j ? String(v).padStart(2, '0') : v)).join(':');
}

const over = /** @type {HTMLElement} */ (document.getElementById('o'));
let _won = -2;

/** The banner, once. A touch anywhere on it starts another run. */
function showWinner() {
    if (sim.winner === _won) return;
    _won = sim.winner;
    if (sim.winner < 0) { over.style.display = 'none'; return; }
    // The time on its own line rather than in a sentence: it grows a field
    // at a time, and "in 4" reads no better than "in 1:22:45:11" would.
    over.innerHTML = (sim.winner ? 'RAINICORNS' : 'SUNICORNS') + ' HOLD THE FIELD'
        + `<i>${formatClock(state._elapsed)}</i><b>touch to begin again</b>`;
    over.style.display = 'grid';
}

/** Rewrite the clock only when the second turns over. */
function showClock() {
    const s = state._elapsed | 0;
    if (s === _shown) return;
    _shown = s;
    clock.textContent = formatClock(s);
}

// --- drawing ----------------------------------------------------------------

/**
 * Back to front, with no depth buffer: the world first, then the herd and
 * the castles interleaved by depth, with the bow just behind the castles so
 * it lies over the far herd and under the near one and the walls. The
 * castles are the simulation's, drawn where it says they stand and in the
 * stone of whoever holds them: a castle nobody holds is bare grey, and a
 * part-made claim is part of the way to its holder's stone.
 * @param {number} balance
 */
function drawScene(balance) {
    drawRainbow(balance);
    const items = sim.castles.map((c) => ({
        _y: c._y,
        // Nobody's castle shows no stone of either side, so which side's it
        // would have been does not matter; 0 keeps the branch cheap. The
        // claim only goes over a castle that is being fought for: full or
        // empty and nobody is pressing one, so there is nothing to show.
        _draw: () => drawCastle(c._x, c._y, Math.max(c._side, 0), c._cap / sim.CAP,
            sim.winner < 0 && c._cap > 0 && c._cap < sim.CAP ? c._cap / sim.CAP : -1,
            c._side, sim.depthAt(c._y), balance),
    }));
    // The bow belongs at the depth of its own feet, not at the deepest
    // castle's: it is drawn over the herd behind that line and under the
    // herd in front of it, which is what puts a marching column half in
    // front of the arch and half behind it.
    items.push({ _y: sim.FOOT + 1e-3, _draw: () => drawBow(balance) });
    items.sort((a, b) => b._y - a._y);
    let i = 0;
    for (const it of items) { i = drawUnicorns(sim.herd, i, it._y); it._draw(); }
    drawUnicorns(sim.herd, i);
    drawSparks();
}

// --- boot -------------------------------------------------------------------

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));

if (!initGl(canvas)) {
    document.body.innerHTML =
        '<p style="color:#eee;font:16px sans-serif;padding:2em">This game needs WebGL2.</p>';
} else {
    initRainbow();
    initUnicorns();
    initSparks();
    reset();

    addEventListener('pointerdown', (e) => smite(e.clientX, e.clientY));

    if (__DEBUG__) import('./debug.js').then((d) => d.initDebug(state, reset, SOURCES, recompile, sim));

    let last = 0, acc = 0;
    requestAnimationFrame(function frame(now) {
        requestAnimationFrame(frame);
        const t = now / 1000;
        // A tab that was hidden comes back with a huge delta; stepping all of
        // it would run the whole run in one frame.
        acc = Math.min(acc + (last ? t - last : 0), 0.25);
        last = t;
        while (acc >= STEP) { step(STEP); acc -= STEP; }

        setTime(t);
        resize(canvas);
        drawScene(state._balance);
        showClock();
        showWinner();
    });
}
