/**
 * Sparks — the burst a unicorn goes out in.
 *
 * Each spark is an instanced quad with a soft dot in it, white at the core
 * and one of the fallen unicorn's colours at the edge: half of them a mane
 * hue, half the body. They fly out, fall, and die within a second. Drawn
 * last, over everything, premultiplied.
 *
 * Instance data, six floats: x, y, size, age 0…1; side; u, a place along the
 * mane's hue sweep, or one of the flat colours below it: −1 the body colour,
 * −2 white, and then one for each spell's line — −3 a frost, −4 a turncoat.
 */

import { g, time, width, height, Batch } from './gl.js';
import { NEAR_S } from './sim.js';

const CAP = 384;

const VS = g`#version 300 es
layout(location = 0) in vec4 aA;
layout(location = 1) in vec2 aK;
uniform vec2 uR;
out vec2 vP;
out vec2 vK;
out float vA;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) - 0.5;
  vP = c * 2.0;
  vK = aK;
  vA = aA.w;
  vec2 w = aA.xy + c * aA.z * 2.0;
  gl_Position = vec4(2.0 * w * vec2(uR.y / uR.x, 1.0), 0.0, 1.0);
}`;

const FS = g`#version 300 es
precision highp float;
in vec2 vP;
in vec2 vK;
in float vA;
out vec4 o;
uniform float uT;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// The unicorn shader's mane colours, and its body colours with the
// rainicorn's lifted out of the near-black, which does not read as a spark.
vec3 colour(float u, float side, float t){
  if (u < -3.5) return vec3(0.80, 0.36, 1.0);     // a turncoat, purple
  if (u < -2.5) return vec3(0.45, 0.82, 1.0);     // a frost
  if (u < -1.5) return vec3(1.0);                 // a promotion's white shower
  if (u < 0.0) return mix(vec3(0.99, 0.95, 0.88), vec3(0.55, 0.40, 0.75), side);
  vec3 sun = hsv(fract(0.95 + u * 0.45 + t * 0.03), 0.7, 1.0);
  vec3 rain = hsv(0.70 + u * 0.25 + 0.03 * sin(t), 0.85, 0.9);
  return mix(sun, rain, side);
}

void main(){
  float r = length(vP);
  if (r > 1.0) discard;
  float a = (1.0 - r * r) * (1.0 - vA);
  o = vec4(mix(vec3(1.0), colour(vK.y, vK.x, uT), smoothstep(0.0, 0.7, r)), 1.0) * a;
}`;

/** @type {{_x:number,_y:number,_vx:number,_vy:number,_s:number,_age:number,_life:number,_side:number,_u:number}[]} */
const _sparks = [];
/** @type {Batch} */
let _batch;

export function initSparks() {
    _batch = new Batch(VS, FS, ['uR', 'uT'], [4, 2], CAP);
}

/**
 * One spark, if there is room for it: every burst, shower and line below is
 * a run of these.
 * @param {number} x @param {number} y where it starts
 * @param {number} vx @param {number} vy how fast it sets off
 * @param {number} s its size
 * @param {number} life seconds until it is gone
 * @param {number} side whose colours, for a spark that takes them
 * @param {number} u the colour: a place on the mane, or one of the flat ones
 */
function spark(x, y, vx, vy, s, life, side, u) {
    if (_sparks.length < CAP) {
        _sparks.push({ _x: x, _y: y, _vx: vx, _vy: vy, _s: s, _age: 0, _life: life, _side: side, _u: u });
    }
}

/**
 * A unicorn goes out here.
 * @param {number} x
 * @param {number} y at the hooves
 * @param {number} s its size
 * @param {number} side
 */
export function burst(x, y, s, side) {
    const k = s / NEAR_S;
    for (let i = 0; i < 28; i++) {
        const a = Math.random() * 6.283, v = (0.12 + Math.random() * 0.3) * k;
        spark(x + (Math.random() - 0.5) * 0.3 * s, y + (0.3 + Math.random() * 0.5) * s,
            Math.cos(a) * v, Math.abs(Math.sin(a)) * v + 0.1 * k,
            (0.004 + Math.random() * 0.007) * k, 0.5 + Math.random() * 0.5,
            side, i & 1 ? Math.random() : -1);
    }
}

/**
 * A unicorn comes up a level here: a white shower rising off it.
 * @param {number} x
 * @param {number} y at the hooves
 * @param {number} s its size
 */
export function shower(x, y, s) {
    const k = s / NEAR_S;
    for (let i = 0; i < 24; i++) {
        spark(x + (Math.random() - 0.5) * 1.2 * s, y + Math.random() * 1.5 * s,
            Math.cos(Math.random() * 6.283) * 0.06 * k, (0.22 + Math.random() * 0.3) * k,
            (0.003 + Math.random() * 0.005) * k, 0.7 + Math.random() * 0.5, 0, -2);
    }
}

/**
 * A spell, as a line from the caster's horn to what it was aimed at, laid
 * down whole and left where it is to fade. The spell itself has already
 * landed — a spell does not travel and does not miss — so nothing in its
 * picture moves: stepSparks() leaves a line's dots where they were laid.
 * @param {number} x0 the horn
 * @param {number} y0
 * @param {number} x1 what it is aimed at
 * @param {number} y1
 * @param {number} s the caster's size
 * @param {number} kind which spell: 0 a frost, 1 a turncoat. They are laid
 *   the same way and only the colour differs.
 */
export function bolt(x0, y0, x1, y1, s, kind) {
    // Dots close enough to run together, one size all along. The spells sit
    // next to each other below the body colour, so which one it is is the
    // only arithmetic here.
    for (let i = 0; i <= 30; i++) {
        spark(x0 + (x1 - x0) * i / 30, y0 + (y1 - y0) * i / 30, 0, 0,
            0.008 * s / NEAR_S, 0.45, 0, -3 - kind);
    }
}

/** @param {number} dt */
export function stepSparks(dt) {
    for (let i = _sparks.length; i--;) {
        const p = _sparks[i];
        p._age += dt / p._life;
        if (p._age >= 1) { _sparks.splice(i, 1); continue; }
        // A spell's line stays where it was laid; only bursts and showers fall.
        if (p._u < -2.5) continue;
        p._vy -= 0.9 * dt;
        p._vx *= 1 - 1.5 * dt;
        p._x += p._vx * dt;
        p._y += p._vy * dt;
    }
}

export function drawSparks() {
    if (!_sparks.length) return;
    _batch.clear();
    for (const p of _sparks) _batch.push(p._x, p._y, p._s, p._age, p._side, p._u);
    _batch.draw({ uR: [width, height], uT: [time] });
}
