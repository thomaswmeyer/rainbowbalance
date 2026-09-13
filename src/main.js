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
 * more on the field and more coming to it. What is here is the loop, the page, the clock, the panel of what
 * the two sides have learned, the drawing order and the player's one verb.
 */

import { initGl, resize, setTime } from './gl.js';
import { initRainbow, drawRainbow, drawBow, drawCastle, recompile, SOURCES } from './rainbow.js';
import { initUnicorns, drawUnicorns } from './unicorn.js';
import * as sim from './sim.js';
import { initSparks, burst, shower, bolt, stepSparks, drawSparks } from './sparks.js';
import * as snd from './audio.js';

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
    // Everything the step reported, drained here and turned into what is seen
    // and what is heard. A sound is handed the same projected triple the
    // sparks are, so it is panned across the picture and quietened by the
    // distance the camera gave it: the two cues never disagree about where on
    // the field the thing happened.
    for (const un of sim.fallen) {
        const p = sim.project(un._x, un._y, un._s);
        burst(...p, un._side);
        snd.fell(p, un._side);
    }
    sim.fallen.length = 0;
    // A gate opening has nothing to see — a recruit walks out of one — so
    // this is the one report that is sound alone.
    for (const un of sim.spawned) snd.spawn(sim.project(un._x, un._y, un._s), un._side);
    sim.spawned.length = 0;
    for (const un of sim.promoted) {
        const p = sim.project(un._x, un._y, un._s);
        shower(...p);
        snd.level(p);
    }
    sim.promoted.length = 0;
    // A castle taken gets the same white shower a promotion does, at the
    // size of the castle rather than of a unicorn.
    for (const c of sim.captured) {
        const p = sim.project(c._x, c._y, 2);
        shower(...p);
        snd.taken(p, c._side);
    }
    sim.captured.length = 0;
    // A castle arriving: showers where it stands and a sound of its own. The
    // draw fades it in over the next two seconds.
    for (const c of sim.arrived) {
        const p = sim.project(c._x, c._y, 2);
        shower(...p);
        shower(...p);
        snd.arrive(p);
    }
    sim.arrived.length = 0;
    // And one broken back to nobody's, which is the other half of taking one.
    for (const c of sim.broken) snd.broken(sim.project(c._x, c._y, 2));
    sim.broken.length = 0;
    // Blows land by the hundred a minute. audio.js lets twenty a second
    // through and drops the rest, which is what makes a melee a texture
    // rather than a machine gun.
    for (const un of sim.blows) snd.blow(sim.project(un._x, un._y, un._s));
    sim.blows.length = 0;
    // And a spell is a streak from the horn that cast it to whatever it was
    // cast at, in the colour of which spell it was: frost blue for a hold,
    // gold for a bolt, red for a rage put on one of the caster's own. The
    // sound is told which one for the same reason the streak is.
    for (const c of sim.casts) {
        // A spell goes horn to head, and the plain the spell was cast on has
        // no height on it. Each end is lifted by its own drawn size once the
        // camera has said how big that is.
        const [ax, ay, as] = sim.project(c._x, c._y, c._s);
        const [bx, by, bs] = sim.project(c._tx, c._ty, c._ts);
        // From the horn tip as it is with the neck down: forward of the body
        // by the caster's facing, and at about head height.
        bolt(ax + c._f * as * 0.86, ay + as * 0.53, bx, by + bs * 0.6, as, c._k);
        snd.cast([ax, ay, as], c._k);
    }
    sim.casts.length = 0;
    // A power bought is a white shower over every castle its side holds —
    // the same one a promotion and a capture get, and for the same reason.
    // It is the only thing on the field that says the run just got harder,
    // and it wants saying somewhere other than a panel in the corner.
    for (let s = 0; s < 2; s++) {
        if (sim.tech[s]._got === _powers[s]) continue;
        _powers[s] = sim.tech[s]._got;
        // One sound for it, not one per castle: it happened to the side, and
        // the shower over each castle is the same one thing said in several
        // places.
        snd.power(s);
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
 * The player's one verb: god mode. A touch reaches whichever unicorn is under
 * it — the one on top of the pile where several overlap, since that is the one
 * the player can see. Culling the side that is ahead is how the board is kept
 * level.
 * @param {number} cx pointer x in pixels
 * @param {number} cy
 */
function smite(cx, cy) {
    // Any touch is a gesture, and a browser will not let a sound out before
    // one, so the first of them is what starts the audio.
    snd.boot();
    // Pixels to the screen's own units — the rainbow's space, y up, height 1.
    // Not to the herd's: the herd walks in world units, and what the player
    // is aiming at is the picture, which is where sim.strike() meets it.
    const x = (cx - innerWidth / 2) / innerHeight, y = (innerHeight / 2 - cy) / innerHeight;
    if (charge[power] < 1 || !known(power)) return;
    const un = sim.strike(x, y, power);
    // Where it landed, if it landed on anything: an empty field makes no
    // noise, which is also how the player learns there was nothing there.
    // A hand that found nothing is not spent either, so a miss costs nothing
    // but the moment — the charge is for what it did, not for the gesture.
    if (!un) return;
    charge[power]--;
    paintHands();
    // Every hand its own sound: the first two their own, the rest from hand().
    const at = sim.project(un._x, un._y, un._s);
    if (power > 1) snd.hand(at, power); else (power ? snd.ice : snd.smite)(at);
}

/** How many powers each side had last step, so a new one can be noticed. */
const _powers = [0, 0];

export function reset() {
    snd.begin();
    state._balance = state._elapsed = 0;
    _powers[0] = _powers[1] = 0;
    // A fresh seed, or every run would be the one run.
    sim.reset(Date.now() & 0x7fffffff);
}


/**
 * The god's five hands, and what each of them costs to use.
 *
 * Sparklify is the metronome. Its one charge a second and a half is the hand
 * the whole game was tuned against, and it is deliberately the only one that
 * is always about to be available: a player who has spent everything else
 * still has the one intervention the balance depends on. The rest are scarce
 * in proportion to how permanent they are — a freeze wears off in twenty
 * seconds, and the last three never wear off at all, so they are rationed
 * hardest. Turncoat is the dearest of the lot because it moves an animal from
 * one column to the other, which is worth two of anything else.
 *
 * A charge is a float. Its whole part is how many uses are in hand and its
 * fraction is how far along the next one is, which is the bar under the
 * button, so one number is the whole of the state.
 */
const HANDS = ['\u2728', '\u2744\ufe0f', '\u{1F977}', '\u{1F525}', '\u{1F504}'];
const HAND_MAX = [3, 3, 2, 2, 1];
/**
 * Which power in sim.js's tree each hand is, by its bit, or −1 for none. A
 * hand is only on offer once either side has learned that power, so the row
 * of buttons grows with the run. Sparklify is the exception and is always
 * there: a run starts before anyone has learned anything, and it is the one
 * intervention the balance was tuned against.
 */
const HAND_POWER = [-1, 0, 2, 3, 1];
/** Whether a hand is on offer yet. @param {number} i */
const known = (i) => HAND_POWER[i] < 0
    || ((sim.tech[0]._got | sim.tech[1]._got) >> HAND_POWER[i] & 1) === 1;
const HAND_SECS = [1.5, 5, 12, 12, 20];
const charge = HAND_MAX.slice();

// --- the page ---------------------------------------------------------------
// Everything on the page is made here rather than in the HTML, so that it is
// inside the script and Roadroller packs it: the HTML around the script is
// only deflated. The build's HTML is a doctype, a charset, a title, a body
// tag and the script; the dev page the same plus the module import.

document.body.innerHTML =
    '<style>html,body{margin:0;height:100%;background:#05060d;overflow:hidden}'
    + 'canvas{display:block;width:100%;height:100%;touch-action:none}'
    + '#t{position:fixed;top:13px;right:88px;color:#fff;font:600 54px/1 system-ui,sans-serif;'
    + 'text-shadow:0 1px 3px #000c}'
    + '#u{position:fixed;top:92px;left:0;right:0;text-align:center;color:#fff;'
    + 'font:700 40px/1.2 system-ui,sans-serif;text-shadow:0 2px 8px #000e;'
    + 'pointer-events:none;display:none}'
    + '#o{position:fixed;inset:0;display:none;place-content:center;text-align:center;'
    + 'color:#fff;font:700 64px/1.3 system-ui,sans-serif;text-shadow:0 2px 8px #000e;'
    + 'background:#0006;cursor:pointer}#o i,#o b{display:block;font-style:normal}'
    + '#o i{font-size:96px;margin:.08em 0}#o b{font-size:28px;font-weight:400;opacity:.8;'
    + 'max-width:min(30em,88vw);margin:auto}'
    + '#o button{font:700 30px system-ui,sans-serif;margin:1.2em auto 0;padding:.4em 1.8em;'
    + 'border:0;border-radius:14px;background:#fff;color:#223;cursor:pointer}'
    + '#p{position:fixed;left:12px;top:12px;display:flex;gap:10px}'
    // The mute button in the top right corner, the clock just left of it.
    + '#m{position:fixed;right:12px;top:8px}'
    + '#p b,#m{width:64px;height:64px;display:grid;place-content:center;font-size:34px;'
    + 'border-radius:14px;background:#000;border:3px solid #fff3;cursor:pointer;'
    + 'user-select:none}'
    + '#p b.on{background:#777;border-color:#fff}'
    + '#p b{position:relative;overflow:hidden}#p b.no{opacity:.35}'
    + '#p b::after{content:"";position:absolute;left:0;bottom:0;height:5px;'
    + 'width:var(--f);background:#8cf}'
    + '#p b::before,#p u{position:absolute;'
    + 'font:600 15px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000}'
    // The key it answers to top left, the charges in hand bottom right, just
    // clear of the bar.
    + '#p b::before{content:attr(data-n);right:5px;bottom:5px}'
    + '#p u{left:5px;top:2px;opacity:.6;text-decoration:none}'
    // The research panels: the sunicorns' bottom left, the rainicorns' bottom
    // right, each mirrored so its powers sit on the inside of its bars.
    + '#r,#q{position:fixed;bottom:12px;display:grid;gap:8px 10px;align-items:center;'
    + 'font:30px system-ui,sans-serif;color:#fff;text-shadow:0 2px 4px #000c;'
    + 'user-select:none;pointer-events:none}'
    + '#r{left:12px;grid-template-columns:repeat(4,64px) auto}'
    + '#q{right:12px;grid-template-columns:auto repeat(4,64px)}'
    + '#r u,#q u{text-decoration:none;text-align:center;opacity:.75}'
    + '#r i,#q i{height:16px;border-radius:8px;background:#fff2}'
    + '#r b,#q b{letter-spacing:6px}#r b{padding-left:8px}#q b{padding-right:8px;text-align:right}'
    + '</style>'
    + '<canvas id=c></canvas><div id=t></div><div id=u></div>'
    + '<div id=p>' + HANDS.map((g, i) => `<b><u>${i + 1}</u>${g}</b>`).join('')
    + '</div><i id=m>\ud83d\udd0a</i>'
    + '<div id=r></div><div id=q></div><div id=o></div>';

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
    // Minutes and seconds, and minutes keep counting past sixty. A run that
    // went past an hour would read 73:20, which is a run nobody has played
    // and not worth the fields it would take to write differently.
    return `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`;
}

const over = /** @type {HTMLElement} */ (document.getElementById('o'));

/**
 * The one overlay, and the three screens it is: the start, the end of a run,
 * and the pause. Each is some words and a Play button under them. It covers
 * the whole page, so nothing under it can be pressed, and a touch anywhere on
 * it — the button included — is Play.
 * @param {string} words
 * @param {() => void} play
 */
function screen(words, play) {
    over.innerHTML = words + '<button>Play</button>';
    over.style.display = 'grid';
    over.onpointerdown = (e) => { e.stopPropagation(); snd.boot(); play(); };
}
function hideScreen() {
    over.style.display = 'none';
    over.onpointerdown = null;
}
let _won = -1;

/**
 * The longest run so far, in whole seconds of game time, kept in the browser.
 * The player's whole job is holding the two sides level, so the score is how
 * long the field held before one side took it. Storage can be refused — a
 * private window, or a browser told to keep nothing — and then the best is
 * this session's only, which is still worth showing.
 */
const BEST = 'rainbowbalance-best';
let best = 0;
try { best = +localStorage[BEST] || 0; } catch { /* nothing kept, nothing lost */ }

/** The banner, once. A touch anywhere on it starts another run. */
function showWinner() {
    if (sim.winner === _won) return;
    _won = sim.winner;
    if (sim.winner < 0) { hideScreen(); return; }
    snd.over(sim.winner);
    const t = state._elapsed | 0;
    const side = sim.winner ? 'RAINICORNS' : 'SUNICORNS';
    // A new best is the headline, and who won drops to the small line under
    // the time: the player did not lose that run, they set a record with it.
    // Otherwise the result leads and the best is there to aim at.
    if (t > best) {
        best = t;
        try { localStorage[BEST] = t; } catch { /* kept for this session only */ }
        screen(`A NEW BEST<i>${formatClock(t)}</i><b>${side.toLowerCase()} took the field</b>`, reset);
    } else {
        screen(`${side} HOLD THE FIELD<i>${formatClock(t)}</i><b>best ${formatClock(best)}</b>`, reset);
    }
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
 * Two panels, one a side: the sunicorns' bottom left and the rainicorns'
 * bottom right. Each has four bars of how far the side has got in each of the
 * four areas, and the powers it has bought on the inside of them: after the
 * bars and reading left to right for the sunicorns, before them and reading
 * right to left for the rainicorns, so both start from the bars.
 *
 * The glyphs across the top are the areas in sim.js's own order — how fast it
 * walks, how fast it swings, how far it sees, how fast
 * its castles fill — and the ones at the end of a row are the god's own two
 * hands and then a third the god does not have, which is the whole joke of
 * the tech tree: the sides are learning this from watching the player.
 */
// The three that are not emoji by default get the selector that makes them
// so, which is what the snowflake on the freezing hand already carries: a
// text-presentation glyph in a row of emoji reads as a missing character.
const AREAS = ['\u{1F3C3}', '\u2694\ufe0f', '\u{1F441}\ufe0f', '\u{1F3F0}'];
const POWERS = ['\u2744\ufe0f', '\u{1F504}', '\u{1F977}', '\u{1F525}'];
/** The claim bars' yellow and blue, so a row is read without a label. */
const STONE = ['#ffd61f', '#387aff'];

const sunPanel = /** @type {HTMLElement} */ (document.getElementById('r'));
const rainPanel = /** @type {HTMLElement} */ (document.getElementById('q'));
const glyphs = AREAS.map((g) => `<u>${g}</u>`).join(''), bars = '<i></i>'.repeat(4);
sunPanel.innerHTML = glyphs + '<u></u>' + bars + '<b></b>';
rainPanel.innerHTML = '<u></u>' + glyphs + '<b></b>' + bars;
/** @type {HTMLElement[]} */
const pips = [...sunPanel.querySelectorAll('i'), ...rainPanel.querySelectorAll('i')];
/** @type {HTMLElement[]} */
const learned = [sunPanel.querySelector('b'), rainPanel.querySelector('b')];

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
            pips[s * 4 + i].style.background = `linear-gradient(90deg,${STONE[s]} `
                + `${Math.sqrt(p / sim.FULL) * 100}%,#fff2 0)`;
        });
        // Right to left for the rainicorns, so the first learned is nearest the bars.
        const got = sim.sequence(t).filter((i) => t._got >> i & 1).map((i) => POWERS[i]);
        learned[s].textContent = (s ? got.reverse() : got).join('');
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
    // Only the castles that have arrived; one arriving fades in, bar and all.
    const items = sim.castles.filter((c) => c._up > 0).map((c) => {
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
                c._side, ps / FOOT_S, balance, c._up),
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
 * Which of the god's hands is out. The buttons at the top left choose, and a
 * touch anywhere else on the field uses what is chosen.
 *
 * None of them is free. Each holds a few charges, spends one on use and fills
 * back up at its own rate, which is what makes the player choose rather than
 * sweep: the first is the metronome the game was tuned against and the rest
 * are scarce in proportion to how permanent they are. A hand at less than a
 * whole charge is dimmed and does nothing.
 */
let power = 0;
const hands = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#p b')]);
/**
 * The chosen hand lights up; one with nothing in it goes dim; and the bar
 * across the foot of every button is the fraction of the next charge, which
 * is the same number the button spends, read after the decimal point.
 */
/** What each hand is called on the banner that says it has arrived. */
const HAND_NAME = ['', 'Freeze', 'Stealth', 'Berserk', 'Turncoat'];
const banner = /** @type {HTMLElement} */ (document.getElementById('u'));
/** Which hands were on offer at the last paint, a bit apiece. */
let _known = 1, _bannerT = 0;

/**
 * A hand has just come on offer: say so across the top of the screen for a
 * couple of seconds, and play the sound it makes when it is used, so the
 * player hears what it is before they first reach for it.
 * @param {number} i
 */
function unlocked(i) {
    banner.textContent = `${HAND_NAME[i]} Power Unlocked!`;
    banner.style.display = 'block';
    clearTimeout(_bannerT);
    _bannerT = setTimeout(() => { banner.style.display = 'none'; }, 2600);
    const at = [0, 0.2, 0.15];
    if (i > 1) snd.hand(at, i); else snd.ice(at);
}

function paintHands() {
    // A new run forgets what was learned, and a hand chosen last run may not
    // be on offer in this one.
    if (!known(power)) power = 0;
    let mask = 0;
    hands.forEach((el, i) => {
        const c = charge[i];
        if (known(i)) mask |= 1 << i;
        el.style.display = known(i) ? '' : 'none';
        el.className = (i === power ? 'on' : '') + (c < 1 ? ' no' : '');
        el.style.setProperty('--f', `${(c % 1) * 100}%`);
        // The count only means anything where more than one can be held.
        el.dataset.n = HAND_MAX[i] > 1 ? `${c | 0}` : '';
    });
    // Only what has newly arrived, and the last of them if two came at once.
    const fresh = mask & ~_known;
    _known = mask;
    if (fresh) unlocked(31 - Math.clz32(fresh));
}
hands.forEach((el, i) => {
    el.onpointerdown = (e) => {
        power = i;
        paintHands();
        snd.boot();
        // Choosing a hand is not using it on whatever is under the button.
        e.stopPropagation();
    };
});
paintHands();

// The one button that is not a hand: the sound, off and on. It says which it
// is rather than lighting up, because the hands use lighting up to say which
// of them is chosen and a light over here would read as a sixth hand. It sits
// in the far corner from them for the same reason — the row at the top left is
// all things that are spent on the field, and this is not one of them, so a
// thumb going for a hand never finds it.
const speaker = /** @type {HTMLElement} */ (document.getElementById('m'));
speaker.onpointerdown = (e) => {
    snd.boot();
    speaker.textContent = snd.mute() ? '\ud83d\udd07' : '\ud83d\udd0a';
    e.stopPropagation();
};

// --- the pace ---------------------------------------------------------------

/**
 * How many seconds of the fight a second of watching buys. 1 is real time, 0
 * is paused, and anything above 1 is the same simulation run faster — the
 * step is fixed, so the fight is identical however fast it is watched.
 */
let speed = 1;
/** What to go back to when the pause comes off. */
let played = 1;

/**
 * The start screen: the story in three sentences and a way in. It borrows the
 * end-of-run banner's element and look. The fight waits behind it, paused,
 * and Play — or Space or Enter — is the gesture the browser needs before it
 * lets any sound out, so it boots the audio too. Shown once per page load,
 * not after every run.
 */
let intro = true;
speed = 0;
function start() {
    intro = false;
    speed = played;
    hideScreen();
    snd.boot();
}
screen('Rainbow Balance<b>For Millennia, the Sunicorns and the Rainicorns have been in '
    + 'conflict. Each tries to destroy the other, but without both Sun and Rain there is no '
    + 'Rainbow. Use your powers to keep both sides in balance as long as possible.</b>', start);
// On Wavedash the platform puts a Wavedash global on the page before any of
// this runs, and init() is what takes its loading screen down. Anywhere else
// there is no such global and this does nothing.
self.Wavedash?.init();

/**
 * The pause screen, on the same overlay as the start and the win: "Paused"
 * and a Play button. It covers everything, so while it is up nothing else on
 * the page can be pressed, and a touch anywhere on it — the button included —
 * is what takes the pause off. Space still does too, and so does speeding up.
 */
// A number, not a boolean: the release build's terser writes `false` as 0,
// and `false !== 0` would take the start screen down on the first frame.
let _paused = 0;
function showPause() {
    const now = !intro && sim.winner < 0 && !speed ? 1 : 0;
    if (now === _paused) return;
    _paused = now;
    if (now) screen('Paused', () => { speed = played; }); else hideScreen();
}

addEventListener('keydown', (e) => {
    const k = e.key;
    // Behind the start screen the only keys are the ones that start.
    if (intro) {
        if (k === ' ' || k === 'Enter') { start(); e.preventDefault(); }
        return;
    }
    // And on the win screen Space or Enter begins the next run, as a touch
    // does, rather than pausing a field that has already stopped.
    if (sim.winner >= 0) {
        if (k === ' ' || k === 'Enter') { snd.boot(); reset(); e.preventDefault(); }
        return;
    }
    // 1 to 5 choose a hand, left to right, which is the order they are in on
    // screen and what the small number in the corner of each button says.
    // Choosing is all it does: the hand still has to be used on something, and
    // the pointer is what says where.
    const h = k.length === 1 ? k - 1 : -1;
    if (h >= 0 && h < HANDS.length && known(h)) { power = h; paintHands(); }
    // f faster a step at a time, s slower the same way down to a stop, and
    // space is play or pause at whatever pace was last set.
    else if (k === 'f' || k === 'F') speed = Math.max(speed, 1) + 1;
    else if (k === 's' || k === 'S') speed = Math.max(0, speed - 1);
    else if (k === ' ') speed = speed ? 0 : played;
    else return;
    if (speed) played = speed;
    snd.boot();
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
        let n = 0;
        for (; acc >= STEP && n < 300; n++) { step(STEP); acc -= STEP; }
        // How much of the fight this frame bought, which is what the god's
        // hands fill up on.
        const used = n * STEP;

        // The shaders run on the game's clock, not the wall's: the weather
        // keeps pace with the fight, and stops with it. The one thing that
        // does not is the rainbow's own colours, which are not time's.
        setTime(state._elapsed);
        resize(canvas);
        drawScene(state._balance);
        showClock();
        showTech();
        // The hands fill on the game's clock, not the wall's, so pausing
        // pauses them and running fast fills them fast — the same second of
        // play costs the same second of recharge however it is watched.
        for (let i = 0; i < charge.length; i++) {
            charge[i] = Math.min(HAND_MAX[i], charge[i] + used / HAND_SECS[i]);
        }
        paintHands();
        showWinner();
        showPause();
        // The music is written a fifth of a second ahead of itself, off the
        // one number the whole game is read from, and at the pace the fight
        // is being watched at.
        snd.music(state._balance, speed);
    });
}
