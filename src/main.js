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
import { initRainbow, drawRainbow, drawBow, drawCastle, recompile, SOURCES, FOOT } from './rainbow.js';
import { initUnicorns, drawUnicorns } from './unicorn.js';
import * as sim from './sim.js';

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
    state._elapsed += dt;
    sim.step(dt);
    if (!state._manual) state._balance = sim.balance;
}

/**
 * The player's one verb: god mode. A touch strikes down the unicorn nearest
 * to it. Culling the side that is ahead is how the board is kept level.
 * @param {number} cx pointer x in pixels
 * @param {number} cy
 */
function smite(cx, cy) {
    // Pixels to the herd's units: the rainbow's space, y up, height 1.
    sim.smite((cx - innerWidth / 2) / innerHeight, (innerHeight / 2 - cy) / innerHeight);
}

export function reset() {
    state._balance = state._elapsed = 0;
    sim.reset();
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
    + 'text-shadow:0 1px 3px #000c}</style>'
    + '<canvas id=c></canvas><div id=t></div>';

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

/** Rewrite the clock only when the second turns over. */
function showClock() {
    const s = state._elapsed | 0;
    if (s === _shown) return;
    _shown = s;
    clock.textContent = formatClock(s);
}

// --- drawing ----------------------------------------------------------------

/**
 * The castles, with the depth each stands at: the screen y of its base.
 * More will come; anything here is drawn in depth order with the herd.
 */
const castles = [
    { _k: 0, _y: FOOT },
    { _k: 1, _y: FOOT },
];

/**
 * Back to front, with no depth buffer: the world first, then the herd and
 * the castles interleaved by depth, with the bow just behind the castles so
 * it lies over the far herd and under the near one and the walls.
 * @param {number} balance
 */
function drawScene(balance) {
    drawRainbow(balance);
    const items = castles.map((c) => ({ _y: c._y, _draw: () => drawCastle(c._k, balance) }));
    items.push({ _y: Math.max(...castles.map((c) => c._y)) + 1e-3, _draw: () => drawBow(balance) });
    items.sort((a, b) => b._y - a._y);
    let i = 0;
    for (const it of items) { i = drawUnicorns(sim.herd, i, it._y); it._draw(); }
    drawUnicorns(sim.herd, i);
}

// --- boot -------------------------------------------------------------------

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));

if (!initGl(canvas)) {
    document.body.innerHTML =
        '<p style="color:#eee;font:16px sans-serif;padding:2em">This game needs WebGL2.</p>';
} else {
    initRainbow();
    initUnicorns();

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
    });
}
