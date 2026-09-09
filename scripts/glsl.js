/**
 * Shader minification, through `shader-minifier-js` — the TypeScript port of
 * Ctrl-Alt-Test's Shader Minifier (github.com/thomaswmeyer/shader-minifier-js),
 * pinned to a commit in package.json.
 *
 * It is a real compiler pass: it parses, folds constants, inlines single-use
 * locals and functions, and renames every identifier the JS side does not
 * address by name. Uniforms, attributes and varyings keep their names
 * (`preserveExternals`) because the renderer looks them up by name, and
 * `main` is never renamed.
 *
 * The options are the ones its Vite plugin uses — `toMinifierOptions({})` —
 * so the output is what the plugin would give a `.frag` import, and the
 * plugin's `test/angle-compile.test.ts` is the promise that ANGLE accepts it.
 * `--webgl` is on, which is the flag that refuses the two rewrites Chrome
 * rejects.
 *
 * Every `g` template must be a whole translation unit, `#version` line
 * first. There is no path for snippets meant to be concatenated into a shader
 * later: the minifier renames functions and would break a call it cannot
 * see, and leaving snippets unminified was a second code path that had to be
 * kept correct for a few dozen bytes. Write the function into each shader
 * that needs it; the minifier inlines it anyway.
 *
 * Why this and not the last tool: `spglsl` 0.3.1 silently miscompiled
 * `x - (y - z)` (see this file's history). Shader Minifier gets it right —
 * `(r - (radius - w * 0.5)) / w` → `(v-e+.0375)/.075` — and `npm run check`
 * renders source against minified to prove it for every shader.
 */

import { minify } from 'shader-minifier-js';
import { toMinifierOptions } from 'shader-minifier-js/vite';

/**
 * Matches a `g`-tagged template in a source file, body in group 1. The
 * lookbehind keeps "`g` template" in a doc comment from counting as one.
 */
export const SHADER_TEMPLATE = /(?<!`)\bg`([^`]*)`/g;

/** The Vite plugin's defaults, so this build and a Vite build agree. */
const OPTIONS = toMinifierOptions({});

/**
 * @param {string} src a whole shader, `#version` first
 * @param {string} [name] for error messages
 * @returns {string}
 */
export function minifyGlsl(src, name = 'shader') {
    if (!/^\s*#version\b/.test(src)) {
        throw new Error(`GLSL template in ${name} is not a whole shader: ` +
            'every g`…` must start with a #version line. Snippets are not supported.');
    }
    // The extension only names the file in error messages; the port reads the
    // stage off the code (`gl_Position` means vertex) for --drop-default-precision.
    const file = `${name}.${/gl_Position/.test(src) ? 'vert' : 'frag'}`;
    try {
        return minify([{ name: file, content: src }], OPTIONS).code.trim();
    } catch (e) {
        throw new Error(`GLSL minification failed (${file}): ${e.message}`);
    }
}
