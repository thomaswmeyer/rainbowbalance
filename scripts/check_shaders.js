#!/usr/bin/env node
/**
 * Shader equivalence check — does the minified shader draw what the source
 * drew?
 *
 *   npm run check
 *
 * This exists because of what an optimising minifier can do. Renaming a
 * local and folding a constant cannot produce a shader that fails to compile;
 * they produce one that compiles perfectly and draws something subtly
 * different, and a blank or wrong frame at 2am gives no hint whether the
 * minifier or the last edit caused it. spglsl did exactly that to this
 * rainbow once, and this check is what caught it. So: compile both versions
 * in one context, render each across a grid of uniform values at a fixed
 * time, and compare the pixels.
 *
 * Constant folding legitimately shifts the last bit or two of a float, so the
 * comparison allows a difference of TOLERANCE per channel. Anything a person
 * could see is far outside that.
 *
 * Needs a browser. puppeteer-core is a devDependency and finding one is this
 * script's job — the usual places on macOS and Linux, and the browser
 * Playwright keeps if there is one. CHROME_PATH overrides all of that, and
 * PUPPETEER_PATH names a different driver to import. Only if there is no
 * browser anywhere does it skip rather than fail, saying what it looked for:
 * this check spent an unknown length of time skipping quietly, which is worse
 * than not having it.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { minifyGlsl, SHADER_TEMPLATE } from './glsl.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
/**
 * What the two renders are drawn at. Big enough that the smallest thing
 * either draws is more than a handful of pixels: a castle deep in the field
 * covers a dozen pixels at 320×240, almost all of them silhouette, and there
 * a sub-pixel disagreement about where a marched edge falls counts as a
 * whole pixel's worth of difference — twelve of the fifteen outliers allowed,
 * for two renders that agree everywhere at twice this. Doubling it costs
 * four times the readback and about a second.
 */
const W = 640, H = 480;
/** Per-channel difference tolerated between the two renders. */
const TOLERANCE = 2;
/**
 * Fraction of samples allowed over it. A raymarched hard edge turns a
 * last-bit difference in a folded constant into a whole pixel's worth of
 * change, so a few such pixels per frame prove nothing; a stripe of them
 * would.
 */
const OUTLIERS = 1e-5;

/**
 * Per-instance attribute data for the shaders that are drawn instanced, one
 * array of floats per case. A shader whose vertex stage takes attributes draws
 * nothing at all with an unbound buffer, and two identical blank frames pass
 * every comparison, so the sample has to put something real on screen.
 */
const INSTANCES = {
    // x, y at the hooves; scale, signed by facing; phase; side; fighting;
    // health; the block of ice over it; the cape, −1 for a fighter and 0…1
    // for how charged a mage's spell is; a berserker, as a negative. The sweep has
    // to reach all three and keep them apart while it does: the ice is drawn
    // over the whole animal, so the one case under a block has no cape and no
    // rage to hide. `rage` on a case is what asks for it.
    unicorn: (c) => [0, -0.14, 0.62, c.uT * 1.7, c.uB > 0 ? 1 : 0, 0.6, 0.45,
        c.spell > 0.8 ? 0.7 : 0,
        c.uB ? Math.abs(c.uB) : -1,
        c.rage ? -c.rage : 0],
    // x, y; size; age; side; place on the mane's hue sweep, or one of the
    // flat colours behind it: −1 the body, −2 a promotion's white, and −3
    // and −4 the frost and turncoat lines. `hue` on
    // a case names one outright; the rest come off the balance.
    sparks: (c) => [0, 0, 0.3, 0.3, c.uB > 0 ? 1 : 0,
        c.hue ?? (c.uB < -0.5 ? -3 : c.uB > 0.5 ? -2 : 0.5)],
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

/**
 * The cases to sweep. Time is fixed so both renders see the same frame.
 *
 * A key beginning with `u` is a uniform and is set as one; anything else is
 * here only to vary the instance samples above, and is not offered to the
 * shader. `spell` is one of those — it was a `uIntegrity` uniform once, and
 * no shader has declared that in a long while.
 *
 * `rage` and `hue` are two more of those, and both name a colour the sweep
 * would otherwise never reach: a unicorn in a rage, and the spark colours
 * the balance alone does not pick.
 *
 * uC is the castle pass's: where one stands, on the screen and through
 * the same camera the game puts it through, the stone of whoever holds it,
 * and how much of a claim there is on it. There are four castles — a home one
 * under each foot of the bow, one far up the field and one in the foreground
 * — and each depth is a different size on the screen, so each gets a case.
 * Both stones, a castle held by nobody, and one part way through changing
 * hands are each a branch of their own in the shader besides.
 */
const CASES = [
    // The left foot of the bow, polished white, held outright.
    { uT: 3.0, uB: 0.0, spell: 1.0, uC: [-0.6825, -0.1545, 0, 1], uA: [-1, 0, 1, 1] },
    // The right foot, obsidian, held outright.
    { uT: 3.0, uB: 0.75, spell: 0.35, uC: [0.6825, -0.1545, 1, 1], uA: [-1, 1, 1, 1] },
    // Far up the field, nobody's: the smallest a castle ever draws. And the
    // unicorn in this one is in a rage — a case with no ice over it to hide
    // the tint.
    { uT: 7.5, uB: -0.4, spell: 0.7, rage: 0.8, hue: -4, uC: [0, 0.02, 0, 0], uA: [-1, -1, 0.5, 1] },
    // The same, half way to being someone's.
    { uT: 11.0, uB: 1.0, spell: 0.0, uC: [0, 0.02, 1, 0.5], uA: [0.5, 1, 0.5, 1] },
    // The foreground castle, the nearest and so the biggest, part claimed.
    { uT: 5.0, uB: 0.2, spell: 0.9, uC: [0, -0.3134, 1, 0.5], uA: [0.5, 1, 1.45, 0.5] },
    // A foot castle part way through changing hands, with a body-coloured
    // spark from a burst in it, the one flat colour the balance sweep above
    // never picks.
    { uT: 0.25, uB: -1.0, spell: 0.5, hue: -1, uC: [-0.6825, -0.1545, 0, 0.5], uA: [0.5, 0, 1, 1] },
];

async function loadPuppeteer() {
    for (const spec of [process.env.PUPPETEER_PATH, 'puppeteer', 'puppeteer-core']) {
        if (!spec) continue;
        try { return { spec, mod: (await import(spec)).default }; } catch { /* the next */ }
    }
    return null;
}

/**
 * Where a Chrome or Chromium is, if there is one to be had. Full puppeteer
 * brings its own and wants to be left alone about it, which is what undefined
 * says; puppeteer-core brings none and has to be told.
 */
function findChrome() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
    const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const places = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    ];
    // Playwright keeps its browsers in a directory of versioned names.
    if (pw && existsSync(pw)) {
        for (const d of readdirSync(pw).filter((f) => f.startsWith('chromium-'))) {
            places.push(join(pw, d, 'chrome-linux', 'chrome'),
                join(pw, d, 'chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'));
        }
    }
    return places.find(existsSync);
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
    for (const m of src.matchAll(SHADER_TEMPLATE)) {
        const body = m[1];
        // A fragment shader is drawn with the vertex shader last seen in its
        // file, so a file may hold several pairs.
        if (/gl_Position/.test(body)) { vertexByFile.set(name, body); continue; }
        // A second fragment shader in a file is named after the first.
        const n = shaders.filter((s) => s.file === name).length;
        shaders.push({ name: n ? `${name}${n + 1}` : name, file: name, src: body, vs: vertexByFile.get(name) });
    }
}

const sharedVertex = vertexByFile.get('gl');
if (!sharedVertex) {
    console.error('[check] no vertex shader found in src/gl.js — nothing can be drawn');
    process.exit(1);
}
for (const s of shaders) {
    s.vs = s.vs || sharedVertex;
    s.attribs = attribsOf(s.vs);
    s.instances = CASES.map((c) => (INSTANCES[s.name] ? INSTANCES[s.name](c) : null));
    if (s.attribs.length && !INSTANCES[s.name]) {
        console.error(`[check] ${s.name}: vertex stage takes attributes but no sample`
            + ' instance is defined in INSTANCES — it would draw nothing');
        process.exit(1);
    }
}

const driver = await loadPuppeteer();
if (!driver) {
    console.log('[check] SKIPPED — no puppeteer. `npm i` should bring puppeteer-core;'
        + ' or set PUPPETEER_PATH to a driver to import.');
    process.exit(0);
}
const puppeteer = driver.mod;
const chrome = findChrome();
if (!chrome && driver.spec !== 'puppeteer') {
    console.log(`[check] SKIPPED — ${driver.spec} found, but no browser to drive.`
        + ' Install Chrome or Chromium, or point CHROME_PATH at one.');
    process.exit(0);
}
console.log(`[check] ${driver.spec}${chrome ? ` driving ${chrome}` : ''}`);

// Each pair minified, vertex stage included.
const pairs = shaders.map((s) => ({ ...s, min: minifyGlsl(s.src, s.name), vsMin: minifyGlsl(s.vs, s.name) }));

const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
        '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setContent(`<canvas id=c width=${W} height=${H}></canvas>`);

const results = await page.evaluate(async (pairs, cases, tolerance, w, h) => {
    const gl = document.getElementById('c').getContext('webgl2');
    const build = (vs, fs) => {
        const p = gl.createProgram();
        for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
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
        // As gl.js sets them: the value's length picks the call.
        const set = (n, v) => {
            const l = gl.getUniformLocation(prog, n);
            if (l) gl[`uniform${v.length}f`](l, ...v);
        };
        set('uR', [w, h]);
        // Only the uniforms, and every one an array, as gl.js has them. The
        // rest of a case is there to vary the instance samples, and handing a
        // shader a name it never declared is how the last one outlived every
        // shader that read it.
        for (const k in values) if (k[0] === 'u') set(k, [].concat(values[k]));
        // Every uniform the program reads must have been set. A case whose
        // names no longer match the shader's renders with all of them at zero,
        // and source and minified then agree on a blank screen — which is what
        // this check did, unnoticed, from the two-character rename until now.
        for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) {
            const name = gl.getActiveUniform(prog, i).name;
            if (name !== 'uR' && !(name in values)) throw new Error(`uniform ${name} is never set`);
        }
        gl.viewport(0, 0, w, h);
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
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
    };

    gl.bindVertexArray(gl.createVertexArray());
    const out = [];
    for (const pair of pairs) {
        // The minified pair is drawn with the minified vertex shader, so the
        // whole shipped pair is what gets compared, not just the fragment half.
        const a = build(pair.vs, pair.src), b = build(pair.vsMin, pair.min);
        if (a.error || b.error) {
            out.push({ name: pair.name, error: a.error ? `source: ${a.error}` : `minified: ${b.error}` });
            continue;
        }
        let worst = 0, differing = 0, over = 0, worstCase = '';
        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            const pa = render(a.p, c, pair.attribs, pair.instances[i]);
            const pb = render(b.p, c, pair.attribs, pair.instances[i]);
            let localWorst = 0;
            for (let i = 0; i < pa.length; i++) {
                const d = Math.abs(pa[i] - pb[i]);
                if (d) differing++;
                if (d > tolerance) over++;
                if (d > localWorst) localWorst = d;
            }
            if (localWorst > worst) { worst = localWorst; worstCase = JSON.stringify(c); }
        }
        out.push({ name: pair.name, worst, differing, over, worstCase, pixels: w * h * 4 * cases.length });
    }
    return out;
}, pairs, CASES, TOLERANCE, W, H);

await browser.close();

let bad = false;
for (const r of results) {
    if (r.error) { console.error(`[check] ${r.name}: ${r.error}`); bad = true; continue; }
    const pct = (r.differing / r.pixels * 100).toFixed(2);
    const fail = r.over > r.pixels * OUTLIERS;
    if (fail) bad = true;
    console.log(`[check] ${r.name}: ${fail ? 'FAIL' : 'ok'} — worst channel delta ${r.worst}` +
        ` (tolerance ${TOLERANCE}), ${r.over} samples over it (allowed ${Math.floor(r.pixels * OUTLIERS)})` +
        `, ${pct}% differ at all` + (r.worst ? `, worst at ${r.worstCase}` : ''));
}
process.exit(bad ? 1 : 0);
