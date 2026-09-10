/**
 * The thinnest WebGL2 layer that still hides the boilerplate.
 *
 * Two drawing primitives, which between them cover everything this game needs:
 *
 *   - `fullscreen()` — one triangle covering the viewport, for the procedural
 *     passes (sky, ground, rainbow). No geometry, no textures: the fragment
 *     shader is the artwork.
 *   - `Batch` — instanced unit quads, for everything there are many of
 *     (unicorns, castles, particles). One draw call per batch, per-instance
 *     data in a single interleaved buffer.
 *
 * Size discipline for this file, and every file here:
 *   - Internal properties are named with a leading underscore. The build
 *     mangles those (`terser --mangle-props /^_/`), so `this._program` costs
 *     two bytes in the shipped build and `this.program` would cost eight.
 *   - Shader source goes in a `g` tagged template. The build finds those and
 *     runs a GLSL squeezer over them; nothing else in the file is touched.
 *     Do not interpolate into them — `${}` inside a shader would be dropped.
 */

/** Shader-source tag. Identity at runtime; a marker for the build. */
export const g = (s) => s.raw[0];

/** @type {WebGL2RenderingContext} */
export let gl;

/** Seconds since boot, and the viewport, as every shader wants them. */
export let time = 0;
export let width = 1;
export let height = 1;

/**
 * Bring up the context. Returns false when WebGL2 is unavailable, which is the
 * one failure the page has to survive gracefully — js13k judges play on
 * whatever they have to hand.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {boolean}
 */
export function initGl(canvas) {
    gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        // The compositor never needs to read these back, and saying so lets the
        // driver keep the framebuffer where it is.
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
    }));
    if (!gl) return false;
    gl.enable(gl.BLEND);
    // Premultiplied alpha. The unicorn shader composites a dozen parts into one
    // accumulator before it writes anything, and premultiplied is the form that
    // comes out of that for free — straight alpha would need a divide per pixel
    // to undo. Every pass that writes alpha < 1 must premultiply its colour.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
}

/**
 * Size the drawing buffer to the element's real pixels, capped at 2× so a 3×
 * phone does not render four times the fragments for a rainbow nobody is
 * inspecting that closely.
 *
 * @param {HTMLCanvasElement} canvas
 */
export function resize(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = (canvas.clientWidth * dpr) | 0;
    const h = (canvas.clientHeight * dpr) | 0;
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = width = w;
    canvas.height = height = h;
    gl.viewport(0, 0, w, h);
}

/** @param {number} t seconds since boot */
export function setTime(t) { time = t; }

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/**
 * Compile and link, and throw with the log on failure. The throw only ever
 * fires in development — a shipped shader either compiled here or was never
 * run at all — so the message is worth having and costs nothing after the
 * build strips it.
 *
 * @param {string} vsSrc
 * @param {string} fsSrc
 * @returns {WebGLProgram}
 */
export function program(vsSrc, fsSrc) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vsSrc], [gl.FRAGMENT_SHADER, fsSrc]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (__DEBUG__ && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n')
                .map((l, i) => `${i + 1}: ${l}`).join('\n'));
        }
        gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (__DEBUG__ && !gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
    }
    return p;
}

/**
 * Uniform locations by name, looked up once. Returns a setter that takes an
 * object of values — `u({ uBalance: 0.5, uRes: [w, h] })` — so call sites read
 * as data rather than as a run of gl.uniform* calls.
 *
 * @param {WebGLProgram} p
 * @param {string[]} names
 * @returns {(values: Record<string, number|number[]>) => void}
 */
export function uniforms(p, names) {
    const loc = {};
    for (const n of names) loc[n] = gl.getUniformLocation(p, n);
    return (values) => {
        for (const n in values) {
            const v = values[n];
            const l = loc[n];
            if (l == null) continue;
            if (typeof v === 'number') gl.uniform1f(l, v);
            else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
            else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
            else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
        }
    };
}

// ---------------------------------------------------------------------------
// Fullscreen pass
// ---------------------------------------------------------------------------

/**
 * The vertex shader every procedural pass shares: one oversized triangle, no
 * attributes, position derived from gl_VertexID. Cheaper than a quad (no
 * diagonal seam, three vertices instead of six) and it needs no buffer at all.
 */
export const FULLSCREEN_VS = g`#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** @type {WebGLVertexArrayObject|null} */
let _emptyVao = null;

/** Draw the fullscreen triangle with the currently bound program. */
export function fullscreen() {
    if (!_emptyVao) _emptyVao = gl.createVertexArray();
    gl.bindVertexArray(_emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------------------------------------------------------------------------
// Instanced quads
// ---------------------------------------------------------------------------

/**
 * A pile of quads drawn in one call.
 *
 * Per-instance data is whatever the caller writes into `data` — the stride is
 * declared once, at construction, as a list of attribute widths. The unit quad
 * itself is not stored anywhere: the vertex shader builds it from
 * gl_VertexID like the fullscreen triangle does, so a batch owns exactly one
 * buffer.
 */
export class Batch {
    /**
     * @param {WebGLProgram} prog
     * @param {number[]} widths component count of each per-instance attribute,
     *   bound to locations 0, 1, 2… in order
     * @param {number} max maximum instances
     */
    constructor(prog, widths, max) {
        this._prog = prog;
        this._stride = widths.reduce((a, b) => a + b, 0);
        this._max = max;
        this._data = new Float32Array(max * this._stride);
        this._n = 0;

        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        this._buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
        gl.bufferData(gl.ARRAY_BUFFER, this._data.byteLength, gl.DYNAMIC_DRAW);

        let offset = 0;
        widths.forEach((w, i) => {
            gl.enableVertexAttribArray(i);
            gl.vertexAttribPointer(i, w, gl.FLOAT, false, this._stride * 4, offset * 4);
            gl.vertexAttribDivisor(i, 1);
            offset += w;
        });
        gl.bindVertexArray(null);
    }

    /** Drop every instance. Call once per frame before pushing. */
    clear() { this._n = 0; }

    /**
     * Add one instance. Values are written in attribute order; a batch that is
     * already full silently drops the instance rather than growing, because a
     * reallocation mid-frame is the one thing that would stutter.
     * @param {...number} values
     */
    push(...values) {
        if (this._n >= this._max) return;
        this._data.set(values, this._n++ * this._stride);
    }

    /** Upload what was pushed and draw it. */
    draw() {
        if (!this._n) return;
        gl.useProgram(this._prog);
        gl.bindVertexArray(this._vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._data, 0, this._n * this._stride);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this._n);
    }
}

/**
 * The companion vertex-shader prelude for a Batch: turns gl_VertexID 0..3 into
 * the corners of a unit quad centred on the origin.
 */
export const QUAD_CORNER = g`
vec2 corner(){
  return vec2(float(gl_VertexID & 1) - 0.5, float((gl_VertexID >> 1) & 1) - 0.5);
}`;
