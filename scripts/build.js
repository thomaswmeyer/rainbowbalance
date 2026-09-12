#!/usr/bin/env node
/**
 * The size-gated build — src/ → dist/index.html → dist/rainbowbalance.zip.
 *
 *   npm run build      # build, report, fail if over budget
 *   npm run size       # the same, one line of output
 *
 * The competition limit is 13,312 bytes for the whole zip. That number is the
 * only build output that matters, so it is printed on every run, along with
 * what each stage of the pipeline bought:
 *
 *   1. esbuild     bundle + minify, __DEBUG__ defined false so the debug panel
 *                  and every development-only branch is eliminated here.
 *   2. GLSL        shader sources (the `g` tagged templates) run through
 *                  shader-minifier-js before esbuild ever sees them.
 *   3. terser      a second pass, mangling every property named with a leading
 *                  underscore — which is why the source names internals that
 *                  way. This is worth several hundred bytes and costs only the
 *                  discipline of the naming rule.
 *   4. Roadroller  context-mixing packer that self-extracts. It beats deflate
 *                  on minified JS by a wide margin, and it is why the zip can
 *                  afford a real game.
 *   5. zopfli      a slower, better deflate for the zip itself.
 *
 * The entry is one self-contained index.html: js13k plays the zip from the
 * filesystem, so nothing may reference a second file.
 */

import * as esbuild from 'esbuild';
import { minify } from 'terser';
import { Packer } from 'roadroller';
import { deflate } from '@gfx/zopfli';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { minifyGlsl, SHADER_TEMPLATE } from './glsl.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'dist');
const LIMIT = 13312;
const quiet = process.argv.includes('--quiet');
const zopfliDeflate = promisify(deflate);

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/**
 * Find the `g`…`` tagged shader templates and replace each with its minified
 * self, before esbuild sees the file. The lookbehind keeps the phrase
 * "`g` template" in a doc comment from being taken for one.
 */
const glslPlugin = {
    name: 'glsl',
    setup(build) {
        build.onLoad({ filter: /src[\\/].*\.js$/ }, (args) => {
            const src = readFileSync(args.path, 'utf8');
            const name = basename(args.path, '.js');
            const contents = src.replace(SHADER_TEMPLATE, (_, body) => {
                glslBytes[0] += body.length;
                const min = minifyGlsl(body, name);
                glslBytes[1] += min.length;
                return '`' + min + '`';
            });
            return { contents, loader: 'js' };
        });
    },
};

/** Shader bytes in and out, for the report. */
const glslBytes = [0, 0];

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const kb = (n) => `${(n / 1024).toFixed(2)}KB`;
const stages = [];
const fail = (msg) => { console.error(`[build] FAILED: ${msg}`); process.exit(1); };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1 + 2. Bundle, with shaders squeezed on the way in.
const bundled = await esbuild.build({
    entryPoints: [join(ROOT, 'src', 'main.js')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    minify: true,
    // The debug panel is reached through a dynamic import inside
    // `if (__DEBUG__)`. Defining it false makes the whole branch dead, so
    // debug.js never enters the bundle at all.
    define: { __DEBUG__: 'false' },
    plugins: [glslPlugin],
    logLevel: 'warning',
});
if (bundled.warnings.length) fail('esbuild reported warnings');
let js = bundled.outputFiles[0].text;
stages.push(['esbuild', js.length]);

if (/initDebug|drive by hand/.test(js)) {
    fail('the debug panel survived into the bundle — check the __DEBUG__ guard');
}

// 3. Terser, mangling our own internals.
const terser = await minify(js, {
    module: false,
    ecma: 2020,
    compress: { passes: 3, unsafe: true, unsafe_math: true, unsafe_arrows: true,
        booleans_as_integers: true, drop_console: true },
    mangle: { properties: { regex: /^_/ } },
    format: { comments: false },
});
if (!terser.code) fail('terser produced nothing');
js = terser.code;
stages.push(['terser', js.length]);

// 4. Roadroller.
const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], {});
await packer.optimize(1);
const { firstLine, secondLine } = packer.makeDecoder();
const packed = firstLine + secondLine;
stages.push(['roadroller', packed.length]);

// 5. One self-contained page. Nothing but the script is in it: main.js makes
//    the canvas and the styling, so that they are packed rather than merely
//    deflated. The body tag is there so document.body exists when it runs.
if (packed.includes('</script')) fail('packed payload contains </script — it would end the tag early');
const html = '<!doctype html><meta charset=utf-8><title>Rainbow Balance</title><body><script>'
    + packed + '</script>';
writeFileSync(join(OUT, 'index.html'), html);

// 6. Zip it, the way the submission will be zipped.
const name = Buffer.from('index.html');
const body = Buffer.from(html);
const comp = Buffer.from(await zopfliDeflate(body, { numiterations: 200 }));
const crc = crc32(body);
const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18);
local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(body.length, 24);
central.writeUInt16LE(name.length, 28);
const cdOffset = local.length + name.length + comp.length;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(cdOffset, 16);
const zip = Buffer.concat([local, name, comp, central, name, end]);
writeFileSync(join(OUT, 'rainbowbalance.zip'), zip);

/** @param {Buffer} buf @returns {number} */
function crc32(buf) {
    let c = ~0;
    for (const byte of buf) {
        c ^= byte;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
}

// --- report -----------------------------------------------------------------

const free = LIMIT - zip.length;
if (!quiet) {
    let prev = 0;
    for (const [label, size] of stages) {
        const delta = prev ? ` (${((size / prev - 1) * 100).toFixed(0)}%)` : '';
        console.log(`  ${label.padEnd(11)} ${String(size).padStart(6)} B${delta}`);
        prev = size;
    }
    console.log(`  ${'html'.padEnd(11)} ${String(html.length).padStart(6)} B`);
    console.log(`  ${'glsl'.padEnd(11)} ${String(glslBytes[1]).padStart(6)} B` +
        ` (${((glslBytes[1] / glslBytes[0] - 1) * 100).toFixed(0)}% of ${glslBytes[0]} B raw)`);
}
console.log(`[build] ${zip.length} / ${LIMIT} bytes — ${free} free ` +
    `(${(free / LIMIT * 100).toFixed(1)}%, ${kb(free)})`);

if (free < 0) fail(`over budget by ${-free} bytes`);
