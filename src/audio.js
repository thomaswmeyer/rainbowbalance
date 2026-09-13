/**
 * Sound — all of it made on the spot, none of it loaded.
 *
 * There is no room in 13,312 bytes for a single second of recorded audio, so
 * every noise in the game is an oscillator or a burst of white noise through
 * a filter, and the music is written as it plays. Two things come out of that
 * which are worth having anyway: the whole soundtrack is one number wide —
 * the same balance the sky, the bow and the castles read — and it never
 * repeats.
 *
 * **The music is the readout the rainbow is.** Level, and there is a tune:
 * major, in time, and when the board is level enough to earn the second bow
 * there is a second voice an octave over the first, appearing on the same
 * threshold the bow does. Tipped, and the tune thins and sours — the thirds,
 * sixths and sevenths bend flat by a continuous amount rather than switching
 * from one mode to the other, so a board going wrong is heard going wrong —
 * the drone under it swells and detunes, and a heartbeat comes in beneath
 * that. The drone also pans towards whoever is winning, which is the side the
 * bow is fading from: sunicorns are the left of the screen, and `balance > 0`
 * is sunicorns ahead, so the weight gathers on the left when the left is
 * winning. Move that without moving the sky and the cues contradict each
 * other, the same way they would in the shaders.
 *
 * **Everything on the field is placed where it happened.** A sound is handed
 * the same projected triple sparks.js is handed — screen x, screen y, screen
 * size — so it pans to where the thing is across the picture and quietens
 * with the size the camera gave it. A castle falling at the back of the field
 * is a long way off and sounds it.
 *
 * Nothing here runs until the player touches the page: a browser will not
 * start an AudioContext without a gesture, and the game's first gesture is
 * the first smite. `boot()` is called from that.
 */

import { NEAR_S } from './sim.js';

/** @type {AudioContext} */
let ctx;
/**
 * The soundtrack, switched off for now and kept. Off, the drone is never built
 * and the tune is never written, and the minifier takes both out of the build;
 * every sound effect, the jingle for a power bought and the cadence at the end
 * of a run are untouched. Turn it back on here and nothing else has to change.
 */
const MUSIC = false;
/** Everything the field makes, and everything the music makes. */
let sfxBus, musicBus, master;
/** Two seconds of white noise, looped and started at a random offset. */
let noiseBuf;
/** The drone: three sawtooths, a filter, a gain and a place in the field. */
let padOsc, padCut, padGain, padPan;

/** The key. D, because the bow's colours are warm and D is a warm root. */
const ROOT = 146.83;
/** Major, in semitones. What bends it minor is BEND, by degrees. */
const SCALE = [0, 2, 4, 5, 7, 9, 11];
/** Which degrees flatten as the board tips, and by how much of a semitone. */
const BEND = [0, 0, 1, 0, 0, 1, 1];
/** Four bars round: I – vi – IV – V, as scale degrees. */
const PROG = [0, 5, 3, 4];
/**
 * How loud the whole of it is. Everything under here is mixed against
 * everything else and nothing against the outside world, so this is the one
 * number that says how loud the game is next to everything else the machine
 * is playing. Recorded out of a browser, the mix peaked at a sixth of full
 * scale before this was more than 1, which is a game nobody can hear over a
 * fan. The limiter is what makes it safe to ask for this much — but only just:
 * a burst of noise begins at a random place in the buffer, so the smiting hand
 * is a different peak every time it is struck, and at 2 the loudest of those
 * clipped a sample or two. 2.4 reached −0.2 dBFS on a good run, which leaves
 * nothing at all for a browser whose limiter is a millisecond slower.
 */
const VOL = 1.7;

/** 0 while the board is level, 1 once one side is well ahead. */
let sour = 0;
/** 1 while the second bow is out, 0 once it has gone. The same threshold. */
let shine = 0;
/** Where the melody's walk has got to, in scale degrees above the root. */
let deg = 7;
/** Which eighth of which bar comes next, and when it is due. */
let step8 = 0, due = 0;
/** Voices begun in the window that started at `since`, and when it started. */
let live = 0, since = 0;
/** When the last blow was heard, which is what rations them. */
let lastBlow = 0;
/** Set by the button. The graph stays up; the master gain goes to nothing. */
let quiet = false;
/** Nothing is scheduled once a side has won, until the next run begins. */
let ended = false;

/**
 * Start the graph, or wake it if the tab put it to sleep. Called from every
 * gesture the page has, because any of them may be the first.
 */
export function boot() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    ctx = new A();

    // A limiter across the whole output, sitting above everything the mix
    // does on its own, so that forty animals landing blows in one frame under
    // a fanfare cannot clip. Below it nothing is touched.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 6;
    comp.ratio.value = 14;
    // Faster than the 3ms default, because what it has to catch is the front
    // of a noise burst and not a swell.
    comp.attack.value = 0.001;
    master = ctx.createGain();
    master.gain.value = quiet ? 0 : VOL;
    comp.connect(master).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(comp);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(comp);

    // Two whole seconds of it, so that a tail half a second long never hears
    // the loop come round, and every voice starts somewhere else in it.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = d.length; i--;) d[i] = Math.random() * 2 - 1;

    // The drone: a sub, the root and the fifth. It never stops and it is
    // never scheduled — the whole of what it does is done by moving three
    // parameters at it, once a frame, off the balance.
    if (MUSIC) {
        padCut = ctx.createBiquadFilter();
        padCut.frequency.value = 700;
        padGain = ctx.createGain();
        padGain.gain.value = 0;
        padPan = ctx.createStereoPanner();
        padCut.connect(padGain).connect(padPan).connect(musicBus);
        padOsc = [0.5, 1, 1.5].map((m) => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = ROOT * m;
            o.connect(padCut);
            o.start();
            return o;
        });
    }
    due = ctx.currentTime + 0.1;
}

/** The button. Off is off at the master, so nothing has to be torn down. */
export function mute() {
    quiet = !quiet;
    if (master) master.gain.setTargetAtTime(quiet ? 0 : VOL, ctx.currentTime, 0.02);
    return quiet;
}

/** A new run: the music comes back and the field is worth listening to again. */
export function begin() {
    ended = false;
    step8 = 0;
    if (ctx) due = ctx.currentTime + 0.1;
}

// --- the two voices everything is made of -----------------------------------

/**
 * The tail every voice shares: an envelope, a place across the picture, and a
 * stop, so that the node is collected rather than left running for the rest
 * of the game.
 * @param {AudioNode} node the end of whatever chain was built
 * @param {AudioScheduledSourceNode} src what to start, at the head of it
 * @param {number} t when
 * @param {number} d seconds, to silence
 * @param {number} g peak
 * @param {number} p −1 left … 1 right
 * @param {number} at seconds to the peak
 * @param {AudioNode} [bus] where it lands; the field, unless the music says so
 */
function out(node, src, t, d, g, p, at, bus) {
    const a = ctx.createGain(), s = ctx.createStereoPanner();
    // Exponential the whole way, which means never quite to zero: a ramp to
    // an actual 0 is undefined and comes out as a click.
    a.gain.setValueAtTime(1e-4, t);
    a.gain.exponentialRampToValueAtTime(g, t + at);
    a.gain.exponentialRampToValueAtTime(1e-4, t + d);
    s.pan.value = p;
    node.connect(a).connect(s).connect(bus || sfxBus);
    if (src.buffer) src.start(t, Math.random() * 1.5); else src.start(t);
    src.stop(t + d + 0.05);
}

/**
 * Is there room for another voice? No more than eighteen may begin in any one
 * sixtieth of a second, and the rest are dropped.
 *
 * A cap is wanted because nothing here rations itself: a tab that was away
 * comes back and the loop runs three hundred steps in one frame, and every
 * death, spawn and blow in five seconds of the fight is reported at once. The
 * window is time rather than a frame because a sound must never depend on
 * being called from inside the loop — three castles taken while nothing was
 * drawing would otherwise fall silent one after another, and that took a
 * recording to notice.
 */
function room() {
    const t = ctx.currentTime;
    if (t > since + 0.016) { since = t; live = 0; }
    return live++ < 18;
}

/**
 * A pitched voice, swept from one frequency to another over its whole length.
 * @param {OscillatorType} w
 * @param {number} f0
 * @param {number} f1 the same as f0 for a note that holds still
 * @param {number} d
 * @param {number} g
 * @param {number} p
 * @param {number} [t]
 * @param {number} [at]
 * @param {AudioNode} [bus]
 */
function tone(w, f0, f1, d, g, p, t, at, bus) {
    if (!ctx || !room()) return;
    t = t || ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = w;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    out(o, o, t, d, g, p, at || 0.006, bus);
}

/**
 * A burst of noise through a bandpass swept the same way, which is every
 * unpitched sound in the game: a hoof, a blow, a crack, a shower of frost.
 * The Q is the whole difference between a thump and a chime.
 * @param {number} f0
 * @param {number} f1
 * @param {number} d
 * @param {number} g
 * @param {number} p
 * @param {number} q
 * @param {number} [t]
 */
function rush(f0, f1, d, g, p, q, t) {
    if (!ctx || !room()) return;
    t = t || ctx.currentTime;
    const s = ctx.createBufferSource(), b = ctx.createBiquadFilter();
    s.buffer = noiseBuf;
    s.loop = true;
    b.type = 'bandpass';
    b.Q.value = q;
    b.frequency.setValueAtTime(f0, t);
    b.frequency.exponentialRampToValueAtTime(f1, t + d);
    s.connect(b);
    out(b, s, t, d, g, p, 0.004);
}

// --- where on the field it happened -----------------------------------------

/**
 * Across the picture. The screen is about 0.8 wide either side of the middle
 * in the units project() hands back, so that is where the field ends and the
 * pan stops.
 * @param {number[]} p a projected triple, x y size
 */
const pan = (p) => Math.max(-1, Math.min(1, p[0] / 0.8));

/**
 * And how near. The camera has already said how big the thing draws, and
 * against the biggest a unicorn ever draws that is the whole of the distance
 * cue: a castle at the back of the field is a fifth of the volume of a fight
 * at the front. Never all the way down, because something happening out
 * there is still something happening.
 * @param {number[]} p
 */
const near = (p) => Math.min(1, 0.28 + 1.4 * p[2] / NEAR_S);

// --- the field --------------------------------------------------------------

/**
 * A recruit comes out of a gate. Two of these a second across four castles,
 * so it is the quietest thing here: a soft rise, and the puff of a gate.
 * @param {number[]} p
 * @param {number} side
 */
export function spawn(p, side) {
    const v = near(p), x = pan(p), f = side ? 262 : 349;
    tone('triangle', f, f * 1.5, 0.12, 0.075 * v, x);
    rush(700, 260, 0.09, 0.045 * v, x, 1);
}

/**
 * A unicorn goes down: the pitch falls out of it and the body lands.
 * @param {number[]} p
 * @param {number} side
 */
export function fell(p, side) {
    const v = near(p), x = pan(p);
    tone('sawtooth', side ? 190 : 240, 55, 0.34, 0.13 * v, x);
    rush(1500, 190, 0.3, 0.1 * v, x, 0.9);
}

/**
 * Horn on horn. The one sound in the game that happens hundreds of times a
 * minute, so it is a tick rather than a clang, and no more than twenty of
 * them a second get through however many blows land.
 * @param {number[]} p
 */
export function blow(p) {
    if (!ctx || ctx.currentTime - lastBlow < 0.05) return;
    lastBlow = ctx.currentTime;
    const v = near(p), x = pan(p);
    // A wide band rather than a narrow one: a high Q took nearly all the
    // energy out of a burst this short, and a clash that measures at a
    // fortieth of a spawn is a clash nobody hears.
    rush(3400, 900, 0.07, 0.3 * v, x, 2);
    tone('triangle', 1800, 1150, 0.06, 0.1 * v, x);
}

/**
 * A wizard's spell, which does not travel: it is already on whatever it was
 * aimed at. Three of them, told apart the same way the streak tells them
 * apart — the streak is frost blue, gold and red, and these are a shiver, a
 * strike and a growl.
 * @param {number[]} p
 * @param {number} k 0 the frost, 1 the bolt, 2 a rage put on one of its own
 */
export function cast(p, k) {
    const v = near(p), x = pan(p);
    if (k === 1) {
        // A turncoat: two voices passing each other in pitch and across the
        // stereo field, which is what changing sides sounds like.
        tone('sine', 760, 240, 0.3, 0.09 * v, x);
        tone('triangle', 240, 760, 0.3, 0.07 * v, -x);
        rush(1400, 450, 0.3, 0.05 * v, x, 4);
    } else {
        tone('sine', 880, 2400, 0.24, 0.07 * v, x);
        tone('sine', 1320, 3550, 0.2, 0.04 * v, x);
        rush(3000, 6500, 0.28, 0.045 * v, x, 3);
    }
}

/**
 * A side has bought a power. Nothing on the field did it and there is no one
 * place on the field where it happened — the shower goes up over every castle
 * that side holds — so this is the only sound in the game with no position of
 * its own, only a side. It goes to the music rather than the field, because
 * what it says is that the run just got harder, and that is the score's job.
 * @param {number} side
 */
export function power(side) {
    const t = ctx ? ctx.currentTime : 0, x = side ? 0.55 : -0.55;
    tone('sawtooth', hz(-7), hz(0), 1.3, 0.09, x, t, 0.35, musicBus);
    for (let i = 0; i < 2; i++) {
        const f = hz(7 + i * 4);
        tone('sine', f, f, 1.1, 0.07, x, t + i * 0.12, 0.09, musicBus);
    }
}

/**
 * The god's hand, first of the two: not a sound off the field but a sound
 * over it, so it is loud, low, and in the middle whatever the distance says.
 * @param {number[]} p
 */
export function smite(p) {
    const x = pan(p) * 0.6;
    rush(3200, 110, 0.45, 0.3, x, 0.7);
    tone('sawtooth', 170, 42, 0.4, 0.2, x);
    tone('sine', 95, 30, 0.6, 0.26, x);
}

/**
 * And the second: a block of ice closing over an animal. A chord of chimes
 * an instant apart, over the hiss of it going hard.
 * @param {number[]} p
 */
export function ice(p) {
    const x = pan(p) * 0.6;
    const t = ctx ? ctx.currentTime : 0;
    for (let i = 0; i < 3; i++) {
        const f = 1046 * [1, 1.26, 1.5][i];
        tone('sine', f, f, 0.55, 0.11, x, t + i * 0.045, 0.004);
    }
    rush(6000, 1400, 0.5, 0.11, x, 2);
}

/**
 * A castle arriving on the field: something rising out of the ground rather
 * than landing on it. A low swell and a bright one climbing together, over a
 * rush opening upwards, placed where the castle stands.
 * @param {number[]} p
 */
export function arrive(p) {
    const v = near(p), x = pan(p);
    tone('sine', 110, 220, 1.6, 0.16 * v, x, undefined, 0.6);
    tone('triangle', 440, 1320, 1.4, 0.07 * v, x, undefined, 0.5);
    rush(300, 5000, 1.6, 0.06 * v, x, 1.5);
}

/**
 * The god's other three hands, each its own sound and, like the first two,
 * loud and near the middle whatever the distance: 2 hides a unicorn, 3 sends
 * it berserk, 4 turns it. The last two are their spells' sounds made bigger.
 * @param {number[]} p
 * @param {number} k the hand
 */
export function hand(p, k) {
    const x = pan(p) * 0.6;
    if (k === 2) {
        // A breath, and gone.
        rush(700, 6000, 0.4, 0.16, x, 0.9);
        tone('sine', 520, 180, 0.3, 0.08, x);
    } else if (k === 3) {
        // A growl coming up out of it.
        tone('sawtooth', 90, 260, 0.45, 0.2, x);
        tone('square', 60, 140, 0.4, 0.08, x);
        rush(400, 1800, 0.45, 0.12, x, 2);
    } else {
        tone('sine', 900, 260, 0.35, 0.12, x);
        tone('triangle', 260, 900, 0.35, 0.1, -x);
        rush(1500, 500, 0.3, 0.08, x, 4);
    }
}

/**
 * A unicorn comes up a level, and it comes up in key: three degrees of
 * whatever scale the board currently has, rising.
 * @param {number[]} p
 */
export function level(p) {
    const v = near(p), x = pan(p), t = ctx ? ctx.currentTime : 0;
    for (let i = 0; i < 3; i++) {
        const f = hz(7 + i * 2);
        tone('triangle', f, f, 0.26, 0.085 * v, x, t + i * 0.07, 0.008);
    }
}

/**
 * A castle comes up to a full claim. The biggest thing that happens without
 * the player: a bell, a triad under it, and a shimmer over the walls.
 * @param {number[]} p
 * @param {number} side
 */
export function taken(p, side) {
    const v = near(p), x = pan(p), t = ctx ? ctx.currentTime : 0;
    tone('sine', side ? 110 : 147, side ? 110 : 147, 1.4, 0.24 * v, x, t, 0.01);
    for (let i = 0; i < 3; i++) {
        const f = hz(i * 2) * 2;
        tone('triangle', f, f, 0.8, 0.09 * v, x, t + i * 0.06, 0.02);
    }
    rush(2200, 5000, 0.6, 0.05 * v, x, 2);
}

/**
 * And a claim broken, which is the other half of taking one and reads as the
 * loss it is: a hollow knock, falling, with the stone going out of it.
 * @param {number[]} p
 */
export function broken(p) {
    const v = near(p), x = pan(p);
    tone('square', 300, 100, 0.42, 0.1 * v, x);
    rush(900, 170, 0.4, 0.11 * v, x, 1);
}

/**
 * A side holds every castle. The run stops where it stands and so does the
 * music: a cadence over the top of it, and the drone taken away underneath.
 * @param {number} side
 */
export function over(side) {
    ended = true;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (MUSIC) padGain.gain.setTargetAtTime(0, t, 0.5);
    for (let i = 0; i < 4; i++) {
        // Whoever won, the same shape: the triad, and the octave on top of
        // it. Which side it was is in the root, an octave apart.
        const f = ROOT * (side ? 1 : 2) * [1, 1.5, 2, 3][i];
        tone('triangle', f, f, 2.2, 0.11, side ? 0.3 : -0.3, t + i * 0.11, 0.03, musicBus);
    }
    rush(400, 3000, 1.4, 0.05, 0, 1.4, t);
}

// --- the music --------------------------------------------------------------

/**
 * A scale degree as a frequency. The octave comes off the divide and the note
 * off what is left, and the bend is subtracted before the semitones are
 * turned into a ratio — which is what makes souring continuous. Half a bend
 * is a third that is neither major nor minor, and that is the sound of a
 * board that is starting to go.
 * @param {number} d degrees above the root, seven to the octave
 */
function hz(d) {
    const o = Math.floor(d / 7), i = d - o * 7;
    return ROOT * 2 ** (o + (SCALE[i] - BEND[i] * sour) / 12);
}

/**
 * One eighth note. Eight to the bar, four bars to the round, and what is on
 * each of them is decided here and now: the bass on the downbeat, the
 * heartbeat when the board has tipped, and the melody as often as the board
 * is level enough to have one.
 * @param {number} t
 */
function eighth(t) {
    const n = step8++, chord = PROG[(n >> 3) & 3];
    if (!(n & 7)) {
        const f = hz(chord - 7);
        tone('triangle', f, f, 1.1, 0.1, -0.12, t, 0.02, musicBus);
    }
    // The heartbeat is not there at all while the board is level. It arrives
    // as the thing to worry about arrives, and it is the one voice that gets
    // louder rather than quieter as the tune goes.
    if (!(n & 3) && sour > 0.12) {
        tone('sine', 78, 44, 0.32, 0.12 * sour, 0, t, 0.004, musicBus);
    }
    // The melody thins as the board tips: two notes in three while it is
    // level, one in three once it has gone. The tune is what is lost, so the
    // sign here is the whole point — it read `0.32 + 0.4 * sour` at first,
    // which fills the bar up as the board goes wrong instead of emptying it.
    if (Math.random() > 0.68 - 0.36 * sour) return;
    // A walk, pulled back onto a chord tone at the top of every bar so that
    // it never wanders out of the harmony for long.
    deg = n & 7
        ? Math.max(3, Math.min(16, deg + (Math.random() * 5 | 0) - 2))
        : chord + 7 + 7 * (Math.random() < 0.4 ? 1 : 0);
    const f = hz(deg), x = ((deg % 7) - 3) / 8;
    tone('triangle', f, f, 0.5, 0.08, x, t, 0.01, musicBus);
    // The second voice, on the same threshold the second bow appears on:
    // hold the board level and the tune answers itself an octave up.
    if (shine > 0) tone('sine', f * 2, f * 2, 0.7, 0.045 * shine, -x, t + 0.06, 0.05, musicBus);
}

/**
 * Once a frame: the drone follows the balance, and the tune is written a
 * fifth of a second ahead of itself.
 * @param {number} balance −1 rainicorns ahead … +1 sunicorns ahead
 * @param {number} speed how many seconds of the fight a second buys; 0 paused
 */
export function music(balance, speed) {
    if (!ctx || !MUSIC) return;
    const now = ctx.currentTime, b = Math.abs(balance);
    sour = Math.min(1, b * 3);
    // The same 0.08 the shader fades the second bow out over.
    shine = Math.max(0, 1 - b / 0.08);

    // The drone: quiet and open while the board is level, loud, dark and
    // detuned once it is not, and gathered on the side that is winning.
    padGain.gain.setTargetAtTime(ended ? 0 : 0.06 + 0.1 * sour, now, 0.3);
    padCut.frequency.setTargetAtTime(420 + 1500 * (1 - sour), now, 0.3);
    padPan.pan.setTargetAtTime(-balance * 0.7, now, 0.3);
    for (let i = 3; i--;) padOsc[i].detune.setTargetAtTime(sour * 42 * (i - 1), now, 0.3);
    // Paused, the music is held rather than stopped: the field is holding
    // still too, and silence would say the game had ended.
    musicBus.gain.setTargetAtTime(speed ? 0.5 : 0.18, now, 0.15);

    if (ended) return;
    // A tab that was away comes back with the schedule far behind the clock.
    if (due < now) due = now;
    // The tune runs at the pace the fight is watched at, but not one for one:
    // three times the speed is twice the tempo, which is quick and still a tune.
    const beat = 0.42 / Math.sqrt(Math.max(speed, 0.5));
    while (due < now + 0.2) { eighth(due); due += beat; }
}
