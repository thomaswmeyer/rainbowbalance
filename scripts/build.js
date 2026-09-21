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
import { COMPRESS } from './terser.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'dist');
const LIMIT = 13312;
const quiet = process.argv.includes('--quiet');
const zopfliDeflate = promisify(deflate);

// ---------------------------------------------------------------------------
// The squeeze: shaders, then esbuild, then terser
// ---------------------------------------------------------------------------

const kb = (n) => `${(n / 1024).toFixed(2)}KB`;
const fail = (msg) => { console.error(`[build] FAILED: ${msg}`); process.exit(1); };

/**
 * An esbuild plugin that finds the shader templates in the files `filter`
 * matches and replaces each with its minified self, before esbuild sees the
 * file. `template` is the regex that finds one, body in group 1, and `bytes`
 * counts what went in and what came out, for the report.
 * @param {RegExp} filter
 * @param {RegExp} template
 * @param {number[]} bytes
 */
const glslPlugin = (filter, template, bytes) => ({
    name: 'glsl',
    setup(build) {
        build.onLoad({ filter }, (args) => {
            const name = basename(args.path, '.js');
            let n = 0;
            const contents = readFileSync(args.path, 'utf8').replace(template, (_, body) => {
                bytes[0] += body.length;
                const min = minifyGlsl(body, `${name}-${++n}`);
                bytes[1] += min.length;
                return '`' + min + '`';
            });
            return { contents, loader: 'js' };
        });
    },
});

/**
 * One entry point, bundled and minified by esbuild with the shaders squeezed
 * on the way in, then through terser with the game's compress options. Both
 * outputs come back, since the game checks the first and ships the second.
 * @param {string} entry
 * @param {object} plugin from glslPlugin
 * @param {object} mangle terser's mangle option
 * @param {Record<string, string>} [define] esbuild's compile-time constants
 * @returns {Promise<[string, string]>} esbuild's output, and terser's
 */
async function squeeze(entry, plugin, mangle, define) {
    const bundled = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        minify: true,
        define,
        plugins: [plugin],
        logLevel: 'warning',
    });
    if (bundled.warnings.length) fail(`esbuild reported warnings for ${basename(entry)}`);
    const js = bundled.outputFiles[0].text;
    const terser = await minify(js, {
        module: false,
        ecma: 2020,
        compress: COMPRESS,
        mangle,
        format: { comments: false },
    });
    if (!terser.code) fail(`terser produced nothing for ${basename(entry)}`);
    return [js, terser.code];
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const stages = [];
/** Shader bytes in and out, for the report. */
const glslBytes = [0, 0];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1 to 3. Bundle, with shaders squeezed on the way in, then terser mangling
// our own internals. The debug panel is reached through a dynamic import
// inside `if (__DEBUG__)`: defining it false makes the whole branch dead, so
// debug.js never enters the bundle at all.
const [bundled, js] = await squeeze(join(ROOT, 'src', 'main.js'),
    glslPlugin(/src[\\/].*\.js$/, SHADER_TEMPLATE, glslBytes),
    { properties: { regex: /^_/ } }, { __DEBUG__: 'false' });
stages.push(['esbuild', bundled.length]);
if (/initDebug/.test(bundled)) {
    fail('the debug panel survived into the bundle — check the __DEBUG__ guard');
}
stages.push(['terser', js.length]);

// 4. Roadroller.
const packer = new Packer([{ data: js, type: 'js', action: 'eval' }], {});
// 2 searches harder than 1 for the input permutation the model likes. It is
// worth about fifty bytes and costs about ten seconds a build.
await packer.optimize(2);
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

// Cloudflare Pages sets CF_PAGES in its builds. The site should still go up
// when the packer's noise tips a build a few bytes over, so there it is a
// warning; everywhere else the limit is the limit.
if (free < 0 && process.env.CF_PAGES) {
    console.warn(`[build] over budget by ${-free} bytes — kept for Cloudflare Pages, not for submission`);
} else if (free < 0) fail(`over budget by ${-free} bytes`);

// 7. rainbowbalance.tom.to only: the tom.to word mark on the start screen
//    (site/mark.js), appended as a second script after the zip was written
//    from the page without it. The zip and the Wavedash upload never see it.
if (process.argv.includes('--site') || process.env.CF_PAGES) {
    // The same squeeze as the game, less the zip: each `#version` template in
    // site/ through the GLSL minifier (inkmark.js looks its uniforms,
    // attributes and varyings up by name, and the minifier keeps those), then
    // esbuild, then terser with the game's compress options. No property
    // mangling: that regex was written for the game's own `_` fields.
    const siteShaders = [0, 0];
    const [site, mark] = await squeeze(join(ROOT, 'site', 'mark.js'),
        glslPlugin(/site[\\/].*\.js$/, /`(#version 300 es[^`]*)`/g, siteShaders), true);
    console.log(`[build] site script: esbuild ${kb(site.length)}, terser ${kb(mark.length)}, `
        + `glsl ${siteShaders[1]} of ${siteShaders[0]} B`);
    if (mark.includes('</script')) fail('the site script contains </script — it would end the tag early');
    writeFileSync(join(OUT, 'index.html'), html + '<script>' + mark + '</script>');
    console.log(`[build] site page: the tom.to mark added, ${kb(mark.length)} outside the zip`);
}
