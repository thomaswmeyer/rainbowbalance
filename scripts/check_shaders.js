#!/usr/bin/env node
/**
 * Shader equivalence check — does the minified shader draw what the source
 * drew?
 *
 *   npm run check
 *
 * This exists because of what spglsl does. Renaming a local and folding a
 * constant cannot produce a shader that fails to compile; they produce one
 * that compiles perfectly and draws something subtly different, and a blank or
 * wrong frame at 2am gives no hint whether the minifier or the last edit
 * caused it. So: compile both versions in one context, render each across a
 * grid of uniform values at a fixed time, and compare the pixels.
 *
 * Constant folding legitimately shifts the last bit or two of a float, so the
 * comparison allows a difference of TOLERANCE per channel. Anything a person
 * could see is far outside that.
 *
 * Needs a browser: `npm i -D puppeteer`, or point PUPPETEER_PATH at an
 * existing installation. Without one it skips rather than fails, so it never
 * blocks a build.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { minifyGlsl } from './glsl.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
/** Per-channel difference tolerated between the two renders. */
const TOLERANCE = 2;

/**
 * Per-instance attribute data for the shaders that are drawn instanced, one
 * array of floats per case. A shader whose vertex stage takes attributes draws
 * nothing at all with an unbound buffer, and two identical blank frames pass
 * every comparison, so the sample has to put something real on screen.
 */
const INSTANCES = {
    // x, y at the hooves; scale, signed by facing; gallop phase; side.
    unicorn: (c) => [0, -0.14, 0.62, c.uTime * 1.7, c.uBalance > 0 ? 1 : 0],
};

/** Component count of each GLSL type an attribute can have. */
const WIDTHS = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

/**
 * The instance attributes a vertex shader declares, in location order.
 * @param {string} vs
 */
const attribsOf = (vs) =>
    [...vs.matchAll(/layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*in\s+(\w+)/g)]
        .map(([, loc, type]) => ({ loc: +loc, width: WIDTHS[type] }))
        .sort((a, b) => a.loc - b.loc);

/** Uniform values to sweep. Time is fixed so both renders see the same frame. */
const CASES = [
    { uTime: 3.0, uBalance: 0.0, uIntegrity: 1.0 },
    { uTime: 3.0, uBalance: 0.75, uIntegrity: 0.35 },
    { uTime: 7.5, uBalance: -0.4, uIntegrity: 0.7 },
    { uTime: 11.0, uBalance: 1.0, uIntegrity: 0.0 },
    { uTime: 0.25, uBalance: -1.0, uIntegrity: 0.5 },
];

async function loadPuppeteer() {
    for (const spec of [process.env.PUPPETEER_PATH, 'puppeteer']) {
        if (!spec) continue;
        try { return (await import(spec)).default; } catch { /* try the next */ }
    }
    return null;
}

// Collect every complete shader in src/. A file that brings its own vertex
// shader is drawn with that one; everything else gets the fullscreen triangle
// out of gl.js. Pairing a fragment shader with the wrong vertex stage links
// against the wrong varyings and reports a failure that is not there.
const shaders = [];
/** @type {Map<string, string>} module name → its vertex shader */
const vertexByFile = new Map();
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.js'))) {
    const name = basename(file, '.js');
    const src = readFileSync(join(SRC, file), 'utf8');
    for (const m of src.matchAll(/\bg`([^`]*)`/g)) {
        const body = m[1];
        if (!/#version/.test(body)) continue;               // a snippet, not a unit
        if (/gl_Position/.test(body)) { vertexByFile.set(name, body); continue; }
        shaders.push({ name, src: body });
    }
}

const sharedVertex = vertexByFile.get('gl');
if (!sharedVertex) {
    console.error('[check] no vertex shader found in src/gl.js — nothing can be drawn');
    process.exit(1);
}
for (const s of shaders) {
    s.vs = vertexByFile.get(s.name) || sharedVertex;
    s.attribs = attribsOf(s.vs);
    s.instances = CASES.map((c) => (INSTANCES[s.name] ? INSTANCES[s.name](c) : null));
    if (s.attribs.length && !INSTANCES[s.name]) {
        console.error(`[check] ${s.name}: vertex stage takes attributes but no sample`
            + ' instance is defined in INSTANCES — it would draw nothing');
        process.exit(1);
    }
}

const puppeteer = await loadPuppeteer();
if (!puppeteer) {
    console.log('[check] SKIPPED — no puppeteer. `npm i -D puppeteer`, or set PUPPETEER_PATH.');
    process.exit(0);
}

const pairs = [];
for (const s of shaders) pairs.push({ ...s, min: await minifyGlsl(s.src, s.name) });
(await import('spglsl')).spglslUnload();

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
        '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setContent('<canvas id=c width=320 height=240></canvas>');

const results = await page.evaluate(async (pairs, cases) => {
    const gl = document.getElementById('c').getContext('webgl2');
    const build = (vertexSrc, fs) => {
        const p = gl.createProgram();
        for (const [type, src] of [[gl.VERTEX_SHADER, vertexSrc], [gl.FRAGMENT_SHADER, fs]]) {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                return { error: gl.getShaderInfoLog(sh) };
            }
            gl.attachShader(p, sh);
        }
        gl.linkProgram(p);
        return gl.getProgramParameter(p, gl.LINK_STATUS) ? { p } : { error: gl.getProgramInfoLog(p) };
    };

    const buf = gl.createBuffer();
    const render = (prog, values, attribs, instance) => {
        gl.useProgram(prog);
        const set = (n, v) => {
            const l = gl.getUniformLocation(prog, n);
            if (l) Array.isArray(v) ? gl.uniform2f(l, v[0], v[1]) : gl.uniform1f(l, v);
        };
        set('uRes', [320, 240]);
        for (const k in values) set(k, values[k]);
        gl.viewport(0, 0, 320, 240);
        // A shader that discards leaves whatever the last draw wrote, and the
        // two programs are rendered one after the other into the same buffer.
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (instance) {
            const stride = attribs.reduce((a, b) => a + b.width, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instance), gl.STREAM_DRAW);
            let off = 0;
            for (const a of attribs) {
                gl.enableVertexAttribArray(a.loc);
                gl.vertexAttribPointer(a.loc, a.width, gl.FLOAT, false, stride * 4, off * 4);
                gl.vertexAttribDivisor(a.loc, 1);
                off += a.width;
            }
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
            for (const a of attribs) gl.disableVertexAttribArray(a.loc);
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        const px = new Uint8Array(320 * 240 * 4);
        gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
    };

    gl.bindVertexArray(gl.createVertexArray());
    const out = [];
    for (const pair of pairs) {
        const a = build(pair.vs, pair.src), b = build(pair.vs, pair.min);
        if (a.error || b.error) {
            out.push({ name: pair.name, error: a.error ? `source: ${a.error}` : `minified: ${b.error}` });
            continue;
        }
        let worst = 0, differing = 0, worstCase = '';
        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            const pa = render(a.p, c, pair.attribs, pair.instances[i]);
            const pb = render(b.p, c, pair.attribs, pair.instances[i]);
            let localWorst = 0;
            for (let i = 0; i < pa.length; i++) {
                const d = Math.abs(pa[i] - pb[i]);
                if (d) differing++;
                if (d > localWorst) localWorst = d;
            }
            if (localWorst > worst) { worst = localWorst; worstCase = JSON.stringify(c); }
        }
        out.push({ name: pair.name, worst, differing, worstCase, pixels: 320 * 240 * 4 * cases.length });
    }
    return out;
}, pairs, CASES);

await browser.close();

let bad = false;
for (const r of results) {
    if (r.error) { console.error(`[check] ${r.name}: ${r.error}`); bad = true; continue; }
    const pct = (r.differing / r.pixels * 100).toFixed(2);
    const verdict = r.worst > TOLERANCE ? 'FAIL' : 'ok';
    if (r.worst > TOLERANCE) bad = true;
    console.log(`[check] ${r.name}: ${verdict} — worst channel delta ${r.worst}` +
        ` (tolerance ${TOLERANCE}), ${pct}% of samples differ at all` +
        (r.worst ? `, worst at ${r.worstCase}` : ''));
}
process.exit(bad ? 1 : 0);
