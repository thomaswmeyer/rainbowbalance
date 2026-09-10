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
 * Three shaders. The world — sky, clouds, hills, grass — is one fullscreen
 * pass, drawn first. The bow is a premultiplied layer of the two arcs and
 * the light and shade around them. Each castle is a pass of its own, so
 * main.js can order castles, bow and unicorns by depth: the herd behind the
 * castles, then the bow, then the castles, then the herd in front. The
 * clouds are a volumetric march and by far the cost of the world pass, so
 * they are only computed above the ground.
 *
 * The secondary bow only fades in near perfect balance. It is the reward for
 * playing well, it costs about forty bytes, and it is the first thing anyone
 * will screenshot.
 */

import { g, program, uniforms, fullscreen, gl, FULLSCREEN_VS, time, width, height } from './gl.js';

/** The world. */
export const FS = g`#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uBalance;

// Feature switches. Compile-time, so a feature that is off is not in the
// shader at all; the debug panel recompiles with these flipped to show what
// each one costs in frame rate. All true in the build.
// (Ints, not bools: the minifier folds "1 == 0" and drops the dead branch,
// and does not fold "!true".)
const int CLOUDS_ON = 1;
const int GRASS_ON  = 1;

const float HORIZON = 0.2;

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
// Tuned by hand from a slider panel that is in git history (commit 0e0063e):
// it turned every "const … // min max" line into a uniform on the dev page.
// Keep these constants out of constant expressions so it can come back: no
// "const x = NAME", no global initialised from one. (And no backticks
// anywhere in this shader, including comments: it is a JS template literal.)
const float COVERAGE    = 0.664;
const float THICKNESS   = 19.17;
const float ABSORPTION  = 1.045;
const float WIND_SPEED  = 0.147;
const float FBM_FREQ    = 2.739;
const float NOISE_SCALE = 0.011633;
// The cost of the clouds, all four of it: steps through the layer, octaves
// of noise per step, the fog below which ground does not bother, and how far
// a grazing march goes before giving up.
const float STEPS       = 16.78;
const int   OCTAVES     = 3;
const float FOG_CUT     = 0.5;
const float CLOUD_FAR   = 317.5;
const float LIGHT_GAIN  = 1.75;       // lighting is exp(height) / this: brighter toward the top of the layer
const float ATMOS_Y     = -465.71;  // centre of the cloud sphere, below the eye
const float ATMOS_R     = 468.2;  // its radius; base height is ATMOS_Y + ATMOS_R
const float FOV         = 30.0;  // half-angle, degrees
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
  float t = 0.0, w = 0.51749673;
  for (int i = 0; i < OCTAVES; i++) { t += w * noise(p); w *= 0.494; p *= FBM_FREQ; }
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
    if (length(pos) > CLOUD_FAR) break;
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
const float HILL_AMP     = 4.56;  // height of the hills
const float HILL_FREQ    = 0.01719;  // size of the hills: smaller is wider
const float EYE          = 8.596;  // eye height over the ground under it
const int   HILL_STEPS   = 31;
const float FAR          = 1000.0;     // ground beyond this is sky
const float SUN_ELEV     = 35.04;  // degrees above the horizon, behind the viewer
const float AMBIENT      = 0.4;  // light on a slope facing away from the sun
// A ray flatter than this sees the clouds as if at this slant. Below it the
// cloud march takes one sample and quits, or walks backwards and finds
// nothing, so ground that falls away or is beyond FAR, and the fog on the
// way there, would show bare gradient in the shape of the hills.
const float SKY_MIN      = 0.02723;
// Rain. It began as a bug: every ray under the horizon sampled the clouds
// along the same clamped direction, which extruded the cloud base straight
// down in screen columns, and through the fog that read as shafts of rain
// under the cloud, fading before the ground. Kept, and made to fall.
const float RAIN         = 0.6;  // how dark the shafts are
const float RAIN_SPEED   = 0.028;
const float RAIN_SCALE   = 52.292;  // shafts per screen width, roughly

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
const float BLADE_SCALE  = 3.8;  // blades per ground unit
const float BLADE_HEIGHT = 0.6135;  // where in the blade the field is sampled: higher is sparser and tippier
const float BLADE_FADE   = 16.742;  // distance by which blades have blurred into mottle
const float BLADE_SWAY   = 0.114;  // wind bending the blades
const float TIP          = 1.0;  // how much a blade's tip lightens
const float MOTTLE       = 0.03;  // scale of the patchiness in the green
const float WAVE         = 0.25;  // wind as waves of brightness over the field
const float WAVE_SCALE   = 0.15;
const float WAVE_SPEED   = 0.8;
const float FOG          = 0.00022;  // fog toward the sky, per distance squared
const float SHADE        = 0.975;  // ground brightness under cloud, relative to sun
const float DAPPLE       = 0.526;  // patchy shadow strength

// The ground at pos, seen from dist away, with normal nor. sun 0…1 is how
// clear the sky over it is.
vec3 grass(vec3 pos, vec3 nor, float dist, float sun){
  if (GRASS_ON == 0) return vec3(0.2, 0.45, 0.1);
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

// The sky along rd, or, for a ray flatter than SKY_MIN, the sky at the
// horizon under it: the clouds seen at that slant, and under dense cloud,
// streaked downward as rain. p is the screen point, for the streaks.
vec3 horizon_sky(vec2 p, vec3 rd, vec3 sky, float amount){
  if (CLOUDS_ON == 0) return sky;
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

  // ---- what the ray hit, and the sky beyond it ---------------------------
  // The cloud march is the cost of this shader, and it is called from
  // exactly one place: every call site inlines its own copy, and two extra
  // copies once made the whole program slow for every pixel. So the sky this
  // ray sees, or would see past what it hits, is computed once here. It is
  // only paid for where the fog would show it.
  float fog = t < 0.0 ? 1.0 : clamp(t * t * FOG, 0.0, 1.0);
  vec3 horizon = fog > FOG_CUT ? horizon_sky(p, rd, c, amount) : c;
  vec3 surf = horizon;
  if (t >= 0.0) {
    vec3 pos = ro + rd * t;
    surf = grass(pos, normal(pos.xz), t, 1.0 - amount);
  }
  c = mix(surf, horizon, fog);

  o = vec4(c, 1.0);
}`;

/**
 * The bow, as a layer over everything. Premultiplied: rgb is light added,
 * alpha is how much of what is underneath is covered, and gl.js blends with
 * ONE, ONE_MINUS_SRC_ALPHA.
 */
export const BOW_FS = g`#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uBalance;

// Feature switch, as in the world shader.
const int BOW_ON = 1;

const float PI = 3.14159265;
// Keep CENTRE, R1 and FOOT in step with the world shader, which places the
// castles under the bow's feet from them.
const vec2  CENTRE = vec2(0.0, -0.31);
const float R1 = 0.70, W1 = 0.075;
const float R2 = 0.85, W2 = 0.075;
const float FOOT = -0.24;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

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
  o = vec4(0.0);
  if (BOW_ON == 0) return;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float b = clamp(uBalance, -1.0, 1.0);
  float lean = abs(b);
  vec3 side = b > 0.0 ? vec3(1.00, 0.72, 0.32) : vec3(0.42, 0.52, 1.00);

  vec2 q = p - CENTRE;
  // u is clamped so the arc's continuation below the feet fades with them.
  float r = length(q), u = clamp(atan(q.y, q.x) / PI, 0.0, 1.0);

  // Alexander's band: brighter inside the primary, darker between the two.
  // Soft edges, not step() — a hard edge here draws an aliased circle across
  // the sky — and it fades with the bow that casts it, so that at ±1 it
  // does not hang there as a ghost ring with no bow. As a layer, the
  // brightening is light added and the darkening is cover.
  float inside = 1.0 - smoothstep(R1 - W1 * 0.9, R1 - W1 * 0.3, r);
  float between = smoothstep(R1 + W1 * 0.3, R1 + W1 * 0.9, r)
                * (1.0 - smoothstep(R2 - W2 * 0.9, R2 - W2 * 0.3, r));
  vec4 c = vec4(vec3(0.035 * inside), 0.06 * between) * (1.0 - lean);

  // The bow fades from the winning side's foot, which is the side the sky
  // glows on: the glow burns it away. Both cues sit on the same side, and
  // moving either one without the other would make them contradict.
  // The bow stops at FOOT, where the castles stand.
  float sky = smoothstep(0.0, 0.006, p.y - FOOT);
  vec4 p1 = bow(r, u, R1, W1, sky, side, lean * 0.30, 0.0);
  c = c * (1.0 - p1.a) + vec4(p1.rgb, 1.0) * p1.a;

  // The second bow: only near-perfect balance earns it. Gone by |b| = 0.08.
  float s2 = 1.0 - smoothstep(0.0, 0.08, lean);
  if (s2 > 0.01) {
    vec4 p2 = bow(r, u, R2, W2, 0.22 * s2 * sky, side, lean * 0.30, 1.0);
    c = c * (1.0 - p2.a) + vec4(p2.rgb, 1.0) * p2.a;
  }
  // Half transparent. Premultiplied, so colour and cover scale together.
  o = c * 0.5;
}`;

/**
 * A castle, as a pass of its own: main.js draws one per castle, in depth
 * order with the bow and the herd. uFoot says which: 0 the sunicorns' at the
 * bow's left foot, sandstone; 1 the rainicorns' at the right, obsidian.
 * Fragments that miss the castle, or that a hill is in front of, discard.
 * The ground and camera code is the world shader's, repeated: two template
 * literals cannot share it, and the packer folds the repeat away.
 */
export const CASTLE_FS = g`#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uBalance, uFoot;

const int CASTLE_ON = 1;

const float HORIZON = 0.2;
const float FOV     = 30.0;       // half-angle, degrees; the world's
const float FRONT_SOFT = 0.3046;  // the world's
const float SHADE   = 0.975;      // the ground's, so castle and grass agree under cloud
const float FOG     = 0.00022;    // the ground's
// The bow's centre and primary radius, which with FOOT below place the
// castles. Keep in step with BOW_FS.
const vec2  CENTRE = vec2(0.0, -0.31);
const float R1 = 0.70;

const float HILL_AMP     = 4.56;  // height of the hills
const float HILL_FREQ    = 0.01719;  // size of the hills: smaller is wider
const float EYE          = 8.596;  // eye height over the ground under it
const int   HILL_STEPS   = 31;
const float FAR          = 1000.0;     // ground beyond this is sky
const float SUN_ELEV     = 35.04;  // degrees above the horizon, behind the viewer
const float AMBIENT      = 0.4;  // light on a slope facing away from the sun
// A ray flatter than this sees the clouds as if at this slant. Below it the
// cloud march takes one sample and quits, or walks backwards and finds
// nothing, so ground that falls away or is beyond FAR, and the fog on the
// way there, would show bare gradient in the shape of the hills.
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

// ---- castles ---------------------------------------------------------------
// A signed distance field, marched only inside a bounding sphere so it
// costs a few percent of the screen. Built the way the buildings in dr2's
// "Sand Album" (https://www.shadertoy.com/view/WtjSzR, CC BY-NC-SA, so no
// code from it) are built: one wall and one tower, folded by symmetry into
// four; battlements as a small box repeated along the wall top
// and cut away; a keep in the middle; a gate cut from the front before the
// fold, so only the front has one. The primitives are iq's.
//
// The castle sits on the terrain where the ray through the bow's foot lands,
// facing the camera, so the bow comes down behind it.
const float CASTLE_NEAR  = 1.0;  // of the way from the eye to where the foot's ray meets the ground
const float CASTLE_SCALE = 0.5864;
const float FOOT         = -0.24;      // where on screen the bow's feet stand
const int   CASTLE_STEPS = 52;

float sdBox(vec3 p, vec3 b){
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float sdCyl(vec3 p, float r, float h){
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// q: castle-local, y up from the base, +x toward the camera, unit scale.
float castle(vec3 q){
  // The gate, an arch through the front wall, cut before the fold.
  float gate = max(abs(q.x - 1.0) - 0.3, length(vec2(q.z, q.y - clamp(q.y, -1.0, 0.45))) - 0.18);

  // Fold eight ways: whatever is built at +x, mirrored in z, now stands on
  // every side.
  q.xz = abs(q.xz);
  if (q.z > q.x) q.xz = q.zx;

  float wall = sdBox(q - vec3(1.0, 0.45, 0.0), vec3(0.15, 0.45, 1.0));
  // Battlements: notches every 0.3 along the top.
  wall = max(wall, -sdBox(vec3(q.x - 1.0, q.y - 0.9, mod(q.z + 0.15, 0.3) - 0.15), vec3(0.3, 0.12, 0.075)));
  wall = max(wall, -gate);

  float keep = min(sdBox(q - vec3(0.0, 0.85, 0.0), vec3(0.45, 0.85, 0.45)),
                   length(q - vec3(0.0, 1.7, 0.0)) - 0.45);

  q.z = abs(q.z) - 1.0;
  float tower = min(sdCyl(q - vec3(1.0, 0.7, 0.0), 0.28, 0.7),
                    length(q - vec3(1.0, 1.4, 0.0)) - 0.28);

  return min(min(wall, keep), tower);
}

// World point to castle-local: cp is the base, f the ground direction from
// the castle toward the camera.
vec3 toCastle(vec3 p, vec3 cp, vec2 f){
  vec3 q = (p - cp) / CASTLE_SCALE;
  q.xz = vec2(dot(q.xz, f), dot(q.xz, vec2(-f.y, f.x)));
  return q;
}

// Distance along rd to the castle, or -1. The march runs only between the
// two crossings of a sphere around it.
float castleHit(vec3 ro, vec3 rd, vec3 cp, vec2 f){
  vec3 oc = ro - (cp + vec3(0.0, 1.2 * CASTLE_SCALE, 0.0));
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + 3.0 * CASTLE_SCALE * CASTLE_SCALE;
  if (h < 0.0) return -1.0;
  h = sqrt(h);
  float t = max(-b - h, 0.0), t1 = -b + h;
  for (int i = 0; i < CASTLE_STEPS; i++) {
    float d = castle(toCastle(ro + rd * t, cp, f)) * CASTLE_SCALE;
    if (d < 0.005) return t;
    t += d;
    if (t > t1) break;
  }
  return -1.0;
}

vec3 castleNormal(vec3 p, vec3 cp, vec2 f){
  vec2 e = vec2(0.01, 0.0);
  vec3 q = toCastle(p, cp, f);
  float d = castle(q);
  // The gradient in castle-local frame, rotated back to the world.
  vec3 n = vec3(castle(q + e.xyy) - d, castle(q + e.yxy) - d, castle(q + e.yyx) - d);
  n.xz = n.x * f + n.z * vec2(-f.y, f.x);
  return normalize(n);
}

void main(){
  if (CASTLE_ON == 0) discard;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float b = clamp(uBalance, -1.0, 1.0);
  float asp = uRes.x / uRes.y;
  vec3 rd = normalize(vec3(-p.x, p.y - HORIZON, -0.5 / tan(radians(FOV))));
  vec3 ro = vec3(0.0, terrain(vec2(0.0)) + EYE, 0.0);

  // Where the ray through the bow's foot meets the terrain, by a few rounds
  // of dropping a plumb line from the last guess. Screen left is world +x.
  float sx = uFoot < 0.5 ? 1.0 : -1.0;
  vec3 fd = normalize(vec3(sx * sqrt(R1 * R1 - (FOOT - CENTRE.y) * (FOOT - CENTRE.y)), FOOT - HORIZON, -0.5 / tan(radians(FOV))));
  float tf = EYE / -fd.y;
  for (int i = 0; i < 3; i++) tf = (ro.y - terrain((ro + fd * tf).xz)) / -fd.y;
  vec3 cp = ro + fd * tf * CASTLE_NEAR;
  cp.y = terrain(cp.xz);
  vec2 cf = normalize(ro.xz - cp.xz);

  float tc = castleHit(ro, rd, cp, cf);
  if (tc < 0.0) discard;
  // A hill in front of it hides it.
  float t = ground(ro, rd);
  if (t >= 0.0 && t < tc) discard;

  vec3 pos = ro + rd * tc;
  vec3 nor = castleNormal(pos, cp, cf);

  // Lit like the ground under the same sky: warm and bright on the clear
  // side of the weather front, cool and dim under the cloud.
  float front = b * (0.5 * asp + FRONT_SOFT);
  float amount = smoothstep(front - FRONT_SOFT, front + FRONT_SOFT, p.x);
  float sun = 1.0 - amount;
  vec3 sun_dir = vec3(0.0, sin(radians(SUN_ELEV)), cos(radians(SUN_ELEV)));
  float lit = mix(AMBIENT, 1.0, max(dot(nor, sun_dir), 0.0));
  vec3 light = mix(vec3(0.55, 0.62, 0.80) * SHADE, vec3(1.15, 1.05, 0.85) * lit, sun);
  // Darker toward the foot of the walls, for want of real occlusion.
  float base = 0.6 + 0.4 * clamp((pos.y - cp.y) / CASTLE_SCALE, 0.0, 1.0);

  // The sky behind, for the mirror and the fog: the world's gradient.
  float up = clamp((p.y - HORIZON) / 0.8, 0.0, 1.0);
  vec3 sky = mix(vec3(0.72, 0.85, 0.97), vec3(0.22, 0.48, 0.90), up);

  vec3 c;
  if (uFoot < 0.5) {
    c = vec3(0.93, 0.82, 0.62) * light * base;
  } else {
    // Obsidian: almost no diffuse, so what reads is the sun's highlight,
    // kept whatever the weather so the castle always looks polished, and
    // the sky mirrored in it, strongest at grazing angles.
    float spec = pow(max(dot(nor, normalize(sun_dir - rd)), 0.0), 40.0);
    float fresnel = 0.15 + 0.85 * pow(1.0 - max(dot(nor, -rd), 0.0), 2.0);
    c = vec3(0.03, 0.03, 0.04) * light * base + spec * vec3(0.9, 0.85, 0.75) + fresnel * sky * 0.8;
  }
  o = vec4(mix(c, sky, clamp(tc * tc * FOG, 0.0, 1.0)), 1.0);
}`;

let _prog, _u, _bowProg, _bowU, _castleProg, _castleU;

/** Compile both passes. Call once, after the context exists. */
export function initRainbow() {
    _prog = program(FULLSCREEN_VS, FS);
    _u = uniforms(_prog, ['uRes', 'uTime', 'uBalance']);
    _bowProg = program(FULLSCREEN_VS, BOW_FS);
    _bowU = uniforms(_bowProg, ['uRes', 'uBalance']);
    _castleProg = program(FULLSCREEN_VS, CASTLE_FS);
    _castleU = uniforms(_castleProg, ['uRes', 'uBalance', 'uFoot']);
}

/** The fragment sources by pass, for the debug panel's feature switches. */
export const SOURCES = { world: FS, bow: BOW_FS, castle: CASTLE_FS };

/**
 * Where the castles stand, as the depth main.js sorts by: the screen y of
 * the bow's foot line, which is where their bases sit. Keep FOOT in step
 * with the shaders.
 */
export const FOOT = -0.24;

/**
 * Dev only: recompile one pass from a variant of its source, for the debug
 * panel's feature switches. Throws with the log if it does not compile.
 * @param {'world'|'bow'|'castle'} pass
 * @param {string} src
 */
export function recompile(pass, src) {
    if (!__DEBUG__) return;
    if (pass === 'bow') {
        _bowProg = program(FULLSCREEN_VS, src);
        _bowU = uniforms(_bowProg, ['uRes', 'uBalance']);
    } else if (pass === 'castle') {
        _castleProg = program(FULLSCREEN_VS, src);
        _castleU = uniforms(_castleProg, ['uRes', 'uBalance', 'uFoot']);
    } else {
        _prog = program(FULLSCREEN_VS, src);
        _u = uniforms(_prog, ['uRes', 'uTime', 'uBalance']);
    }
}

/**
 * The world: sky, clouds, hills, grass. First thing drawn.
 * @param {number} balance −1…+1, 0 is perfectly held
 */
export function drawRainbow(balance) {
    gl.useProgram(_prog);
    _u({ uRes: [width, height], uTime: time, uBalance: balance });
    fullscreen();
}

/**
 * One castle.
 * @param {number} k 0 the sunicorns', 1 the rainicorns'
 * @param {number} balance
 */
export function drawCastle(k, balance) {
    gl.useProgram(_castleProg);
    _castleU({ uRes: [width, height], uBalance: balance, uFoot: k });
    fullscreen();
}

/**
 * The bow, a layer.
 * @param {number} balance
 */
export function drawBow(balance) {
    gl.useProgram(_bowProg);
    _bowU({ uRes: [width, height], uBalance: balance });
    fullscreen();
}
