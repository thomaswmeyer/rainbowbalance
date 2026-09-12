/**
 * Rainbow Balance — boot, loop, and the one rule the whole game is about.
 *
 * Two swarms fight; the player never commands either. What the player does is
 * keep them level, and the rainbow is the readout: it fades from whichever
 * side is winning, and is whole only when the board is level. Hold it there
 * and a second bow appears.
 *
 * The fight itself is sim.js: castles spawn fighters, fighters pair off and
 * fight horn to horn, both sides research as they go, and balance is who has
 * more left. What is here is the loop, the page, the clock, the panel of what
 * the two sides have learned, the drawing order and the player's one verb.
 */

import { initGl, resize, setTime } from './gl.js';
import { initRainbow, drawRainbow, drawBow, drawCastle, recompile, SOURCES } from './rainbow.js';
import { initUnicorns, drawUnicorns } from './unicorn.js';
import * as sim from './sim.js';
import { initSparks, burst, shower, bolt, stepSparks, drawSparks } from './sparks.js';

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
    for (const un of sim.fallen) burst(...sim.project(un._x, un._y, un._s), un._side);
    sim.fallen.length = 0;
    for (const un of sim.promoted) shower(...sim.project(un._x, un._y, un._s));
    sim.promoted.length = 0;
    // A castle taken gets the same white shower a promotion does, at the
    // size of the castle rather than of a unicorn.
    for (const c of sim.captured) shower(...sim.project(c._x, c._y, 2));
    sim.captured.length = 0;
    // And a spell is a streak from the horn that cast it to whatever it was
    // cast at, in the colour of which spell it was: frost blue for a hold,
    // gold for a bolt, red for a rage put on one of the caster's own.
    for (const c of sim.casts) {
        // A spell goes horn to head, and the plain the spell was cast on has
        // no height on it. Each end is lifted by its own drawn size once the
        // camera has said how big that is.
        const [ax, ay, as] = sim.project(c._x, c._y, c._s);
        const [bx, by, bs] = sim.project(c._tx, c._ty, c._ts);
        bolt(ax, ay + as, bx, by + bs * 0.6, as, c._k);
    }
    sim.casts.length = 0;
    // A power bought is a white shower over every castle its side holds —
    // the same one a promotion and a capture get, and for the same reason.
    // It is the only thing on the field that says the run just got harder,
    // and it wants saying somewhere other than a panel in the corner.
    for (let s = 0; s < 2; s++) {
        if (sim.tech[s]._got === _powers[s]) continue;
        _powers[s] = sim.tech[s]._got;
        for (const c of sim.castles) {
            if (c._side === s && c._own) shower(...sim.project(c._x, c._y, 2));
        }
    }
    stepSparks(dt);
    // __DEBUG__ is false in the build, so this folds to the assignment on
    // its own: nothing but debug.js ever sets _manual.
    if (!__DEBUG__ || !state._manual) state._balance = sim.balance;
}

/**
 * The player's one verb: god mode. A touch strikes down the unicorn nearest
 * to it. Culling the side that is ahead is how the board is kept level.
 * @param {number} cx pointer x in pixels
 * @param {number} cy
 */
function smite(cx, cy) {
    if (sim.winner >= 0) { reset(); return; }
    // Pixels to the screen's own units — the rainbow's space, y up, height 1.
    // Not to the herd's: the herd walks in world units, and what the player
    // is aiming at is the picture, which is where sim.strike() meets it.
    const x = (cx - innerWidth / 2) / innerHeight, y = (innerHeight / 2 - cy) / innerHeight;
    sim.strike(x, y, !!power);
}

/** How many powers each side had last step, so a new one can be noticed. */
const _powers = [0, 0];

export function reset() {
    state._balance = state._elapsed = 0;
    _powers[0] = _powers[1] = 0;
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
    + '#p{position:fixed;left:12px;top:12px;display:flex;gap:10px;user-select:none}'
    + '#p b{width:64px;height:64px;display:grid;place-content:center;font-size:34px;'
    + 'border-radius:14px;background:#0006;border:3px solid #fff3;cursor:pointer}'
    + '#p b.on{background:#fff3;border-color:#fff}'
    + '#r{position:fixed;left:12px;bottom:12px;display:grid;'
    + 'grid-template-columns:repeat(5,32px) auto;gap:4px 5px;align-items:center;'
    + 'font:15px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000c;'
    + 'user-select:none;pointer-events:none}'
    + '#r u{text-decoration:none;text-align:center;opacity:.75}'
    + '#r i{height:8px;border-radius:4px;background:#fff2}'
    + '#r b{letter-spacing:3px;padding-left:4px}</style>'
    + '<canvas id=c></canvas><div id=t></div>'
    + '<div id=p><b>\u2728</b><b>\u2744\ufe0f</b></div>'
    + '<div id=r></div><div id=o></div>';

// --- the clock --------------------------------------------------------------

const clock = /** @type {HTMLElement} */ (document.getElementById('t'));
let _shown = -1, _shownPace = 1;

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

/** Rewrite the clock only when the second turns over, or the pace changes. */
function showClock() {
    const s = state._elapsed | 0;
    if (s === _shown && speed === _shownPace) return;
    _shown = s;
    _shownPace = speed;
    clock.textContent = formatClock(s)
        + (speed === 1 ? '' : speed ? ` ×${speed}` : ' ‖');
}

// --- what the two sides have learned ----------------------------------------

/**
 * The panel, bottom left: a row for each side, five bars of how far it has
 * got in each of the five areas, and the powers it has bought at the end of
 * the row. A player who cannot see this is being asked to guess why the side
 * that was level a minute ago is walking through the other one.
 *
 * The glyphs across the top are the areas in sim.js's own order — how fast it
 * walks, how fast it swings, how far it sees, how far it reaches, how fast
 * its castles fill — and the ones at the end of a row are the god's own two
 * hands and then a third the god does not have, which is the whole joke of
 * the tech tree: the sides are learning this from watching the player.
 */
// The three that are not emoji by default get the selector that makes them
// so, which is what the snowflake on the freezing hand already carries: a
// text-presentation glyph in a row of emoji reads as a missing character.
const AREAS = ['\u{1F3C3}', '\u2694\ufe0f', '\u{1F441}\ufe0f', '\u2194\ufe0f', '\u{1F3F0}'];
const POWERS = ['\u2744\ufe0f', '\u2728', '\u{1F525}'];
/** Sandstone and obsidian, near enough that a row is read without a label. */
const STONE = ['#ffcf6b', '#b48ce8'];

const board = /** @type {HTMLElement} */ (document.getElementById('r'));
board.innerHTML = AREAS.map((g) => `<u>${g}</u>`).join('') + '<u></u>'
    + '<i></i><i></i><i></i><i></i><i></i><b></b>'.repeat(2);
const pips = /** @type {HTMLElement[]} */ ([...board.querySelectorAll('i')]);
const learned = /** @type {HTMLElement[]} */ ([...board.querySelectorAll('b')]);

let _panel = '';

/**
 * Redraw it, and only when there is something new on it. Research moves every
 * step, so without the check this would rewrite ten inline styles sixty times
 * a second for a picture that changes about once.
 */
function showTech() {
    const key = sim.tech.map((t) => t._p.map((p) => p | 0) + '' + t._got) + '';
    if (key === _panel) return;
    _panel = key;
    sim.tech.forEach((t, s) => {
        t._p.forEach((p, i) => {
            // The bar is the effect and not the points. They are not the same
            // shape — the points go in on a square root — and what the other
            // side has to live with is the effect.
            pips[s * 5 + i].style.background = `linear-gradient(90deg,${STONE[s]} `
                + `${Math.sqrt(p / sim.FULL) * 100}%,#fff2 0)`;
        });
        learned[s].textContent = POWERS.slice(0, t._got).join('');
    });
}

// --- drawing ----------------------------------------------------------------

/**
 * How big a castle standing under a foot of the bow draws. Every castle's
 * claim bar is sized against this one, and it never changes, so it is asked
 * for once.
 */
const FOOT_S = sim.project(0, sim.FOOT, 1)[2];

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
    const items = sim.castles.map((c) => {
        // Where it stands on the ground, put through the one camera — the
        // same one the castle shader plants it with. The third of those is
        // how big it draws, and against a foot castle's that is what sizes
        // the claim bar over it, so one deep in the field wears a smaller
        // bar. A ratio of two projections rather than a division of the two
        // depths: project() is the only place perspective happens.
        const [px, py, ps] = sim.project(c._x, c._y, 1);
        return {
            _y: c._y,
            // Nobody's castle shows no stone of either side, so which side's
            // it would have been does not matter; 0 keeps the branch cheap.
            // The claim only goes over a castle that is being fought for:
            // full or empty and nobody is pressing one, so there is nothing
            // to show.
            _draw: () => drawCastle(px, py,
                Math.max(c._side, 0), c._cap / sim.CAP,
                sim.winner < 0 && c._cap > 0 && c._cap < sim.CAP ? c._cap / sim.CAP : -1,
                c._side, ps / FOOT_S, balance),
        };
    });
    // The bow belongs at the depth of its own feet, not at the deepest
    // castle's: it is drawn over the herd behind that line and under the
    // herd in front of it, which is what puts a marching column half in
    // front of the arch and half behind it.
    items.push({ _y: sim.FOOT + 1e-3, _draw: () => drawBow(balance) });
    items.sort((a, b) => b._y - a._y);
    let i = 0;
    for (const it of items) { i = drawUnicorns(i, it._y); it._draw(); }
    drawUnicorns(i);
    drawSparks();
}

// --- the two powers ---------------------------------------------------------

/**
 * Which of the god's hands is out: 0 strikes a unicorn down in a burst of
 * sparks, 1 freezes it into a block of ice. The two buttons at the top left
 * choose, and a touch anywhere else on the field uses what is chosen.
 */
let power = 0;
const hands = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#p b')]);
const paintHands = () => hands.forEach((el, i) => { el.className = i === power ? 'on' : ''; });
hands.forEach((el, i) => {
    el.onpointerdown = (e) => {
        power = i;
        paintHands();
        // Choosing a hand is not using it on whatever is under the button.
        e.stopPropagation();
    };
});
paintHands();

// --- the pace ---------------------------------------------------------------

/**
 * How many seconds of the fight a second of watching buys. 1 is real time, 0
 * is paused, and anything above 1 is the same simulation run faster — the
 * step is fixed, so the fight is identical however fast it is watched.
 */
let speed = 1;
/** What to go back to when the pause comes off. */
let played = 1;

addEventListener('keydown', (e) => {
    const k = e.key;
    // f faster a step at a time, s slower the same way down to a stop, and
    // space is play or pause at whatever pace was last set.
    if (k === 'f' || k === 'F') speed = Math.max(speed, 1) + 1;
    else if (k === 's' || k === 'S') speed = Math.max(0, speed - 1);
    else if (k === ' ') speed = speed ? 0 : played;
    else return;
    if (speed) played = speed;
    e.preventDefault();
});

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
        // it would run the whole run in one frame. What speed does is buy
        // more of the simulation with the same second of real time, so it
        // multiplies the delta rather than the cap.
        acc += Math.min(last ? t - last : 0, 0.25) * speed;
        last = t;
        // Where the board ends is where the picture ends, so the sim is told
        // the window's shape before it steps anyone: a unicorn shoved at the
        // edge has to know, this frame, what room is on the other side of it.
        sim.setEdge(canvas.clientWidth / canvas.clientHeight);
        // And a frame only ever runs so many steps, however far behind it is.
        for (let n = 0; acc >= STEP && n < 300; n++) { step(STEP); acc -= STEP; }

        // The shaders run on the game's clock, not the wall's: the weather
        // keeps pace with the fight, and stops with it. The one thing that
        // does not is the rainbow's own colours, which are not time's.
        setTime(state._elapsed);
        resize(canvas);
        drawScene(state._balance);
        showClock();
        showTech();
        showWinner();
    });
}
