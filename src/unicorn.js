/**
 * The unicorns — one signed-distance animal, drawn once per instance.
 *
 * There is no geometry and no texture: the quad is a window, and everything
 * inside it is the fragment shader solving the same distance field with a
 * different phase. That buys three things this game needs. The silhouette is
 * resolution-independent, so the same code draws a hero at 400px and a
 * skirmisher at 30px. The gallop is a number, so a swarm costs one draw call
 * and five floats per animal. And nothing has to be authored — there is no
 * sprite sheet to blow the budget.
 *
 * What keeps it from looking like a stick figure is worth stating, because
 * every constant below is in service of it:
 *
 *   - Three masses, not one. Barrel, chest and rump are separate ellipses
 *     joined with a smooth minimum, so the outline swells and narrows the way
 *     an animal does. A single capsule body is the giveaway.
 *   - Parts have different thicknesses. The neck is thick at the base and thin
 *     at the throat; legs are thinner than the barrel; the head is longer than
 *     it is tall and carries its own muzzle.
 *   - The legs bend. Knee back on the front pair, hock forward on the hind,
 *     both driven off the same phase with a quarter-cycle between them.
 *   - It is lit. Screen-space derivatives of the distance give a 2D normal for
 *     free, and inflating it toward the middle of the shape turns a flat fill
 *     into something with a body.
 *
 * The build is constant for now — every unicorn is the same animal. The
 * constants are named and used exactly where a per-instance value would be
 * used instead, so giving the swarm diverse measurements later means moving
 * them into the instance data and the `parts` signature, and nothing else.
 *
 * Instance data, five floats:
 *
 *   aB.xy   where the hooves stand, in the same units the rainbow uses
 *   aB.z    scale, signed by which way it faces (negative looks left)
 *   aB.w    gallop phase, radians; the lunge phase while fighting
 *   aS      0 sunicorn (warm, pale), 1 rainicorn (goth)
 *   aT.x   fighting, 0…1: the gallop fades out, the feet plant, and the
 *              neck swings down at the enemy with the phase
 *   aT.y   health, 0…1, for the bar over the horn; 0 down to −1 is the
 *              fade-out after death
 *   aT.z   the block of ice over it, 1 whole down to 0 gone: it melts
 *              from the top, so this is how much of its height is left
 *   aT.w   the cape: −1 for a fighter, which has none, and 0…1 for a mage,
 *              which is how charged the spell on its horn is. One float for
 *              both because the sign already says which animal this is
 *   aF     what a wizard has put on it, and which way round says which:
 *              0…1 is a mage's frost, how much of the freeze is still on it,
 *              and −1…0 is a rage, how much of that is left. One float for
 *              the two the same way aT.w carries the cape, and the frost
 *              wins it when a berserker is frozen — an animal that cannot
 *              move is the more important of the two to show. Frost is not
 *              the same thing as the ice, and those two can both be on one
 *              animal: the player's block over a unicorn a mage has frozen
 *
 * Who is where, and what they are doing, is sim.js's business; this file
 * only draws what it is handed.
 */

import { g, program, uniforms, gl, time, width, height, Batch } from './gl.js';

// ---------------------------------------------------------------------------
// The build. Body units: the barrel is 2·L long.
// ---------------------------------------------------------------------------
// Tuned on the bench, then frozen. FEET below has to agree with these — it is
// the only one the vertex shader needs, and GLSL constants cannot be shared
// across two shader stages without a uniform, so it is written out.

const VS = g`#version 300 es
layout(location = 0) in vec4 aB;
layout(location = 1) in float aS;
layout(location = 2) in vec4 aT;
layout(location = 3) in float aF;
uniform vec2 uR;
out vec2 vP;
out float vS, vD, vO, vL, vG, vH, vI, vC, vF;

// The quad in body units: wide enough for the tail behind and the muzzle in
// front, tall enough for the horn above and the hooves at full stride.
const vec2 BOX = vec2(1.64, 1.44);
const vec2 BOX_MID = vec2(0.0, 0.12);
// How far below the body's origin the hooves reach: H * 0.35 + LEG + 0.03.
const float FEET = 0.4695;
// Outline width, in pixels rather than body units, so it stays a line at every
// size instead of thickening with the animal.
const float OUTLINE = 1.5;

void main(){
  // The unit quad's corner, off the vertex id. sparks.js opens with the same
  // line, and sharing it would mean pasting a chunk into both templates —
  // which the shader-source tag cannot do, and which the GLSL minifier and
  // the equivalence check would both refuse, each wanting one whole
  // translation unit per template. One line is cheaper than that seam.
  vec2 c = (vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) - 0.5)
         * BOX + BOX_MID;
  float s = abs(aB.z);
  // Facing is the sign of the scale. The box is symmetric about x, so
  // mirroring the local coordinate is enough — the quad itself does not move.
  vL = sign(aB.z);
  vP = vec2(c.x * vL, c.y);
  vS = aB.w;
  vD = aS;
  vG = aT.x;
  vH = aT.y;
  vI = aT.z;
  vC = aT.w;
  vF = aF;
  vO = OUTLINE / (uR.y * s);
  // The same space the rainbow works in: y is -0.5…0.5, x scales with aspect.
  vec2 w = aB.xy + vec2(0.0, FEET * s) + c * s;
  gl_Position = vec4(2.0 * w * vec2(uR.y / uR.x, 1.0), 0.0, 1.0);
}`;

const FS = g`#version 300 es
precision highp float;
in vec2 vP;
in float vS, vD, vO, vL, vG, vH, vI, vC, vF;
out vec4 o;
uniform float uT;

// Its own copy, because a second program cannot share the rainbow's.
vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

const float L = 0.300;        // barrel half-length
const float H = 0.170;        // barrel half-depth
const float NECK_A = 0.960;   // radians up from horizontal
const float NECK_L = 0.380;
const float HEAD = 1.00;
const float LEG = 0.380;
const float MANE = 1.00;
const float STRIDE = 0.90;    // swing of the gallop; 0 stands still
const float SHADE = 0.80;     // how much the light is allowed to model it
// The block of ice: half as wide as the quad, and tall enough to have the
// horn inside it. Its foot is the ground the unicorn stands on.
const float FEET = 0.4695;
const float ICE_W = 0.62, ICE_H = 1.28;
// How far the block runs back, and how far that carries it up the screen:
// the same slant everything else on this field is seen at.
const vec2 ICE_D = vec2(0.34, 0.21);

float ell(vec2 p, vec2 r){ return (length(p / r) - 1.0) * min(r.x, r.y); }

// Tapered capsule: radius r1 at a, r2 at b. Not an exact distance — the taper
// makes the gradient shorter than unit — but close enough to shade and to
// antialias, and exact enough that nothing here needs more.
float seg(vec2 p, vec2 a, vec2 b, float r1, float r2){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r1, r2, h);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// Inside lo…hi, softly. Used for the flat faces of the block of ice, which
// are quicker to build out of bands than out of a distance field.
float band(float v, float lo, float hi, float aa){
  return smoothstep(lo - aa, lo + aa, v) * smoothstep(hi + aa, hi - aa, v);
}

// Every part comes back separately so each can take its own colour and its own
// place in the stack. They are all solved in one bobbing, pitching frame, the
// eye included — an eye computed outside it stays nailed to the screen while
// the head moves under it.
struct U {
  float torso;      // the body with no legs at all
  float body;       // torso, neck, head, and the near hind leg blended in
  float front;      // the near front leg alone, cut to outside the torso
  float frontEdge;  // the same before the cut, which is what the outline follows
  float farBack, farFront;
  float hoofFarBack, hoofFarFront, hoofBack, hoofFront;
  float tail, tailU, mane, maneU, horn, eye, glint;
  float cape, clasp;   // a mage's; solved for every animal, drawn for one
};

U parts(vec2 p, float ph, float t, float fight){
  U u;

  // Fighting: the stride fades out and the neck lunges down with the phase,
  // from raised to level with the horn at the enemy, once a cycle.
  float stride = STRIDE * (1.0 - fight);
  float lunge = fight * (0.5 - 0.5 * cos(ph));

  // Suspension: the whole animal rises between strides and pitches with it.
  // A lunge pitches it nose-down instead.
  p.y -= 0.035 * stride * sin(ph + 0.6);
  p = rot(0.06 * stride * sin(ph) - 0.08 * lunge) * p;

  // Three masses, not one sausage.
  float torso = ell(p, vec2(L, H));
  torso = smin(torso, ell(p - vec2(L * 0.6, 0.0), vec2(H * 0.85, H * 0.9)), 0.08);
  torso = smin(torso, ell(p - vec2(-L * 0.62, 0.03), vec2(H * 0.95, H)), 0.08);

  // Neck, thick at the base. The lunge swings it down by SWING.
  float swing = 1.1 * lunge;
  vec2 nd = vec2(cos(NECK_A - swing), sin(NECK_A - swing));
  vec2 nb = vec2(L * 0.7, H * 0.3);
  vec2 ne = nb + nd * NECK_L;
  torso = smin(torso, seg(p, nb, ne, H * 0.6, H * 0.36), 0.06);

  // Head longer than tall, tilted down, with a separate muzzle and one ear.
  // It turns with the neck: q is p in the head's frame, so the horn comes
  // down to point at the enemy.
  vec2 q = ne + rot(swing) * (p - ne);
  vec2 hc = ne + vec2(0.04, 0.0) * HEAD;
  torso = smin(torso, ell(rot(0.3) * (q - hc), vec2(0.115, 0.08) * HEAD), 0.03);
  vec2 mz = hc + vec2(0.12, -0.04) * HEAD;
  torso = smin(torso, ell(q - mz, vec2(0.06, 0.05) * HEAD), 0.03);
  vec2 et = hc + vec2(-0.05, 0.06) * HEAD;
  torso = smin(torso, seg(q, et, et + vec2(-0.03, 0.09) * HEAD, 0.024 * HEAD, 0.005), 0.015);

  vec2 hb = hc + vec2(0.025, 0.07) * HEAD;
  u.horn = seg(q, hb, hb + vec2(0.07, 0.17) * HEAD, 0.022 * HEAD, 0.001);
  vec2 ec = hc + vec2(0.045, 0.012) * HEAD;
  float er = 0.016 * HEAD;
  u.eye = length(q - ec) - er;
  u.glint = length(q - ec - er * vec2(0.35, 0.35)) - er * 0.35;

  // Legs: two capsules each, the knee bending back on the front pair and the
  // hock forward on the hind. Each leg blends into the torso and into nothing
  // else, so a pair crossing mid-stride passes rather than pooling into one
  // fat shape where the fillets meet.
  u.body = torso; u.frontEdge = torso;
  u.farBack = u.farFront = u.hoofFarBack = u.hoofFarFront = 1e3;
  u.hoofBack = u.hoofFront = 1e3;
  for (int i = 0; i < 4; i++) {
    bool front = i < 2, near = (i & 1) == 0;
    float off = front ? (near ? 0.0 : 0.8) : (near ? 3.1 : 3.9);
    float a = stride * 0.6 * sin(ph + off) + (front ? 0.0 : -0.15);
    float lift = max(0.0, sin(ph + off + 1.3)) * stride;
    vec2 hip = front ? vec2(L * 0.5, -H * 0.35) : vec2(-L * 0.6, -H * 0.3);
    float hl = LEG * 0.5;
    vec2 knee = hip + hl * vec2(sin(a), -cos(a));
    float a2 = a + (front ? -1.3 : 1.0) * lift;
    vec2 hf = knee + hl * vec2(sin(a2), -cos(a2));
    float ru = front ? H * 0.32 : H * 0.42, rl = H * 0.19;
    float d = smin(seg(p, hip, knee, ru, rl * 1.1), seg(p, knee, hf, rl, rl * 0.85), 0.02);
    float hv = ell(p - hf + vec2(0.0, 0.01), vec2(rl * 1.25, rl * 0.85));
    if (near && front) { u.frontEdge = smin(torso, d, 0.035); u.hoofFront = hv; }
    else if (near)     { u.body = smin(torso, d, 0.035); u.hoofBack = hv; }
    else if (front)    { u.farFront = d; u.hoofFarFront = hv; }
    else               { u.farBack = d; u.hoofFarBack = hv; }
  }
  // The near front leg is drawn as its own layer over the barrel, so its
  // coverage is cut back to what lies outside the torso. The outline still
  // follows the uncut shape, or it would retrace the barrel's own edge.
  u.front = max(u.frontEdge, -torso);
  u.torso = torso;
  u.body = min(u.body, u.frontEdge);

  // Tail: two tapered segments through a wave, from the top of the rump.
  vec2 tb = vec2(-L * 0.9, H * 0.45);
  vec2 tm = tb + vec2(-0.16, 0.02 + 0.05 * sin(t * 3.0));
  vec2 te = tm + vec2(-0.17, -0.16 + 0.06 * sin(t * 3.0 + 1.0));
  vec2 tp = p - vec2(0.0, 0.03 * sin(p.x * 12.0 + t * 6.0));
  u.tail = min(seg(tp, tb, tm, 0.035 * MANE, 0.075 * MANE),
               seg(tp, tm, te, 0.075 * MANE, 0.025 * MANE));
  vec2 tv = te - tb;
  u.tailU = clamp(dot(tp - tb, tv) / dot(tv, tv), 0.0, 1.0);

  // Mane: a wavy capsule riding the top edge of the neck, plus a forelock.
  vec2 nn = vec2(-nd.y, nd.x);
  vec2 mb = nb + nn * H * 0.5 + vec2(-0.03, 0.0);
  vec2 me = ne + nn * H * 0.32 + vec2(-0.04, 0.03);
  vec2 mv = me - mb;
  float mh = clamp(dot(p - mb, mv) / dot(mv, mv), 0.0, 1.0);
  vec2 mp = p - nn * (0.025 * sin(mh * 14.0 - t * 6.0) + 0.015);
  float rm = MANE * (0.05 + 0.02 * sin(mh * 22.0 + t * 5.0));
  u.mane = min(seg(mp, mb, me, rm * 0.7, rm * 1.1),
               ell(q - (hc + vec2(-0.03, 0.085) * HEAD), vec2(0.055, 0.035) * HEAD * MANE));
  u.maneU = mh;

  // The cape a mage wears: a sheet clasped at the withers, widening over the
  // rump and hanging to the top of the hind legs. It flies with the stride —
  // the hem swings back and up as the animal rises between strides — and
  // ripples on its own besides, so a mage standing still is not a mage in a
  // board. The ripple grows from nothing at the clasp to the whole of it at
  // the hem, which is the only end of a cape that is free to move.
  float fly = 0.3 + 0.7 * stride * (0.5 + 0.5 * sin(ph + 0.9));
  vec2 kb = vec2(L * 0.42, H * 0.85);
  vec2 kh = vec2(-L * 1.3, -H * 1.5) + vec2(-0.05, 0.07) * fly;
  // In the cape's own frame: kq.x runs down the drape from the clasp, kq.y
  // across it. That is what gives a hem — a straight cut across the sheet —
  // where a capsule would give a round end and the animal would look like it
  // was wearing a bag.
  vec2 kv = kh - kb, ax = normalize(kv);
  vec2 rel = p - kb;
  vec2 kq = vec2(dot(rel, ax), dot(rel, vec2(-ax.y, ax.x)));
  float kl = length(kv);
  // Narrow at the clasp, wide at the hem, and rippling: the wave runs across
  // the sheet rather than along it, so it reads as cloth moving rather than
  // as an edge wobbling.
  float wide = mix(0.04, 0.19, clamp(kq.x / kl, 0.0, 1.0))
             * (1.0 + 0.16 * sin(kq.x * 18.0 - t * 5.0));
  float hem = kl + 0.025 * sin(kq.y * 26.0 - t * 4.0);
  vec2 kd = vec2(max(kq.x - hem, -kq.x), abs(kq.y) - wide);
  u.cape = min(max(kd.x, kd.y), 0.0) + length(max(kd, 0.0));
  u.clasp = length(p - kb) - 0.04;
  return u;
}

// Composite, premultiplied, so the accumulator can start empty and the whole
// animal lands on the sky in one blend.
vec4 put(vec4 acc, float cov, vec3 col){
  return vec4(col, 1.0) * cov + acc * (1.0 - cov);
}

// One part: filled inside d, with a line of width vO just inside its edge.
vec4 part(vec4 acc, float d, float ow, vec3 fill, vec3 line){
  float aa = max(fwidth(d), 1e-6);
  return put(acc, smoothstep(aa, -aa, d), mix(line, fill, smoothstep(aa, -aa, d + ow)));
}

// Sunicorns get the whole spectrum. Rainicorns get violet through crimson,
// dimmer, with black combed through it.
vec3 hair(float u, float t){
  vec3 sun = hsv(fract(0.95 + u * 0.45 + t * 0.03), 0.7, 1.0);
  vec3 rain = hsv(0.70 + u * 0.25 + 0.03 * sin(t), 0.85, 0.72)
            * (0.7 + 0.3 * smoothstep(-0.2, 0.6, sin(u * 70.0 + t)));
  return mix(sun, rain, vD);
}

// Screen-space derivatives of the distance are a 2D normal for nothing. Tilt
// it up toward the middle of the shape and light it from the upper left; the
// dark side takes a rim light, without which a black unicorn is a hole.
vec3 shade(float d, vec3 bodyC, vec3 shadeC, vec3 rimC){
  vec2 gd = vec2(dFdx(d), dFdy(d));
  // Undo the mirror, or a unicorn facing left is lit from the wrong side.
  vec2 n = gd / max(length(gd), 1e-7) * vec2(vL, 1.0);
  float e = 1.0 - clamp(-d / (H * 0.8), 0.0, 1.0);
  e *= e;
  vec3 N = normalize(vec3(n * e, 1.0 - 0.75 * e));
  float lit = 0.55 + 0.45 * dot(N, normalize(vec3(-0.5, 0.75, 0.6)));
  float rim = pow(max(dot(N, normalize(vec3(-0.6, 0.8, 0.1))), 0.0), 6.0);
  return mix(shadeC, bodyC, smoothstep(0.3, 0.9, mix(1.0, lit, SHADE)))
       + rimC * rim * SHADE;
}

void main(){
  vec2 p = vP;
  float t = uT;
  U u = parts(p, vS, t, vG);
  float ow = vO;

  vec3 bodyC  = mix(vec3(0.99, 0.95, 0.88), vec3(0.19, 0.16, 0.25), vD);
  vec3 shadeC = mix(vec3(0.82, 0.62, 0.60), vec3(0.05, 0.04, 0.08), vD);
  vec3 line   = mix(vec3(0.26, 0.13, 0.18), vec3(0.02, 0.01, 0.04), vD);
  vec3 rimC   = mix(vec3(0.0), vec3(0.50, 0.40, 0.72), vD);
  vec3 farC   = mix(shadeC, bodyC, 0.45);
  vec3 hoofC  = mix(line * 1.6, vec3(0.0), vD);
  vec3 eyeC   = mix(line * 0.6, vec3(0.92, 0.12, 0.45), vD);
  vec3 hornC  = mix(vec3(1.0, 0.86, 0.5), vec3(0.80, 0.78, 0.88), vD)
              * (0.85 + 0.15 * sin(dot(p, vec2(0.38, 0.92)) * 90.0));
  // A mage: the cape is its own colour rather than the animal's, cold on both
  // sides so that it reads against a cream unicorn and against a black one.
  // The charge on its horn is squared, so the spell shows in the last moment
  // before it goes rather than glowing flatly the whole cooldown through.
  float mage = step(-0.5, vC), glow = max(vC, 0.0) * max(vC, 0.0);
  // A ninja is the same animal drawn as its own shadow: nobody on the field
  // picks it out, and the picture says so by very nearly not drawing it.
  float ninja = step(vC, -1.5);
  vec3 capeC  = mix(vec3(0.20, 0.26, 0.60), vec3(0.52, 0.80, 0.95), vD);
  vec3 iceC   = vec3(0.45, 0.80, 1.0);
  hornC = mix(hornC, vec3(0.75, 0.94, 1.0), glow * 0.85 * mage);

  // The shadow it stands in, before anything else and outside the bob, so the
  // animal rises off the ground rather than dragging the shadow with it.
  vec4 c = vec4(0.0);
  float sd = ell(p + vec2(0.0, 0.4695), vec2(0.5, 0.05));
  c = put(c, 0.22 * smoothstep(0.03, -0.03, sd), vec3(0.0));

  // Back to front. Each hoof goes down with its own leg rather than after the
  // pair, or a hind hoof swinging through paints over the front leg it should
  // be passing behind. Far legs are flat and a shade darker, which is all the
  // depth a sprite this size needs; within each depth the front leg covers the
  // hind one, so both pairs cross the same way.
  c = part(c, u.farBack, ow, farC, line);
  c = part(c, u.hoofFarBack, 0.0, hoofC, line);
  c = part(c, u.farFront, ow, farC, line);
  c = part(c, u.hoofFarFront, 0.0, hoofC, line);
  c = part(c, u.tail, ow, hair(u.tailU, t), line);
  c = part(c, u.body, ow, shade(u.body, bodyC, shadeC, rimC), line);
  c = part(c, u.hoofBack, 0.0, hoofC, line);

  // The cape, over the barrel it hangs on and under the near front leg, which
  // stands in front of it. Only a mage has one, and the sign of vC is what
  // says so.
  if (mage > 0.5) {
    c = part(c, u.cape, ow, shade(u.cape, capeC, capeC * 0.4, rimC), line);
    c = part(c, u.clasp, 0.0, vec3(1.0, 0.84, 0.40), line);
  }

  // The near front leg, painted only where it actually changes the silhouette,
  // so it never retraces the barrel it stands against.
  float aaF = max(fwidth(u.frontEdge), 1e-6);
  c = put(c, smoothstep(aaF, -aaF, u.front)
            * smoothstep(-0.5 * aaF, -3.0 * aaF, u.frontEdge - u.torso),
          mix(line, shade(u.frontEdge, bodyC, shadeC, rimC),
              smoothstep(aaF, -aaF, u.frontEdge + ow)));

  c = part(c, u.hoofFront, 0.0, hoofC, line);
  c = part(c, u.mane, ow * 0.7, hair(u.maneU, t + 2.0), line);
  c = part(c, u.horn, ow * 0.7, hornC, line);
  c = part(c, u.eye, 0.0, eyeC, line);
  c = part(c, u.glint, 0.0, vec3(1.0), line);

  // The spell gathering on the horn: light off the horn itself, falling away
  // from it, with enough alpha of its own to survive the discard below.
  float halo = glow * mage * exp(-max(u.horn, 0.0) * 34.0);
  c += vec4(iceC * 1.3, 0.6) * halo * 0.6;

  // Frozen: the colour goes out of it and a shell of ice takes the light. The
  // facets are one sine through another, which at this size is all the
  // crystal anyone can see.
  if (vF > 0.0) {
    float cr = 0.5 + 0.5 * sin(p.x * 30.0 + p.y * 21.0 + sin(p.y * 44.0));
    c.rgb = mix(c.rgb, iceC * (0.95 + 0.16 * cr) * c.a, 0.62 * vF);
  }

  // In a rage: the same float the other way up. The neck is already going at
  // twice the speed, which is the half of it anybody reads first; this is so
  // that a berserker standing in a crowd of forty can be picked out of it.
  // It beats rather than holds, because a colour that sits still on an animal
  // reads as what the animal is and a colour that pulses reads as what has
  // been done to it.
  else if (vF < 0.0) {
    float beat = 0.72 + 0.28 * sin(uT * 17.0);
    c.rgb = mix(c.rgb, vec3(1.0, 0.31, 0.10) * beat * c.a, -0.55 * vF);
  }

  // Health, over the horn, while it is hurt. It fills left to right on the
  // screen whichever way the animal faces.
  if (vH > 0.0 && vH < 0.999) {
    vec2 bp = vec2(p.x * vL, p.y - 0.78);
    vec2 bd = abs(bp) - vec2(0.24, 0.022);
    float box = max(bd.x, bd.y);
    float aa = fwidth(box);
    float fill = smoothstep(aa, -aa, bp.x - (-0.24 + 0.48 * vH));
    c = put(c, smoothstep(aa, -aa, box), mix(vec3(0.1, 0.05, 0.08), mix(vec3(0.9, 0.2, 0.15), vec3(0.3, 0.9, 0.3), vH), fill));
  }

  // The ice. A block of it standing on the ground with the animal inside,
  // melting from the top down, so what is left is a block whose lid comes
  // down through the unicorn until there is none of it.
  //
  // Three faces make it a block rather than a pane: the lid and the far
  // side, both running back and up the screen the way everything else on
  // this field is seen, and the front over them. The lid takes the light,
  // the side is darker, and the front is the palest and the clearest,
  // because that is the one the animal has to be seen through.
  if (vI > 0.0) {
    vec2 q = vec2(p.x * vL, p.y);
    float top = -FEET + ICE_H * vI, bot = -FEET - 0.01;
    float aa = max(fwidth(q.x), 1e-6) * 1.5;
    // Frost, so it is ice and not glass.
    float fr = 0.5 + 0.5 * sin(q.x * 41.0 + q.y * 29.0)
             * sin(q.x * 19.0 - q.y * 53.0 + t * 0.5);
    vec3 icy = mix(vec3(0.88, 0.96, 1.0), vec3(0.45, 0.68, 0.88), 0.45 + 0.3 * fr);

    // The lid: the top edge of the front face swept back along ICE_D.
    float u = clamp((q.y - top) / ICE_D.y, 0.0, 1.0);
    float lid = band(q.y, top, top + ICE_D.y, aa)
              * band(q.x - u * ICE_D.x, -ICE_W, ICE_W, aa);
    // The far side: the right edge swept back the same way.
    float v2 = clamp((q.x - ICE_W) / ICE_D.x, 0.0, 1.0);
    float side = band(q.x, ICE_W, ICE_W + ICE_D.x, aa)
               * band(q.y - v2 * ICE_D.y, bot, top, aa);
    // And the front, which is the one you look through.
    float front = band(q.x, -ICE_W, ICE_W, aa) * band(q.y, bot, top, aa);

    c = put(c, lid * 0.92, icy * 1.15 + 0.1);
    c = put(c, side * 0.85, icy * 0.72);
    // Brighter along the melting edge, where the light runs along the wet.
    float wet = smoothstep(0.07, 0.0, top - q.y) * front;
    c = put(c, front * 0.5 + wet * 0.3, icy + wet * 0.4);
  }

  if (c.a < 0.002) discard;
  // A ninja is darkened and faded to a shape on the ground. Premultiplied, so
  // the one multiply does both at once.
  c *= 1.0 - 0.62 * ninja;
  c.rgb *= 1.0 - 0.45 * ninja;
  // Below zero health is the fade-out: −1 is gone.
  o = c * (vH > 0.0 ? 1.0 : 1.0 + vH);
}`;

// ---------------------------------------------------------------------------
// The swarms
// ---------------------------------------------------------------------------

import { MAX, FREEZE, COOL, FROST, RAGE, project, herd } from './sim.js';

let _prog, _u, _batch;

/** Compile the pass. Call once, after the context. */
export function initUnicorns() {
    _prog = program(VS, FS);
    _u = uniforms(_prog, ['uR', 'uT']);
    _batch = new Batch(_prog, [4, 1, 4, 1], MAX);
}

/**
 * Draw the herd from index `from`, back to front, as far as the first animal
 * whose depth is not behind `y`, and return that index — so main.js can draw
 * something at depth y in between. The sim keeps the herd sorted by depth.
 * @param {number} from
 * @param {number} [y] screen y; everything with _y > y is drawn
 * @returns {number}
 */
export function drawUnicorns(from, y = -Infinity) {
    _batch.clear();
    let i = from;
    for (; i < herd.length && herd[i]._y > y; i++) {
        const un = herd[i];
        // The herd walks on a flat plain and is drawn on a screen. This is
        // where the one becomes the other, and it is the same camera the
        // ground and the castles are drawn with.
        const [px, py, ps] = project(un._x, un._y, un._s);
        _batch.push(px, py, un._face * ps, un._ph, un._side, un._fight,
            un._hp > 0 ? un._hp / un._max : un._hp,
            // The one hold, told the two ways it is drawn: the player's ice is
            // a block around the animal, a mage's frost is the animal itself
            // gone pale. Never both at once, which is why the block can be
            // drawn over the whole of it with no frost underneath to hide.
            un._block ? un._held / FREEZE : 0,
            // A fighter has no cape, and says so with a negative; a mage sends
            // how charged its spell is in the same float. A ninja goes further
            // down the same negative, since it is the one other thing a
            // fighter can be that changes how it is drawn and not what it is
            // wearing.
            un._mage ? 1 - Math.min(1, un._cast / COOL) : un._nin ? -2 : -1,
            // The frost, or a rage the other way up. Never both: what is
            // held is not fighting, and the frost is what the float says. A
            // berserker bred for it is simply always at the far end of the
            // rage, which is the same picture a wizard's rage paints.
            un._block ? 0
                : un._held > 0 ? Math.min(1, un._held / FROST)
                : un._ber ? -1 : -un._rage / RAGE);
    }
    gl.useProgram(_prog);
    _u({ uR: [width, height], uT: [time] });
    _batch.draw();
    return i;
}
