/**
 * Sparks — the burst a unicorn goes out in.
 *
 * Each spark is an instanced quad with a soft dot in it, white at the core
 * and one of the fallen unicorn's colours at the edge: half of them a mane
 * hue, half the body. They fly out, fall, and die within a second. Drawn
 * last, over everything, premultiplied.
 *
 * Instance data, six floats: x, y, size, age 0…1; side; u, a place along the
 * mane's hue sweep, −1 for the body colour, −2 for white, or −3 for the ice a
 * spell is made of.
 */

import { g, program, uniforms, gl, time, width, height, Batch } from './gl.js';
import { NEAR_S } from './sim.js';

const CAP = 384;

const VS = g`#version 300 es
layout(location = 0) in vec4 aSpark;
layout(location = 1) in vec2 aKind;
uniform vec2 uRes;
out vec2 vP;
out vec2 vKind;
out float vAge;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) - 0.5;
  vP = c * 2.0;
  vKind = aKind;
  vAge = aSpark.w;
  vec2 w = aSpark.xy + c * aSpark.z * 2.0;
  gl_Position = vec4(2.0 * w * vec2(uRes.y / uRes.x, 1.0), 0.0, 1.0);
}`;

const FS = g`#version 300 es
precision highp float;
in vec2 vP;
in vec2 vKind;
in float vAge;
out vec4 o;
uniform float uTime;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// The unicorn shader's mane colours, and its body colours with the
// rainicorn's lifted out of the near-black, which does not read as a spark.
vec3 colour(float u, float side, float t){
  if (u < -2.5) return vec3(0.45, 0.82, 1.0);     // a spell's frost
  if (u < -1.5) return vec3(1.0);                 // a promotion's white shower
  if (u < 0.0) return mix(vec3(0.99, 0.95, 0.88), vec3(0.55, 0.40, 0.75), side);
  vec3 sun = hsv(fract(0.95 + u * 0.45 + t * 0.03), 0.7, 1.0);
  vec3 rain = hsv(0.70 + u * 0.25 + 0.03 * sin(t), 0.85, 0.9);
  return mix(sun, rain, side);
}

void main(){
  float r = length(vP);
  if (r > 1.0) discard;
  float a = (1.0 - r * r) * (1.0 - vAge);
  o = vec4(mix(vec3(1.0), colour(vKind.y, vKind.x, uTime), smoothstep(0.0, 0.7, r)), 1.0) * a;
}`;

/** @type {{_x:number,_y:number,_vx:number,_vy:number,_s:number,_age:number,_life:number,_side:number,_u:number}[]} */
const _sparks = [];
let _prog, _u, _batch;

export function initSparks() {
    _prog = program(VS, FS);
    _u = uniforms(_prog, ['uRes', 'uTime']);
    _batch = new Batch(_prog, [4, 2], CAP);
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
    for (let i = 0; i < 28 && _sparks.length < CAP; i++) {
        const a = Math.random() * 6.283, v = (0.12 + Math.random() * 0.3) * k;
        _sparks.push({
            _x: x + (Math.random() - 0.5) * 0.3 * s, _y: y + (0.3 + Math.random() * 0.5) * s,
            _vx: Math.cos(a) * v, _vy: Math.abs(Math.sin(a)) * v + 0.1 * k,
            _s: (0.004 + Math.random() * 0.007) * k,
            _age: 0, _life: 0.5 + Math.random() * 0.5,
            _side: side, _u: i & 1 ? Math.random() : -1,
        });
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
    for (let i = 0; i < 24 && _sparks.length < CAP; i++) {
        const a = Math.random() * 6.283;
        _sparks.push({
            _x: x + (Math.random() - 0.5) * 1.2 * s,
            _y: y + Math.random() * 1.5 * s,
            _vx: Math.cos(a) * 0.06 * k,
            _vy: (0.22 + Math.random() * 0.3) * k,
            _s: (0.003 + Math.random() * 0.005) * k,
            _age: 0, _life: 0.7 + Math.random() * 0.5,
            _side: 0, _u: -2,
        });
    }
}

/**
 * A spell crosses the ground: frost laid the whole way from the caster's horn
 * to what it was aimed at, thickening where it lands. The freeze itself has
 * already happened — a spell does not travel and does not miss — so this is a
 * streak that appears at once and goes out in a third of a second, which is
 * what a bolt looks like anyway.
 * @param {number} x0 the horn
 * @param {number} y0
 * @param {number} x1 what it is aimed at
 * @param {number} y1
 * @param {number} s the caster's size
 */
export function bolt(x0, y0, x1, y1, s) {
    const k = s / NEAR_S;
    const dx = x1 - x0, dy = y1 - y0;
    for (let i = 0; i <= 24 && _sparks.length < CAP; i++) {
        // Three quarters of them strung along the line, the rest scattered
        // over the thing at the end of it.
        const f = i < 18 ? i / 17 : 1;
        const w = (i < 18 ? 0.012 : 0.05) * k;
        _sparks.push({
            _x: x0 + dx * f + (Math.random() - 0.5) * w,
            _y: y0 + dy * f + (Math.random() - 0.5) * w,
            // Drifting on along the line, so the streak draws itself out
            // rather than just fading where it was laid.
            _vx: dx * 0.35, _vy: dy * 0.35 + 0.05 * k,
            _s: (0.005 + Math.random() * 0.005) * k,
            _age: 0, _life: 0.3 + Math.random() * 0.25,
            _side: 0, _u: -3,
        });
    }
}

/** @param {number} dt */
export function stepSparks(dt) {
    for (let i = _sparks.length; i--;) {
        const p = _sparks[i];
        p._age += dt / p._life;
        if (p._age >= 1) { _sparks.splice(i, 1); continue; }
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
    gl.useProgram(_prog);
    _u({ uRes: [width, height], uTime: time });
    _batch.draw();
}
