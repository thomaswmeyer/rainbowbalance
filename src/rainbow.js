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
 * a second draw and a second copy of the palette for nothing. The clouds are
 * a volumetric march and by far the cost of the shader, so they are only
 * computed above the ground.
 *
 * The secondary bow only fades in near perfect balance. It is the reward for
 * playing well, it costs about forty bytes, and it is the first thing anyone
 * will screenshot.
 */

import { g, program, uniforms, fullscreen, gl, FULLSCREEN_VS, time, width, height } from './gl.js';

export const FS = g`#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uBalance;

const float PI = 3.14159265;
const float HORIZON = 0.2;
const vec2  CENTRE = vec2(0.0, -0.42);
const float R1 = 0.70, W1 = 0.075;
const float R2 = 0.85, W2 = 0.075;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// ---- clouds ----------------------------------------------------------------
// Volumetric: a ray per pixel meets a huge sphere whose top is the cloud
// base, then marches up through the layer accumulating absorption through a
// fractal of noise. Derived from https://www.shadertoy.com/view/XtBXDw by
// Valentin Galea, who says: "this shader is part of an open source library
// which is licenced MIT so feel free to use it as you want". Tuned by hand
// on the faithful port, then specialised to what is fixed here (see clouds()).
// Not taken from it: the sun, the checkerboard ground, the mouse camera, the
// Worley and Perlin noise options (value noise was tried against both and
// kept), and the noise-texture lookup (the hash fallback is used instead).
//
// Tuned by hand from the debug panel, which gives a slider to every
// "const float|int NAME = value; // min max" line in this shader. These are
// done, so their ranges are gone and the panel leaves them alone; the grass
// constants below still have theirs. A tunable constant is a uniform on the
// dev page, so none may be used in a constant expression: no "const x = NAME",
// no global initialised from one. (And no backticks anywhere in this shader,
// including comments: it is a JS template literal.)
const float COVERAGE    = 0.664;
const float THICKNESS   = 19.17;
const float ABSORPTION  = 1.045;
const float WIND_SPEED  = 0.147;
const float FBM_FREQ    = 2.739;
const float NOISE_SCALE = 0.022206;
const float STEPS       = 25.0;
const float LIGHT_GAIN  = 1.75;       // lighting is exp(height) / this: brighter toward the top of the layer
const float ATMOS_Y     = -457.75;    // centre of the cloud sphere, below the eye
const float ATMOS_R     = 525.6;      // its radius; base height is ATMOS_Y + ATMOS_R
const float FOV         = 45.7;       // half-angle, degrees
const float FRONT_SOFT  = 0.3046;     // half-width of the weather front, screen units

// Value noise by iq, https://www.shadertoy.com/view/4sfGzS — the hash
// branch, since there is no noise texture to sample.
float hash(float n){ return fract(sin(n) * 753.5453123); }

float noise(vec3 x){
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 157.0 + 113.0 * p.z;
  return mix(mix(mix(hash(n +   0.0), hash(n +   1.0), f.x),
                 mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y),
             mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                 mix(hash(n + 270.0), hash(n + 271.0), f.x), f.y), f.z);
}

float fbm(vec3 p){
  float
  t  = 0.51749673 * noise(p); p *= FBM_FREQ;
  t += 0.25584929 * noise(p); p *= FBM_FREQ;
  t += 0.12527603 * noise(p); p *= FBM_FREQ;
  t += 0.06255931 * noise(p);
  return t;
}

// amount 0…1 scales the coverage, so 0 is a clear sky and not merely a thin one.
float density(vec3 pos, float amount){
  float dens = fbm(pos * NOISE_SCALE + vec3(0.0, 0.0, -uTime * WIND_SPEED));
  float cov = 1.0 - COVERAGE * amount;
  dens *= smoothstep(cov, cov + 0.05, dens);
  return clamp(dens, 0.0, 1.0);
}

// The sky along ray rd (rd.y > 0) with clouds over it, and in .w how much
// of the sky is left showing through them.
//
// The reference's general ray-sphere hit, specialised to what is fixed here:
// the eye is the origin and always inside the sphere. The reference's
// separate alpha accumulator is 1 - T exactly, so T is used directly, and
// the final mix(sky, C / alpha, alpha) is sky * T + C.
vec4 clouds(vec3 rd, vec3 sky, float amount){

  // Where the ray leaves the sphere: the cloud base.
  float tca = ATMOS_Y * rd.y;
  vec3 pos = rd * (tca + sqrt(ATMOS_R * ATMOS_R - ATMOS_Y * ATMOS_Y + tca * tca));

  // Steps rise THICKNESS / STEPS each, whatever the ray's slant, so the march
  // always spans the layer and a grazing ray sees more of it.
  float march_step = THICKNESS / STEPS;
  vec3 dir_step = rd / rd.y * march_step;

  float T = 1.0;
  vec3 C = vec3(0.0);
  for (float i = 0.0; i < STEPS; i++) {
    float dens = density(pos, amount);
    float T_i = exp(-ABSORPTION * dens * march_step);
    if (T * T_i < 0.01) break;
    T *= T_i;
    C += T * exp(i / STEPS) / LIGHT_GAIN * dens * march_step;
    pos += dir_step;
    if (length(pos) > 1e3) break;
  }
  return vec4(sky * T + C, T);
}

// ---- ground ----------------------------------------------------------------
// The hills are a heightfield, after David Hoskins' "Rolling ball"
// (https://www.shadertoy.com/view/lsfXz4): three octaves of value noise,
// found by marching the view ray in steps that grow with distance until it
// is under the surface, then homing in by halving. That shader is
// CC BY-NC-SA, so no code is taken from it; this is written from an
// understanding of how it works. The camera is the clouds' camera, so the
// hills stand against the sky where they actually are, and slopes take the
// light: the sun is behind the viewer, where a bow's sun always is.
const float HILL_AMP     = 6.78;        // 0 30     height of the hills
const float HILL_FREQ    = 0.010722;       // 0.002 0.1  size of the hills: smaller is wider
const float EYE          = 6.9975;        // 0.5 12   eye height over the ground under it
const int   HILL_STEPS   = 40;         // 8 100
const float FAR          = 1000.0;      // 20 1000  ground beyond this is sky
const float SUN_ELEV     = 35.04;       // 0 80     degrees above the horizon, behind the viewer
const float AMBIENT      = 0.4;        // 0 1      light on a slope facing away from the sun
// A ray flatter than this sees the clouds as if at this slant. Below it the
// cloud march takes one sample and quits, or walks backwards and finds
// nothing, so ground that falls away or is beyond FAR, and the fog on the
// way there, would show bare gradient in the shape of the hills.
const float SKY_MIN      = 0.071885;       // 0.005 0.2
// Rain. It began as a bug: every ray under the horizon sampled the clouds
// along the same clamped direction, which extruded the cloud base straight
// down in screen columns, and through the fog that read as shafts of rain
// under the cloud, fading before the ground. Kept, and made to fall.
const float RAIN         = 0.6;        // 0 1      how dark the shafts are
const float RAIN_SPEED   = 0.028;        // 0 2
const float RAIN_SCALE   = 16.65;       // 10 200   shafts per screen width, roughly

// Dave Hoskins, "Hash without Sine", https://www.shadertoy.com/view/4djSRW (MIT).
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise2(vec2 x){
  vec2 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash22(p).x, hash22(p + vec2(1, 0)).x, f.x),
             mix(hash22(p + vec2(0, 1)).x, hash22(p + vec2(1, 1)).x, f.x), f.y);
}

float fractal2(vec2 x){
  float w = 0.7, f = 0.0;
  for (int i = 0; i < 3; i++) { f += noise2(x) * w; w *= 0.6; x *= 2.0; }
  return f;
}

// Nearest cell: x is the distance to it folded into a cone, 0.4 at the
// centre and 0 at the rim; y is the cell's id.
vec2 voronoi(vec2 x){
  vec2 p = floor(x), f = fract(x);
  float res = 100.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(i, j);
      vec2 h = hash22(p + b);
      vec2 r = b - f + h;
      float d = dot(r, r);
      if (d < res) { res = d; id = h.y; }
    }
  return vec2(max(0.4 - sqrt(res), 0.0), id);
}

float terrain(vec2 p){
  p *= HILL_FREQ;
  float w = HILL_AMP, f = 0.0;
  for (int i = 0; i < 3; i++) { f += noise2(p) * w; w *= 0.62; p *= 2.6; }
  return f;
}

// Distance along rd from ro to the ground, or -1 for sky.
float ground(vec3 ro, vec3 rd){
  float t = 1.0, old = 0.0;
  bool hit = false;
  for (int i = 0; i < HILL_STEPS; i++) {
    vec3 q = ro + rd * t;
    // Over the highest possible hill and climbing, or too far to matter.
    if (q.y > HILL_AMP * 2.0 && rd.y > 0.0 || t > FAR) break;
    float h = q.y - terrain(q.xz);
    if (h < 0.05) { hit = true; break; }
    old = t;
    t += h + t * 0.03;
  }
  if (!hit) return -1.0;
  for (int i = 0; i < 5; i++) {
    float m = (old + t) * 0.5;
    vec3 q = ro + rd * m;
    if (q.y - terrain(q.xz) < 0.05) t = m; else old = m;
  }
  return t;
}

vec3 normal(vec2 xz){
  vec2 e = vec2(0.1, 0.0);
  float h = terrain(xz);
  return normalize(vec3(h - terrain(xz + e), e.x, h - terrain(xz + e.yx)));
}

// ---- grass -----------------------------------------------------------------
// The far field of the blades in the same shader of Hoskins': a Voronoi
// cell field on the ground, each cell a cone whose radius shrinks with
// height, so a cell is a blade, swayed by time to bend the tips, and marched
// through in soft steps whose softness grows with distance, so the far field
// blurs into a carpet. Nothing here is ever close enough to want a blade, so
// the march is gone and only what it converges to is kept: the blade field
// sampled once at one height, as a texture on the ground, fading with
// distance into a mottle of noise, with wind as waves of brightness moving
// over the field. The side under clear sky is sunlit and the side under
// cloud is shaded, from the same weather front the clouds use.
const float BLADE_SCALE  = 3.8;        // 0.5 8    blades per ground unit
const float BLADE_HEIGHT = 0.6135;        // 0 1.5    where in the blade the field is sampled: higher is sparser and tippier
const float BLADE_FADE   = 16.742;       // 2 80     distance by which blades have blurred into mottle
const float BLADE_SWAY   = 0.114;        // 0 2      wind bending the blades
const float TIP          = 1.0;        // 0 1      how much a blade's tip lightens
const float MOTTLE       = 0.03;       // 0.005 0.2  scale of the patchiness in the green
const float WAVE         = 0.25;       // 0 1      wind as waves of brightness over the field
const float WAVE_SCALE   = 0.15;       // 0.02 1
const float WAVE_SPEED   = 0.8;        // 0 4
const float FOG          = 0.00022;      // 0 0.02   fog toward the sky, per distance squared
const float SHADE        = 0.975;        // 0 1      ground brightness under cloud, relative to sun
const float DAPPLE       = 0.526;        // 0 1      patchy shadow strength

// The ground at pos, seen from dist away, with normal nor. sun 0…1 is how
// clear the sky over it is.
vec3 grass(vec3 pos, vec3 nor, float dist, float sun){
  vec2 g = pos.xz;

  // The blade field at one height. Higher up a blade's cone is thinner, so
  // the field is sparser and more of it is tip.
  float y = BLADE_HEIGHT * BLADE_HEIGHT;
  vec2 sway = vec2(sin(uTime * 2.3 + 0.5 * g.y), sin(uTime * 3.6 + 0.5 * g.x)) * y * BLADE_SWAY;
  vec2 v = voronoi(g * BLADE_SCALE + sway);
  float blade = clamp((v.x * 0.6 + y * 0.58) * 1.5, 0.0, 1.0);

  vec3 mat = mix(vec3(0.16, 0.42, 0.10), vec3(0.30, 0.55, 0.12), noise2(g * MOTTLE));
  vec3 soil = vec3(0.10, 0.16, 0.05);
  vec3 tip = mix(mat, vec3(0.65, 0.78, 0.25), TIP * v.y);
  vec3 near = mix(soil, mix(mat, tip, blade * blade), blade);
  // Too far for blades: the field's average, which is the mottled green.
  vec3 c = mix(near, mat * 0.8, smoothstep(0.0, BLADE_FADE, dist));

  // Wind, as it reads from far off: waves of light moving across the field.
  c *= 1.0 - WAVE * (1.0 - noise2(g * WAVE_SCALE + uTime * WAVE_SPEED * vec2(0.7, 0.4)));

  // Light. Patchy either way. In the sun, slopes facing the viewer are lit
  // and the others fall to AMBIENT; under the cloud, flat, cool and dim.
  float dapple = 1.0 - DAPPLE * (1.0 - fractal2(g * 0.1));
  vec3 sun_dir = vec3(0.0, sin(radians(SUN_ELEV)), cos(radians(SUN_ELEV)));
  float lit = mix(AMBIENT, 1.0, max(dot(nor, sun_dir), 0.0));
  vec3 light = mix(vec3(0.55, 0.62, 0.80) * SHADE, vec3(1.15, 1.05, 0.85) * lit, sun);
  return c * dapple * light;
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

// The sky along rd, or, for a ray flatter than SKY_MIN, the sky at the
// horizon under it: the clouds seen at that slant, and under dense cloud,
// streaked downward as rain. p is the screen point, for the streaks.
vec3 horizon_sky(vec2 p, vec3 rd, vec3 sky, float amount){
  float below = 1.0 - smoothstep(SKY_MIN - 0.03, SKY_MIN, rd.y);
  vec4 k = clouds(normalize(vec3(rd.x, max(rd.y, SKY_MIN), rd.z)), sky, amount);
  // Long thin cells of noise in screen space, scrolling down, darkening
  // the smear where the cloud over it is dense. Under clear sky there is
  // nothing dense and no rain.
  float streak = noise2(vec2(p.x * RAIN_SCALE, (p.y + uTime * RAIN_SPEED) * RAIN_SCALE * 0.08));
  return k.rgb * (1.0 - RAIN * (1.0 - k.w) * streak * below);
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float b = clamp(uBalance, -1.0, 1.0);
  float lean = abs(b);
  vec3 warm = vec3(1.00, 0.72, 0.32);   // sunicorns
  vec3 cool = vec3(0.42, 0.52, 1.00);   // rainicorns
  vec3 side = b > 0.0 ? warm : cool;
  float asp = uRes.x / uRes.y;

  // ---- sky ---------------------------------------------------------------
  float up = clamp((p.y - HORIZON) / 0.8, 0.0, 1.0);
  // Sky blue: pale at the horizon, deep and saturated at the zenith.
  vec3 c = mix(vec3(0.72, 0.85, 0.97), vec3(0.22, 0.48, 0.90), up);
  c = mix(c, side, lean * 0.12 * up);

  // ---- the weather front -------------------------------------------------
  // Between the sunicorns' weather and the rainicorns'. It sits at the
  // middle when level; balance pushes it off the far edge either way. The
  // clouds cover one side of it and the ground is shaded under them.
  float front = b * (0.5 * asp + FRONT_SOFT);
  float amount = smoothstep(front - FRONT_SOFT, front + FRONT_SOFT, p.x);

  // ---- the world ---------------------------------------------------------
  // One camera for clouds and ground: at the origin, level, looking down -z,
  // with the horizon on HORIZON. The frame is scaled so the reference's fov
  // means the same thing: its frame is ±1 tall, p is ±0.5.
  vec3 rd = normalize(vec3(-p.x, p.y - HORIZON, -0.5 / tan(radians(FOV))));
  vec3 ro = vec3(0.0, terrain(vec2(0.0)) + EYE, 0.0);
  float t = ground(ro, rd);
  if (t < 0.0) {
    c = horizon_sky(p, rd, c, amount);
  } else {
    vec3 pos = ro + rd * t;
    float fog = clamp(t * t * FOG, 0.0, 1.0);
    // Distant ground fades to the sky it is under. The march is only paid
    // for where the fog would show it.
    vec3 horizon = fog > 0.02 ? horizon_sky(p, rd, c, amount) : c;
    c = mix(grass(pos, normal(pos.xz), t, 1.0 - amount), horizon, fog);
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
  float sky = smoothstep(0.0, 0.006, p.y+0.35);
  vec4 p1 = bow(r, u, R1, W1, sky, side, lean * 0.30, 0.0);
  c = mix(c, p1.rgb, p1.a);

  // The second bow: only near-perfect balance earns it. Gone by |b| = 0.08.
  float s2 = 1.0 - smoothstep(0.0, 0.08, lean);
  if (s2 > 0.01) {
    vec4 p2 = bow(r, u, R2, W2, 0.22 * s2 * sky, side, lean * 0.30, 1.0);
    c = mix(c, p2.rgb, p2.a);
  }

  // // Halo, so the bow sits in the air rather than on top of it. Squared by
  // // multiplication, not pow(): pow() with a negative base is undefined in
  // // GLSL, and (r - R1) is negative everywhere inside the arc — which renders
  // // as NaN, which renders as a white screen.
  // float k = (r - R1) / (W1 * 3.5);
  // c += hsv(0.5 + 0.2 * sin(uTime * 0.2), 0.35, 1.0)
  //      * exp(-k * k) * 0.14 * along(u, b) * sky;

  // // Vignette.
  // c *= 1.0 - 0.30 * dot(p, p);
  o = vec4(c, 1.0);
}`;

let _prog, _u;

/** Compile the pass. Call once, after the context exists. */
export function initRainbow() {
    _prog = program(FULLSCREEN_VS, FS);
    _u = uniforms(_prog, ['uRes', 'uTime', 'uBalance']);
}


/**
 * Dev only. Swap in a variant of the shader whose tunable constants are
 * uniforms (the debug panel writes that variant), so the panel can drive
 * them live without a recompile. Returns a setter taking name → value; the
 * values are applied on every draw.
 * @param {string} src
 * @param {string[]} names the uniform names in that variant
 * @returns {(values: Record<string, number>) => void}
 */
export function tuneWith(src, names) {
    if (!__DEBUG__) return () => {};
    _prog = program(FULLSCREEN_VS, src);
    _u = uniforms(_prog, ['uRes', 'uTime', 'uBalance', ...names]);
    return (values) => { _tweaks = values; };
}
let _tweaks = {};

/** @param {number} balance −1…+1, 0 is perfectly held */
export function drawRainbow(balance) {
    gl.useProgram(_prog);
    _u({ uRes: [width, height], uTime: time, uBalance: balance });
    if (__DEBUG__) _u(_tweaks);
    fullscreen();
}
