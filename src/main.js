/**
 * Endless Rainbows — boot, loop, and the one rule the whole game is about.
 *
 * Two swarms fight; the player never commands either. What the player does is
 * keep them level, and the rainbow is the readout: it frays toward whichever
 * side is winning and erodes while the board stays lopsided. Hold the balance
 * and it heals, and a second bow appears. Let it shatter and the run is over.
 *
 * The simulation is not here yet. What is here is that rule, driven by a
 * placeholder wander, so the feel of the core loop — how fast the bow reacts,
 * how punishing the drift is, how it looks on the way down — can be tuned
 * before a single unicorn exists. Those constants are the game.
 */

import { initGl, resize, setTime } from './gl.js';
import { initRainbow, drawRainbow } from './rainbow.js';

// --- the rule ---------------------------------------------------------------

/** How far off centre still counts as balanced. The player's margin. */
const DEADZONE = 0.15;
/** Integrity lost per second at maximum imbalance. */
const DRAIN = 0.34;
/** Integrity regained per second while inside the deadzone. */
const REGEN = 0.13;
/** How hard one nudge pulls the board back toward level. */
const NUDGE = 0.22;
/** Simulation step. Fixed, so the rule never depends on frame rate. */
const STEP = 1 / 60;

export const state = {
    /** −1 rainicorns ahead … +1 sunicorns ahead. */
    _balance: 0,
    /** 0…1 — what is left of the bow. The health bar. */
    _integrity: 1,
    /** Seconds survived. The score. */
    _elapsed: 0,
    _over: false,
    /** Set by the debug panel to drive the bow by hand. */
    _manual: false,
};

/** Where the wander is heading, and how fast it drifts there. */
let _target = 0;
let _drift = 0;

/**
 * One fixed step of the rule.
 * @param {number} dt seconds
 */
function step(dt) {
    if (state._over || state._manual) return;
    state._elapsed += dt;

    // Placeholder for the swarm: a wander that re-aims every few seconds and
    // gets more violent the longer the run lasts. The real version of this is
    // two spawn rates and a heuristic AI, and it will drive the same variable.
    const pressure = 0.35 + Math.min(state._elapsed / 90, 1) * 0.65;
    _drift += (Math.random() - 0.5) * dt * 2;
    _drift *= 0.985;
    _target = Math.max(-1, Math.min(1, _target + _drift * dt * pressure * 3));
    state._balance += (_target - state._balance) * dt * 1.6;

    // Erode while lopsided, heal while level.
    const err = Math.max(0, Math.abs(state._balance) - DEADZONE) / (1 - DEADZONE);
    state._integrity += (err > 0 ? -err * DRAIN : REGEN) * dt;
    state._integrity = Math.max(0, Math.min(1, state._integrity));
    if (state._integrity <= 0) state._over = true;
}

/**
 * The player's whole verb, for now: pull the board back toward level. It will
 * become "cull the side that is ahead", which is the same thing expressed in
 * unicorns.
 * @param {number} x pointer x in 0…1 across the canvas
 */
function nudge(x) {
    if (state._over) { reset(); return; }
    // Push away from whichever half was touched, so the gesture is "hold this
    // side down" rather than an abstract slider.
    state._balance -= (x < 0.5 ? -1 : 1) * NUDGE;
    _target -= (x < 0.5 ? -1 : 1) * NUDGE * 0.5;
}

export function reset() {
    state._balance = state._elapsed = _target = _drift = 0;
    state._integrity = 1;
    state._over = false;
}

// --- boot -------------------------------------------------------------------

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));

if (!initGl(canvas)) {
    document.body.innerHTML =
        '<p style="color:#eee;font:16px sans-serif;padding:2em">This game needs WebGL2.</p>';
} else {
    initRainbow();

    addEventListener('pointerdown', (e) => nudge(e.clientX / innerWidth));

    if (__DEBUG__) import('./debug.js').then((d) => d.initDebug(state, reset));

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
        drawRainbow(state._balance, state._integrity);
    });
}
