// Copied from lordoftheswarm/src/js/inkmark.js (936bc8d, 2026-08-30). Change it
// there first and copy it back, so the two marks stay the same.
/**
 * The tom.to word mark — a flock of brush-drawn "birds" that forms the
 * wordmark, scatters when the cursor comes near, and always reassembles.
 *
 * Ported from the site's InkMark component (tom.to's Astro `InkMark.astro`),
 * trimmed to the wordmark alone: no nav labels, and the ink is white instead
 * of near-black so it reads over the splash artwork. Like the site's mark it
 * drifts between "tom.to" and "tom meyer", scattering on each change. The
 * canvas is transparent and `pointer-events: none`, so the splash buttons
 * underneath keep their hit targets; it covers the corner slot the wordmark
 * forms in plus the overscan CSS gives it, which is all the room the strays
 * a cursor scatters ever need.
 *
 * The simulation runs on the GPU via transform feedback: particle homes come
 * from a distance-transform sample of the wordmark that preserves each
 * stroke's medial ridge (so thin strokes never vanish beside thick ones), and
 * paper grain is a tileable texture baked once and composited so it shows
 * only in the ink.
 *
 * Requires WebGL2; without it the caller's plain-text fallback stays visible.
 */

// Mirrors the fallback text's CSS font stack in swarmrts.css — keep in sync.
const FONT = "600 SIZEpx 'Palatino Linotype', 'Book Antiqua', Palatino, 'Iowan Old Style', 'Hoefler Text', Georgia, serif";

// Dialled-in parameters. Flee radius/force are far smaller than the site
// hero's: this mark is a corner signature, not a full-width hero, so a hero
// gust would fling the whole flock across the screen. They sit well under the
// site's linked header brand (60 / 1.15): a passing cursor should nudge the
// ink aside, not blast it — the mark must not steal focus from the splash.
const P = {
    DAMP: 0.90, SEEK: 0.011, REST_AMP: 0.013, FLIGHT_AMP: 0.5, WANDER: 0.8,
    FLEE_R: 50, FLEE_FORCE: 0.29, FLEE_SWIRL: 1.0,
    GRAIN: 0.34, TILE: 150,
    FLIGHT_S: 2,    // seconds for a scatter to decay back into the word
    CYCLE_S: 8,     // seconds each word holds before the flock re-forms the other
    DPR_MAX: 2,
    WORD_CAP: 0.71, // max font size as a fraction of the slot's height
    WORD_DENS: 0.7, // particles per sampled glyph coord
    BREEZE_REF: 84  // hero wordmark font px — the amplitude tuning baseline
};

// Simulation: transform feedback advances (pos, vel, ang) entirely on the GPU.
const SIM_VERT = `#version 300 es
precision highp float;
in vec2 iPos; in vec2 iVel; in float iAng; in vec2 iHome; in float iSeed;
uniform float uT, uSeek, uAmp, uBrz, uAct, uJit, uDtn, uDamp, uFleeR, uFleeF, uSwirl;
uniform vec2 uPtr, uGust;
out vec2 vPos; out vec2 vVel; out float vAng;
float h(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float flow(vec2 p, float t){ return sin(p.x*.006 + t*.30) + cos(p.y*.006 - t*.24) + .5*sin((p.x+p.y)*.004 + t*.18); }
void main(){
  vec2 pos = iPos, vel = iVel;
  vel += (iHome - pos) * uSeek * uDtn;
  float a = flow(pos, uT) * 3.14159265;
  // breeze scales with glyph size, so a small mark shivers proportionally
  // rather than being tossed around at hero amplitude
  vel += vec2(cos(a), sin(a)) * uAmp * uBrz * uDtn;
  if (uAct > .5) {
    vec2 dv = pos - uPtr; float d2 = dot(dv, dv);
    if (d2 < uFleeR * uFleeR && d2 > .01) {
      float d = sqrt(d2), f = 1. - d / uFleeR; f = f * f * uFleeF;
      vec2 n = dv / d;
      vel += (n * f + vec2(-n.y, n.x) * f * uSwirl) * uDtn;
    }
  }
  vel += uGust + (vec2(h(iSeed*13.1), h(iSeed*7.7)) * 2. - 1.) * uJit;
  vel *= pow(uDamp, uDtn);
  pos += vel * uDtn;
  float s = length(vel);
  vec2 fd = vec2(cos(a), sin(a)), vd = s > 1e-4 ? vel / s : fd;
  vec2 dir = mix(fd, vd, clamp((s - .05) / .35, 0., 1.));
  float tg = atan(dir.y, dir.x);
  vAng = iAng + atan(sin(tg - iAng), cos(tg - iAng)) * min(.15 * uDtn, 1.);
  vPos = pos; vVel = vel;
  gl_Position = vec4(0);
}`;
const SIM_FRAG = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(0); }`;

// Stroke render: each particle becomes an instanced capsule quad, drawn in
// CSS-pixel space and normalised to clip coordinates.
const STROKE_VERT = `#version 300 es
precision highp float;
in vec2 aCorner; in vec2 iPos; in vec2 iVel; in float iAng; in float iSeed;
uniform vec2 uRes; uniform float uSc;
out vec2 vL; out float vLen; out float vHW; out float vSc;
void main(){
  float len = 4. * uSc + length(iVel) * 2.6;
  vec2 dir = vec2(cos(iAng), sin(iAng)), hv = dir * len * .5;
  vec2 p1 = iPos - hv, p2 = iPos + hv;
  float w = 1.2 * uSc * (.8 + .4 * iSeed), pad = w + 4.5;
  vec2 d = p2 - p1; float L = length(d);
  vec2 nd = L > 1e-4 ? d / L : vec2(0, 1), nm = vec2(-nd.y, nd.x);
  float al = (aCorner.y * .5 + .5) * (L + 2. * pad) - pad, pp = aCorner.x * pad;
  vec2 wp = p1 + nd * al + nm * pp;
  vL = vec2(pp, al); vLen = L; vHW = w; vSc = uSc;
  gl_Position = vec4(wp.x / uRes.x * 2. - 1., 1. - wp.y / uRes.y * 2., 0, 1);
}`;
const STROKE_FRAG = `#version 300 es
precision highp float;
in vec2 vL; in float vLen; in float vHW; in float vSc;
out vec4 frag;
void main(){
  float pp = vL.x, al = vL.y, ay = clamp(al, 0., vLen);
  float d = length(vec2(pp, al - ay)) - vHW;
  float ink = 1. - smoothstep(-1., 1.4, d);
  // bleed halo follows the stroke weight (4.5px at the hero's 0.6 scale):
  // a fixed radius would wash a corner-sized mark into a solid blob
  float bl = (1. - smoothstep(0., 7.5 * vSc, max(d, 0.))) * .16;
  float a = clamp(ink + bl, 0., 1.) * .9;
  if (a <= .002) discard;
  frag = vec4(a);
}`;

// Composite: ink coverage as premultiplied alpha over a transparent canvas,
// so the splash artwork shows through; grain modulates only the ink.
const COMP_VERT = `#version 300 es
precision highp float; out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p; gl_Position = vec4(p * 2. - 1., 0, 1);
}`;
const COMP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uInk, uPaperTex; uniform vec2 uCRes;
uniform vec3 uInkC; uniform float uPStr, uTile, uOpacity;
out vec4 frag;
void main(){
  float cov = texture(uInk, vUv).r;
  float pa = texture(uPaperTex, vUv * uCRes / uTile).r;
  float a = cov * mix(1. - uPStr, 1., pa) * uOpacity;
  frag = vec4(uInkC * a, a);
}`;

/**
 * Boot the word mark onto a canvas, forming the text inside `slot`.
 *
 * @param {object}            opts
 * @param {HTMLCanvasElement} opts.canvas  transparent overlay, sized by CSS
 * @param {HTMLElement}       opts.slot    layout box the wordmark forms inside
 * @param {string[]}          [opts.words] the wordmark(s), cycled in order
 * @param {number[]}          [opts.ink]   ink colour, 0..1 RGB (default white)
 * @param {number}            [opts.opacity] overall ink opacity, 0..1
 * @returns {{destroy: function(): void}|null} handle, or null if WebGL2 is unavailable
 */
export function mountInkMark({ canvas, slot, words = ['tom.to', 'tom meyer'], ink = [1, 1, 1], opacity = 0.95 }) {
    if (!canvas || !slot) return null;

    let gl = null;
    try {
        gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
    } catch { /* no WebGL2 here */ }
    if (!gl) return null;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /**
     * @param {number} type
     * @param {string} src
     * @returns {WebGLShader|null}
     */
    function compile(type, src) {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('inkmark shader:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }
    /**
     * @param {string} vsSrc
     * @param {string} fsSrc
     * @param {string[]} [tf] transform-feedback varyings to capture
     * @returns {WebGLProgram|null}
     */
    function link(vsSrc, fsSrc, tf) {
        const vs = compile(gl.VERTEX_SHADER, vsSrc), fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        if (!p) return null;
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        if (tf) gl.transformFeedbackVaryings(p, tf, gl.INTERLEAVED_ATTRIBS);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('inkmark link:', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    const simProg    = link(SIM_VERT, SIM_FRAG, ['vPos', 'vVel', 'vAng']);
    const strokeProg = link(STROKE_VERT, STROKE_FRAG);
    const compProg   = link(COMP_VERT, COMP_FRAG);
    if (!simProg || !strokeProg || !compProg) return null;

    const al = (p, n) => gl.getAttribLocation(p, n);
    const ul = (p, n) => gl.getUniformLocation(p, n);
    const su = {
        uT: ul(simProg, 'uT'), uSeek: ul(simProg, 'uSeek'), uAmp: ul(simProg, 'uAmp'),
        uBrz: ul(simProg, 'uBrz'), uAct: ul(simProg, 'uAct'), uJit: ul(simProg, 'uJit'),
        uDtn: ul(simProg, 'uDtn'), uDamp: ul(simProg, 'uDamp'), uFleeR: ul(simProg, 'uFleeR'),
        uFleeF: ul(simProg, 'uFleeF'), uSwirl: ul(simProg, 'uSwirl'),
        uPtr: ul(simProg, 'uPtr'), uGust: ul(simProg, 'uGust')
    };
    const ru = { uRes: ul(strokeProg, 'uRes'), uSc: ul(strokeProg, 'uSc') };
    const cu = {
        uInk: ul(compProg, 'uInk'), uPaperTex: ul(compProg, 'uPaperTex'), uCRes: ul(compProg, 'uCRes'),
        uInkC: ul(compProg, 'uInkC'), uPStr: ul(compProg, 'uPStr'), uTile: ul(compProg, 'uTile'),
        uOpacity: ul(compProg, 'uOpacity')
    };

    gl.disable(gl.DEPTH_TEST);

    // Offscreen ink buffer (pass 1 target; single-channel — only coverage is
    // stored, the ink colour is applied in the composite) and the composite's
    // empty VAO.
    const inkTex = gl.createTexture(), fbo = gl.createFramebuffer(), emptyVao = gl.createVertexArray();
    let fbw = 0, fbh = 0;
    gl.bindTexture(gl.TEXTURE_2D, inkTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    /** Size the coverage buffer to the canvas' backing store. */
    function allocFbo() {
        if (fbw === canvas.width && fbh === canvas.height) return;
        fbw = canvas.width; fbh = canvas.height;
        gl.bindTexture(gl.TEXTURE_2D, inkTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fbw, fbh, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, inkTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Tileable paper grain baked once into a 128x128 texture (periodic value
    // noise, sampled with REPEAT) — no per-frame noise evaluation.
    /** @returns {WebGLTexture} */
    function makePaper() {
        const S = 128, d = new Uint8Array(S * S);
        const h2 = (ix, iy, p) => {
            ix = ((ix % p) + p) % p; iy = ((iy % p) + p) % p;
            const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
            return n - Math.floor(n);
        };
        const vn = (u, v, p) => {
            const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
            const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
            const a = h2(x0, y0, p), b = h2(x0 + 1, y0, p), c = h2(x0, y0 + 1, p), e = h2(x0 + 1, y0 + 1, p);
            const tp = a + (b - a) * sx, bo = c + (e - c) * sx;
            return tp + (bo - tp) * sy;
        };
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const u = x / S, v = y / S;
            const n = vn(u * 32, v * 32, 32) * 0.5 + vn(u * 64, v * 64, 64) * 0.33 + vn(u * 96, v * 96, 96) * 0.17;
            d[y * S + x] = Math.max(0, Math.min(255, (n * 255) | 0));
        }
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, S, S, 0, gl.RED, gl.UNSIGNED_BYTE, d);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        return t;
    }
    const paperTex = makePaper();

    const cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // Ping-pong particle state: interleaved (pos.xy, vel.xy, ang), stride 20 bytes.
    const stateBuf = [gl.createBuffer(), gl.createBuffer()];
    const homeBuf = gl.createBuffer(), seedBuf = gl.createBuffer();
    const simVao = [], drawVao = [];

    let N = 0, W = 0, H = 0, DPR = 1;
    let cur = 0, allocated = false;
    let homes = new Float32Array(0);
    let strokeScale = 1, breeze = 1;
    let flight = 0, cycleIdx = 0, lastCycle = 0, prevT = 0, raf = 0, alive = true;
    let word = words[0];
    const gust = [0, 0];
    const pointer = { x: -1e4, y: -1e4, active: false };
    // Where the wordmark forms: the slot's layout box, in canvas coordinates.
    const region = { x: 0, y: 0, w: 2, h: 2 };

    /**
     * @param {number} l attribute location
     * @param {number} size
     * @param {number} stride
     * @param {number} off
     * @param {number} [div] instance divisor
     */
    function en(l, size, stride, off, div) {
        if (l < 0) return;
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, off);
        gl.vertexAttribDivisor(l, div || 0);
    }

    /** (Re)allocate the particle buffers and VAOs for the current N. */
    function alloc() {
        if (simVao[0]) {
            gl.deleteVertexArray(simVao[0]); gl.deleteVertexArray(simVao[1]);
            gl.deleteVertexArray(drawVao[0]); gl.deleteVertexArray(drawVao[1]);
        }
        const s0 = new Float32Array(N * 5), sd = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            const o = i * 5, ga = Math.random() * Math.PI * 2, gm = 2.5 + Math.random() * 2.5;
            s0[o] = Math.random() * W; s0[o + 1] = Math.random() * H;
            s0[o + 2] = Math.cos(ga) * gm; s0[o + 3] = Math.sin(ga) * gm; s0[o + 4] = ga;
            sd[i] = Math.random();
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf[0]); gl.bufferData(gl.ARRAY_BUFFER, s0, gl.DYNAMIC_COPY);
        gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf[1]); gl.bufferData(gl.ARRAY_BUFFER, s0.byteLength, gl.DYNAMIC_COPY);
        gl.bindBuffer(gl.ARRAY_BUFFER, homeBuf); gl.bufferData(gl.ARRAY_BUFFER, N * 8, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); gl.bufferData(gl.ARRAY_BUFFER, sd, gl.STATIC_DRAW);
        for (let i = 0; i < 2; i++) {
            const sv = gl.createVertexArray();
            gl.bindVertexArray(sv);
            gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf[i]);
            en(al(simProg, 'iPos'), 2, 20, 0); en(al(simProg, 'iVel'), 2, 20, 8); en(al(simProg, 'iAng'), 1, 20, 16);
            gl.bindBuffer(gl.ARRAY_BUFFER, homeBuf); en(al(simProg, 'iHome'), 2, 8, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); en(al(simProg, 'iSeed'), 1, 4, 0);
            simVao[i] = sv;
            const dv = gl.createVertexArray();
            gl.bindVertexArray(dv);
            gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf); en(al(strokeProg, 'aCorner'), 2, 8, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf[i]);
            en(al(strokeProg, 'iPos'), 2, 20, 0, 1); en(al(strokeProg, 'iVel'), 2, 20, 8, 1); en(al(strokeProg, 'iAng'), 1, 20, 16, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); en(al(strokeProg, 'iSeed'), 1, 4, 0, 1);
            drawVao[i] = dv;
        }
        gl.bindVertexArray(null);
        homes = new Float32Array(N * 2);
        allocated = true;
    }

    const off = document.createElement('canvas');
    const octx = off.getContext('2d', { willReadFrequently: true });

    /**
     * Sample the glyph geometry of `str` fitted to `rect` via a distance
     * transform over a rect-sized sub-canvas: erode thick strokes by a margin
     * but always keep each stroke's medial ridge, so thin lines never vanish
     * beside thick ones. The surviving coords also size the flock — font size
     * drives particle count, not slot area.
     *
     * @param {string} str
     * @param {{x: number, y: number, w: number, h: number}} rect
     * @returns {object} coords, sampling gap, stroke scale, fitted size, and the mapping back to canvas space
     */
    function sampleGlyphs(str, rect) {
        const pad = 10;
        const w = Math.max(2, Math.round(rect.w) + pad * 2), h = Math.max(2, Math.round(rect.h) + pad * 2);
        off.width = w; off.height = h;
        octx.clearRect(0, 0, w, h);
        // Right-aligned: the words differ in width, and a corner signature
        // should stay pinned to its corner rather than breathe in and out.
        octx.fillStyle = '#fff'; octx.textAlign = 'right'; octx.textBaseline = 'middle';
        let size = 200;
        octx.font = FONT.replace('SIZE', String(size));
        const target = Math.min(rect.w * 0.9, rect.h * P.WORD_CAP * 6.2);
        size = Math.min(size * (target / octx.measureText(str).width), rect.h * P.WORD_CAP);
        octx.font = FONT.replace('SIZE', String(size));
        octx.fillText(str, w - pad, h / 2);
        // The site's marks all sit on its 0.6 floor (84px hero → 0.6); size/140
        // reproduces that ratio while letting a corner-sized mark draw with
        // proportionally finer strokes instead of fat ones.
        const scale = Math.max(0.3, Math.min(1.0, size / 140));
        const img = octx.getImageData(0, 0, w, h).data;
        const WH = w * h, D = new Float32Array(WH);
        let i, x, y, v;
        for (i = 0; i < WH; i++) D[i] = img[i * 4 + 3] > 96 ? 1e9 : 0;
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
            i = y * w + x; if (!D[i]) continue; v = D[i];
            if (x > 0) v = Math.min(v, D[i - 1] + 1);
            if (y > 0) v = Math.min(v, D[i - w] + 1);
            if (x > 0 && y > 0) v = Math.min(v, D[i - w - 1] + 1.414);
            if (x < w - 1 && y > 0) v = Math.min(v, D[i - w + 1] + 1.414);
            D[i] = v;
        }
        for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
            i = y * w + x; if (!D[i]) continue; v = D[i];
            if (x < w - 1) v = Math.min(v, D[i + 1] + 1);
            if (y < h - 1) v = Math.min(v, D[i + w] + 1);
            if (x < w - 1 && y < h - 1) v = Math.min(v, D[i + w + 1] + 1.414);
            if (x > 0 && y < h - 1) v = Math.min(v, D[i + w - 1] + 1.414);
            D[i] = v;
        }
        const g = (px, py) => ((px < 0 || py < 0 || px >= w || py >= h) ? 0 : D[py * w + px]);
        const coords = [];
        const m = Math.max(1, Math.round(3.2 * scale));
        let d;
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
            i = y * w + x; d = D[i]; if (d <= 0) continue;
            if (d >= m || (d >= g(x - 1, y) && d >= g(x + 1, y) && d >= g(x, y - 1) && d >= g(x, y + 1) &&
                d >= g(x - 1, y - 1) && d >= g(x + 1, y - 1) && d >= g(x - 1, y + 1) && d >= g(x + 1, y + 1))) coords.push(x, y);
        }
        return {
            coords, scale, size,
            ox: rect.x - pad, oy: rect.y - pad,
            cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2
        };
    }

    /**
     * Assign every particle's home from a glyph sample, cycling through the
     * coords when the counts differ, with sub-pixel jitter.
     *
     * @param {object} s a sampleGlyphs() result
     */
    function homesFrom(s) {
        const cn = s.coords.length / 2;
        for (let k = 0; k < N; k++) {
            if (!cn) { homes[k * 2] = s.cx; homes[k * 2 + 1] = s.cy; continue; }
            const idx = Math.floor((k * cn) / N) * 2;
            homes[k * 2] = s.ox + s.coords[idx] + (Math.random() - 0.5);
            homes[k * 2 + 1] = s.oy + s.coords[idx + 1] + (Math.random() - 0.5);
        }
    }

    /**
     * Re-sample the wordmark into the current region. Also tracks the fitted
     * font size as the breeze factor: ambient drift and flight amplitude scale
     * with glyph size, so a small mark shivers proportionally.
     */
    function upHomes() {
        const s = sampleGlyphs(word, region);
        strokeScale = s.scale;
        breeze = Math.max(0.25, Math.min(1.5, s.size / P.BREEZE_REF));
        homesFrom(s);
        gl.bindBuffer(gl.ARRAY_BUFFER, homeBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, homes);
    }

    /**
     * Seed every particle within `spread` px of its home with up to `maxVel`
     * drift: spread 0 parks the flock exactly on the text — used on startup
     * (and reduced motion) so first paint is the settled word, not an arrival.
     *
     * @param {number} spread
     * @param {number} maxVel
     */
    function seedState(spread, maxVel) {
        const s0 = new Float32Array(N * 5);
        for (let i = 0; i < N; i++) {
            const o = i * 5, a = Math.random() * Math.PI * 2, r = Math.random() * spread;
            const va = Math.random() * Math.PI * 2, vm = Math.random() * maxVel;
            s0[o] = homes[i * 2] + Math.cos(a) * r; s0[o + 1] = homes[i * 2 + 1] + Math.sin(a) * r;
            s0[o + 2] = Math.cos(va) * vm; s0[o + 3] = Math.sin(va) * vm; s0[o + 4] = va;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf[cur]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, s0);
    }

    /** The scatter-and-swirl flight: gust strength follows the breeze factor. */
    function gesture() {
        flight = 1;
        const a = Math.random() * Math.PI * 2, g = 2.4 * breeze;
        gust[0] += Math.cos(a) * g; gust[1] += Math.sin(a) * g;
    }

    /**
     * Re-form the flock into `next`, scattering on the way.
     *
     * @param {string} next
     */
    function setWord(next) {
        word = next;
        upHomes();
        gesture();
    }

    /**
     * @param {number} t   seconds, for the flow field
     * @param {number} amp breeze amplitude
     * @param {number} seek home-seeking strength
     * @param {number} dtn frame time normalised to 60fps steps
     */
    function sim(t, amp, seek, dtn) {
        gl.useProgram(simProg);
        gl.uniform1f(su.uT, t); gl.uniform1f(su.uSeek, seek); gl.uniform1f(su.uAmp, amp); gl.uniform1f(su.uDtn, dtn);
        gl.uniform1f(su.uBrz, breeze); gl.uniform1f(su.uDamp, P.DAMP);
        gl.uniform1f(su.uFleeR, P.FLEE_R); gl.uniform1f(su.uFleeF, P.FLEE_FORCE); gl.uniform1f(su.uSwirl, P.FLEE_SWIRL);
        gl.uniform1f(su.uAct, pointer.active ? 1 : 0); gl.uniform2f(su.uPtr, pointer.x, pointer.y);
        gl.uniform2f(su.uGust, gust[0], gust[1]); gl.uniform1f(su.uJit, (gust[0] || gust[1]) ? 1 : 0);
        gl.bindVertexArray(simVao[cur]);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, stateBuf[cur ^ 1]);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, N);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        gust[0] = gust[1] = 0;
        cur ^= 1;
    }

    /** Draw one frame: ink coverage offscreen, then the grain composite. */
    function draw() {
        // pass 1: ink coverage accumulates into the offscreen buffer's red channel
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(strokeProg);
        gl.uniform2f(ru.uRes, W, H); gl.uniform1f(ru.uSc, strokeScale);
        gl.bindVertexArray(drawVao[cur]);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);
        // pass 2: composite the ink colour over transparent, grain modulating density
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.BLEND);
        gl.useProgram(compProg);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, inkTex); gl.uniform1i(cu.uInk, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, paperTex); gl.uniform1i(cu.uPaperTex, 1);
        gl.uniform2f(cu.uCRes, W, H);
        gl.uniform3f(cu.uInkC, ink[0], ink[1], ink[2]);
        gl.uniform1f(cu.uPStr, P.GRAIN); gl.uniform1f(cu.uTile, P.TILE);
        gl.uniform1f(cu.uOpacity, opacity);
        gl.bindVertexArray(emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Re-measure the canvas and slot, then re-form the flock. */
    function resize() {
        if (!alive) return;
        DPR = Math.min(window.devicePixelRatio || 1, P.DPR_MAX);
        const cr = canvas.getBoundingClientRect();
        W = Math.max(2, Math.round(cr.width)); H = Math.max(2, Math.round(cr.height));
        const sr = slot.getBoundingClientRect();
        region.x = sr.left - cr.left; region.y = sr.top - cr.top;
        region.w = Math.max(2, Math.round(sr.width)); region.h = Math.max(2, Math.round(sr.height));
        canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
        allocFbo();
        // Flock size follows the sampled glyphs — font size and letterform
        // coverage drive the particle count, not the slot's area. It is fixed
        // for the life of the engine, so it has to serve the densest word in
        // the cycle; the shorter ones simply spread the same flock thinner.
        const coverage = Math.max(...words.map((t) => sampleGlyphs(t, region).coords.length / 2));
        const want = Math.max(240, Math.min(6000, Math.round(coverage * P.WORD_DENS)));
        const fresh = want !== N || !allocated;
        if (fresh) { N = want; alloc(); }
        upHomes();
        if (fresh && !reduce) seedState(0, 0);
        if (reduce) { seedState(0, 0); draw(); }
    }

    // integrate by real elapsed time: speed is identical at 60/120/any fps
    /** @param {number} now rAF timestamp, ms */
    function frame(now) {
        if (!alive) return;
        const t = now * 0.001;
        if (!prevT) prevT = t;
        let dt = t - prevT;
        prevT = t;
        if (dt > 0.05) dt = 0.05;
        const dtn = dt * 60;
        flight -= dt / P.FLIGHT_S;
        if (flight < 0) flight = 0;
        if (words.length > 1 && now - lastCycle > P.CYCLE_S * 1000) {
            lastCycle = now;
            cycleIdx = (cycleIdx + 1) % words.length;
            setWord(words[cycleIdx]);
        }
        sim(t, P.REST_AMP + flight * P.FLIGHT_AMP, P.SEEK * (1 - P.WANDER * flight), dtn);
        draw();
        raf = requestAnimationFrame(frame);
    }

    // Unified Pointer Events (no mouse+touch mix): avoids iOS synthesizing a
    // mousemove after touchend that re-arms the repel. Listeners live on the
    // window because the canvas ignores pointer events (the splash buttons
    // underneath must keep their hit targets).
    /** @param {PointerEvent} e */
    function moveAt(e) {
        const r = canvas.getBoundingClientRect();
        pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
    }
    function pointerOff() { pointer.active = false; }
    window.addEventListener('pointerdown', moveAt);
    window.addEventListener('pointermove', moveAt);
    document.documentElement.addEventListener('pointerleave', pointerOff);
    window.addEventListener('pointerup', pointerOff);
    window.addEventListener('pointercancel', pointerOff);
    window.addEventListener('blur', pointerOff);
    window.addEventListener('resize', resize);
    // Re-measure once late layout has settled: the slot is sized from CSS
    // (vmin clamps, safe-area insets), which the first frame can still miss.
    document.fonts?.ready?.then(() => { if (alive) resize(); });

    resize();
    if (reduce) {
        seedState(0, 0);
        draw();
    } else {
        // The flock starts parked on the word with no opening gust — an
        // arrival animation on load draws the eye to a corner signature.
        // The first word cycle (or the cursor) animates it as normal.
        lastCycle = performance.now();
        raf = requestAnimationFrame(frame);
    }

    return {
        /** Stop the engine, drop its listeners, and release the GL context. */
        destroy() {
            if (!alive) return;
            alive = false;
            cancelAnimationFrame(raf);
            window.removeEventListener('pointerdown', moveAt);
            window.removeEventListener('pointermove', moveAt);
            document.documentElement.removeEventListener('pointerleave', pointerOff);
            window.removeEventListener('pointerup', pointerOff);
            window.removeEventListener('pointercancel', pointerOff);
            window.removeEventListener('blur', pointerOff);
            window.removeEventListener('resize', resize);
            // The splash (and this canvas) is about to be removed from the DOM;
            // the game needs every GL context it can get, so hand this one back.
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
    };
}
