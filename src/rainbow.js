/**
 * The rainbow — which is the HUD, the win condition and the theme at once.
 *
 * Everything the player needs to read is in this one shader, so it takes two
 * numbers and no others:
 *
 *   balance   −1…+1  who is ahead. 0 is perfect. The sign decides which end of
 *                    the arc frays first and which way the whole sky leans, so
 *                    the player can see *who* is winning, not merely that the
 *                    board is lopsided.
 *   integrity  0…1   what is left of the bow. This is the health bar: it
 *                    erodes while the board stays lopsided and recovers while
 *                    it is level. At 0 the run is over.
 *
 * The sky and the ground are in the same pass because they are the same
 * fullscreen triangle and share the lean; splitting them would cost a second
 * draw and a second copy of the palette for nothing.
 *
 * The secondary bow only fades in near perfect balance. It is the reward for
 * playing well, it costs about forty bytes, and it is the first thing anyone
 * will screenshot.
 */

import { g, program, uniforms, fullscreen, gl, FULLSCREEN_VS, time, width, height } from './gl.js';

const FS = g`#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uBalance, uIntegrity;

const float PI = 3.14159265;
const float HORIZON = -0.18;
const vec2  CENTRE = vec2(0.0, -0.42);
const float R1 = 0.70, W1 = 0.075;
const float R2 = 0.96, W2 = 0.105;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

float hash(float n){ return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }

// One band of the bow. Returns rgb premultiplied by its own coverage in .a.
vec4 bow(float r, float a, float radius, float w, float lo, float hi, float alpha,
         vec3 lean, float leanAmt, float flip){
  float t = (r - (radius - w * 0.5)) / w;
  if (t < 0.0 || t > 1.0) return vec4(0.0);

  // Red outside, violet inside — the way a real bow is ordered. The secondary
  // bow passes flip = 1 and gets the reverse, which is what a real one does.
  float h = flip > 0.5 ? 1.0 - t : t;
  vec3 col = hsv(mix(0.78, 0.0, h), 0.35 + 0.65 * uIntegrity, 1.0);
  col = mix(col, lean, leanAmt);

  // Soft edges across the band.
  float cov = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));

  // The arc runs a = 0 (right) to a = PI (left). Erosion eats it from both
  // ends, faster on the side that is losing.
  cov *= smoothstep(lo, lo + 0.14, a) * (1.0 - smoothstep(hi - 0.14, hi, a));

  // Ragged holes along its length: a coarse per-segment hash, thresholded by
  // what is left. The bow breaks into fragments rather than simply fading,
  // which reads as damage instead of as a dimmer switch.
  //
  // The cut edge sits *below* the threshold (smoothstep(cut - w, cut, n)) so
  // that at integrity 1 the cut is 0, every hash clears it, and the bow is
  // unbroken — an arc with holes in it at full health would read as a bug.
  // The flicker scales with the damage for the same reason.
  float dmg = 1.0 - uIntegrity;
  float seg = floor(a * 26.0);
  float n = hash(seg) + 0.07 * dmg * sin(uTime * 1.7 + hash(seg + 9.0) * 40.0);
  cov *= smoothstep(dmg * 1.1 - 0.12, dmg * 1.1, n);

  return vec4(col, cov * alpha);
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float b = clamp(uBalance, -1.0, 1.0);
  float lean = abs(b);
  vec3 warm = vec3(1.00, 0.72, 0.32);   // sunicorns
  vec3 cool = vec3(0.42, 0.52, 1.00);   // rainicorns
  vec3 side = b > 0.0 ? warm : cool;

  // ---- sky ---------------------------------------------------------------
  float up = clamp((p.y - HORIZON) / 0.8, 0.0, 1.0);
  vec3 c = mix(vec3(0.62, 0.78, 0.94), vec3(0.07, 0.10, 0.30), up);
  c = mix(c, side, lean * 0.28 * up);
  // A glow low on the winning side: the board's state visible even off the bow.
  c += side * lean * 0.22 * smoothstep(-0.1, 0.8, p.x * sign(b))
            * (1.0 - smoothstep(-0.1, 0.45, p.y));

  // ---- ground ------------------------------------------------------------
  float hills = HORIZON + 0.013 * sin(p.x * 6.3) + 0.008 * sin(p.x * 13.7 + 1.7);
  if (p.y < hills) {
    float d = hills - p.y;
    vec3 grass = mix(vec3(0.38, 0.62, 0.31), vec3(0.07, 0.19, 0.12),
                     smoothstep(0.0, 0.55, d));
    // Wind. Flat ground with no motion reads as a dead backdrop, and this is
    // three terms of sine.
    grass *= 0.965 + 0.035 * sin(p.x * 44.0 + sin(p.y * 26.0 + uTime * 0.7) * 1.6
                                 + uTime * 0.35);
    c = mix(grass, c, smoothstep(0.0, 0.006, -d));   // soft horizon seam
  }

  // ---- the bow -----------------------------------------------------------
  vec2 q = p - CENTRE;
  float r = length(q), a = atan(q.y, q.x);

  // Alexander's band: brighter inside the primary, darker between the two.
  // Soft edges, not step() — a hard edge here draws an aliased circle across
  // the sky — and it fades with the bow that casts it.
  float inside = 1.0 - smoothstep(R1 - W1 * 0.9, R1 - W1 * 0.3, r);
  float between = smoothstep(R1 + W1 * 0.3, R1 + W1 * 0.9, r)
                * (1.0 - smoothstep(R2 - W2 * 0.9, R2 - W2 * 0.3, r));
  c *= 1.0 + uIntegrity * (0.07 * inside - 0.06 * between);

  // The losing side's half of the bow goes first: with b > 0 (sunicorns
  // ahead) the sky glows on the right and the left end is eaten. Flipping
  // either of these without the other would make the two cues contradict.
  float eaten = 1.0 - uIntegrity;
  float lo = eaten * (0.55 + 0.75 * max(-b, 0.0)) * 1.5;
  float hi = PI - eaten * (0.55 + 0.75 * max(b, 0.0)) * 1.5;

  vec4 p1 = bow(r, a, R1, W1, lo, hi, 1.0, side, lean * 0.30, 0.0);
  c = mix(c, p1.rgb, p1.a);

  // The second bow: only near-perfect balance earns it.
  float s2 = uIntegrity * uIntegrity * uIntegrity * (1.0 - lean);
  if (s2 > 0.01) {
    vec4 p2 = bow(r, a, R2, W2, lo, hi, 0.22 * s2, side, lean * 0.30, 1.0);
    c = mix(c, p2.rgb, p2.a);
  }

  // Halo, so the bow sits in the air rather than on top of it. Squared by
  // multiplication, not pow(): pow() with a negative base is undefined in
  // GLSL, and (r - R1) is negative everywhere inside the arc — which renders
  // as NaN, which renders as a white screen.
  float k = (r - R1) / (W1 * 3.5);
  c += hsv(0.5 + 0.2 * sin(uTime * 0.2), 0.35, 1.0)
       * exp(-k * k) * 0.14 * uIntegrity
       * smoothstep(lo, lo + 0.3, a) * (1.0 - smoothstep(hi - 0.3, hi, a));

  // Vignette.
  c *= 1.0 - 0.30 * dot(p, p);
  o = vec4(c, 1.0);
}`;

let _prog, _u;

/** Compile the pass. Call once, after the context exists. */
export function initRainbow() {
    _prog = program(FULLSCREEN_VS, FS);
    _u = uniforms(_prog, ['uRes', 'uTime', 'uBalance', 'uIntegrity']);
}

/**
 * @param {number} balance   −1…+1, 0 is perfectly held
 * @param {number} integrity 0…1, what is left of the bow
 */
export function drawRainbow(balance, integrity) {
    gl.useProgram(_prog);
    _u({ uRes: [width, height], uTime: time, uBalance: balance, uIntegrity: integrity });
    fullscreen();
}
