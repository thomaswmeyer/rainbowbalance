/**
 * The rainbow — which is the HUD, the win condition and the theme at once.
 *
 * Everything the player needs to read is in this one shader, so it takes one
 * number and no others:
 *
 *   balance   −1…+1  who is ahead. 0 is perfect, and the whole arc is there.
 *                    Away from 0 the bow fades out from the winning side's
 *                    foot, further the more lopsided the board, and the
 *                    weather front moves the same way, so the player can
 *                    see *who* is winning, not merely that the board is
 *                    lopsided. At ±1 there is no bow.
 *
 * Sunicorns (warm, +1) are the left side of the screen and bring clear sky;
 * rainicorns (cool, −1) are the right and bring the cloud. The front between
 * the two weathers sits at the middle when level, and balance pushes it: to
 * the left edge when the rainicorns are winning, until the sky is overcast;
 * off the right edge when the sunicorns are, until the sky is clear. There
 * is no sun in the sky: a bow is centred on the point opposite the sun, so
 * the sun is behind the viewer.
 *
 * The sky, the clouds and the ground are in the same pass because they are
 * the same fullscreen triangle and share the lean; splitting them would cost
 * a second draw and a second copy of the palette for nothing.
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
uniform float uTime, uBalance;

const float PI = 3.14159265;
const float HORIZON = -0.18;
const vec2  CENTRE = vec2(0.0, -0.42);
const float R1 = 0.70, W1 = 0.075;
const float R2 = 0.96, W2 = 0.105;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// ---- clouds ----------------------------------------------------------------
// Simplex noise, summed over twisted octaves two ways — soft, and ridged by
// taking the absolute value — with a domain warp. The usual recipe; the
// constants are what make it clouds rather than smoke or marble.

const float CLOUD_SCALE = 0.55;
const float CLOUD_DRIFT = 0.03;
const float CLOUD_DARK = 0.5;
const float CLOUD_LIGHT = 0.6;
const vec3  CLOUD_TINT = vec3(0.46, 0.48, 0.56);
// Base cover on the cloud side of the front.
const float RAIN_COVER = 0.7;
// Half-width of the front, in screen units.
const float FRONT_SOFT = 0.3;
// The cloud layer is a flat sheet overhead; this is its height over the eye.
const float CLOUD_HEIGHT = 0.5;
const float CLOUD_DENSITY = 8.0;
const float CLOUD_SKY_TINT = 0.5;
const mat2 TWIST = mat2(1.6, 1.2, -1.2, 1.6);

vec2 grad(vec2 cell){
  vec2 v = vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)));
  return fract(sin(v) * 43758.5453) * 2.0 - 1.0;
}

// 2D simplex noise, −1…1.
float simplex(vec2 x){
  const float F = 0.366025404, G = 0.211324865;
  vec2 cell = floor(x + (x.x + x.y) * F);
  vec2 d0 = x - cell + (cell.x + cell.y) * G;
  vec2 stp = d0.x > d0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 d1 = d0 - stp + G;
  vec2 d2 = d0 - 1.0 + 2.0 * G;
  vec3 fall = max(0.5 - vec3(dot(d0, d0), dot(d1, d1), dot(d2, d2)), 0.0);
  fall *= fall;
  fall *= fall;
  return 70.0 * dot(fall, vec3(dot(d0, grad(cell)), dot(d1, grad(cell + stp)),
                               dot(d2, grad(cell + 1.0))));
}

// Fractal sum: each octave is twisted and scaled by TWIST and drifts by t.
// Ridged folds every octave through abs(), which creases the smooth blobs
// into cauliflower edges.
float fractal(vec2 x, float t, float amp, float decay, bool ridged, int octaves){
  float sum = 0.0;
  for (int i = 0; i < octaves; i++) {
    float n = amp * simplex(x);
    sum += ridged ? abs(n) : n;
    x = TWIST * x + t;
    amp *= decay;
  }
  return sum;
}

// The sky at p with clouds over it. amount 0…1 scales the whole cloud
// density, so 0 is a clear sky and not merely a thin one.
vec3 clouds(vec2 p, vec3 sky, float amount){
  // A flat sheet overhead seen in perspective: each pixel's ray meets it at
  // a distance that grows toward the horizon, so the clouds are large over
  // the viewer's head and crowd together in the distance.
  float rise = max(p.y - HORIZON, 0.02);
  vec2 base = vec2(p.x, 1.0) * (CLOUD_HEIGHT / rise) * CLOUD_SCALE;
  float t = uTime * CLOUD_DRIFT;
  float warp = fractal(base * 0.5, 0.0, 0.1, 0.4, false, 4);
  vec2 x = base - warp + t;
  float shape = fractal(x, t, 0.7, 0.6, false, 6);
  float ridge = fractal(x, t, 0.8, 0.7, true, 6);
  shape *= ridge + shape;
  float shade = fractal(base * 2.0 - warp + t * 2.0, t * 2.0, 0.4, 0.6, false, 5)
              + fractal(base * 3.0 - warp + t * 3.0, t * 3.0, 0.4, 0.6, true, 5);
  float density = clamp(amount * (RAIN_COVER + CLOUD_DENSITY * shape * ridge + shade), 0.0, 1.0);
  // Lit where thin, dark where thick: the underside of a rain cloud.
  vec3 col = CLOUD_TINT * clamp(CLOUD_DARK + CLOUD_LIGHT * shade, 0.0, 1.0)
           * (1.0 - 0.5 * density);
  // Haze toward the horizon, where the sheet is far away and the noise would
  // otherwise turn to grit.
  float haze = smoothstep(0.25, 0.0, rise);
  col = mix(col, sky, 0.4 * haze);
  density *= 1.0 - 0.6 * haze;
  return mix(sky, clamp(CLOUD_SKY_TINT * sky + col, 0.0, 1.0), density);
}

// ---- the bow -----------------------------------------------------------------

// How much of the arc the fade takes to go from gone to whole.
const float FADE = 0.2;

// The bow's presence along its length. u runs 0 at the right foot to 1 at the
// left. The bow fades out from the winning side's foot — sunicorns ahead
// (b > 0) fade the left — and the fade reaches further along the arc the
// further the board is from level. At b = 0 the whole arc is there; at ±1
// the fade has cleared the far foot and nothing is left.
float along(float u, float b){
  float f = abs(b) * (1.0 + FADE);
  return smoothstep(f - FADE, f, b > 0.0 ? 1.0 - u : u);
}

// One band of the bow. Returns rgb premultiplied by its own coverage in .a.
vec4 bow(float r, float u, float radius, float w, float alpha,
         vec3 lean, float leanAmt, float flip){
  float t = (r - (radius - w * 0.5)) / w;
  if (t < 0.0 || t > 1.0) return vec4(0.0);

  // Red outside, violet inside — the way a real bow is ordered. The secondary
  // bow passes flip = 1 and gets the reverse, which is what a real one does.
  float h = flip > 0.5 ? 1.0 - t : t;
  vec3 col = hsv(mix(0.78, 0.0, h), 1.0, 1.0);
  col = mix(col, lean, leanAmt);

  // Soft edges across the band.
  float cov = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));

  return vec4(col, cov * alpha * along(u, uBalance));
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float b = clamp(uBalance, -1.0, 1.0);
  float lean = abs(b);
  vec3 warm = vec3(1.00, 0.72, 0.32);   // sunicorns
  vec3 cool = vec3(0.42, 0.52, 1.00);   // rainicorns
  vec3 side = b > 0.0 ? warm : cool;
  float asp = uRes.x / uRes.y;

  float hills = HORIZON + 0.013 * sin(p.x * 6.3) + 0.008 * sin(p.x * 13.7 + 1.7);

  // ---- sky ---------------------------------------------------------------
  float up = clamp((p.y - HORIZON) / 0.8, 0.0, 1.0);
  // Sky blue: pale at the horizon, deep and saturated at the zenith.
  vec3 c = mix(vec3(0.72, 0.85, 0.97), vec3(0.22, 0.48, 0.90), up);
  c = mix(c, side, lean * 0.12 * up);

  // ---- clouds ------------------------------------------------------------
  // The front between the sunicorns' weather and the rainicorns'. It sits at
  // the middle when level; balance pushes it off the far edge either way.
  // Only computed above the ground, which is where all the cost of this
  // shader is.
  if (p.y > hills - 0.02) {
    float front = b * (0.5 * asp + FRONT_SOFT);
    c = clouds(p, c, smoothstep(front - FRONT_SOFT, front + FRONT_SOFT, p.x));
  }

  // ---- ground ------------------------------------------------------------
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
  // u is clamped so the arc's continuation below the feet fades with them.
  float r = length(q), u = clamp(atan(q.y, q.x) / PI, 0.0, 1.0);

  // Alexander's band: brighter inside the primary, darker between the two.
  // Soft edges, not step() — a hard edge here draws an aliased circle across
  // the sky — and it fades with the bow that casts it, so that at ±1 it
  // does not hang there as a ghost ring with no bow.
  float inside = 1.0 - smoothstep(R1 - W1 * 0.9, R1 - W1 * 0.3, r);
  float between = smoothstep(R1 + W1 * 0.3, R1 + W1 * 0.9, r)
                * (1.0 - smoothstep(R2 - W2 * 0.9, R2 - W2 * 0.3, r));
  c *= 1.0 + (1.0 - lean) * (0.07 * inside - 0.06 * between);

  // The bow fades from the winning side's foot, which is the side the sky
  // glows on: the glow burns it away. Both cues sit on the same side, and
  // moving either one without the other would make them contradict.
  // The bow stops at the ground. Same soft seam as the horizon, so its feet
  // land on the grass rather than being sliced by it.
  float sky = smoothstep(0.0, 0.006, p.y - hills);
  vec4 p1 = bow(r, u, R1, W1, sky, side, lean * 0.30, 0.0);
  c = mix(c, p1.rgb, p1.a);

  // The second bow: only near-perfect balance earns it. Gone by |b| = 0.08.
  float s2 = 1.0 - smoothstep(0.0, 0.08, lean);
  if (s2 > 0.01) {
    vec4 p2 = bow(r, u, R2, W2, 0.22 * s2 * sky, side, lean * 0.30, 1.0);
    c = mix(c, p2.rgb, p2.a);
  }

  // Halo, so the bow sits in the air rather than on top of it. Squared by
  // multiplication, not pow(): pow() with a negative base is undefined in
  // GLSL, and (r - R1) is negative everywhere inside the arc — which renders
  // as NaN, which renders as a white screen.
  float k = (r - R1) / (W1 * 3.5);
  c += hsv(0.5 + 0.2 * sin(uTime * 0.2), 0.35, 1.0)
       * exp(-k * k) * 0.14 * along(u, b) * sky;

  // Vignette.
  c *= 1.0 - 0.30 * dot(p, p);
  o = vec4(c, 1.0);
}`;

let _prog, _u;

/** Compile the pass. Call once, after the context exists. */
export function initRainbow() {
    _prog = program(FULLSCREEN_VS, FS);
    _u = uniforms(_prog, ['uRes', 'uTime', 'uBalance']);
}

/** @param {number} balance −1…+1, 0 is perfectly held */
export function drawRainbow(balance) {
    gl.useProgram(_prog);
    _u({ uRes: [width, height], uTime: time, uBalance: balance });
    fullscreen();
}
