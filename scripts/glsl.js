/**
 * Shader minification. The regex squeezer is the default, and that is a
 * deliberate demotion of the better tool.
 *
 * `spglsl` (Salvatore Previti's GLSL compiler, written for this competition)
 * is strictly more capable: it parses, folds constants, mangles local and
 * function names, and validates. It is worth ~180 bytes of zip on the one
 * shader here and more as the shaders grow.
 *
 * **It also miscompiles, silently, in 0.3.1.** It strips the parentheses from
 * `x - (y - z)` without flipping the inner sign:
 *
 *     source                    spglsl 0.3.1 emits    correct
 *     uA - (uB - uC * 0.5)      uA-uB-uC*.5           uA-uB+uC*.5
 *     uA - (uB - uC)            uA-uB-uC              uA-uB+uC
 *     uA - (uB + uC)            uA-(uB+uC)            ✓ (this one is fine)
 *
 * The result compiles, links, runs, and draws the wrong picture. Our own
 * rainbow hit it on `(r - (radius - w * 0.5)) / w` — the band's coordinate —
 * and drew the bow a full band-width out of place, which
 * `npm run check` caught as a 205/255 channel delta.
 *
 * So: `GLSL_SPGLSL=1` opts in, and `npm run check` must pass before you trust
 * a build made that way. Revisit when the budget actually needs those bytes,
 * or when a release fixes it.
 *
 * Uniform, attribute and varying names survive both paths — the renderer looks
 * uniforms up by name, so mangling them would break every draw call.
 */

import { spglslAngleCompile } from 'spglsl';

/**
 * Comments out, indentation out, spaces beside punctuation out. Nothing is
 * renamed and nothing is evaluated, so the worst it can do is fail to compile.
 * @param {string} src
 * @returns {string}
 */
export function minifyGlslRegex(src) {
    const noComments = src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, '');

    const out = [];
    for (let line of noComments.split('\n')) {
        line = line.trim();
        if (!line) continue;
        if (line[0] === '#') { out.push('\n' + line + '\n'); continue; }
        out.push(line + ' ');
    }

    // `++` and `--` that are adjacent in the source are one operator and have
    // to survive; two signs that only become adjacent because the space between
    // them was removed are two, and leaving them glued makes a third. Source
    // adjacency is the only thing that tells those apart, and stripping the
    // spaces destroys it — so record it first and put them back at the end.
    // Without this, `for (int i = 0; i < n; i++)` minifies to `i+ +` and the
    // shader does not compile, which the build never notices because the build
    // does not have a GL context. `npm run check` is what catches it.
    const INC = '\u0001', DEC = '\u0002';

    return out.join('')
        .replace(/\s+/g, (m) => (m.includes('\n') ? '\n' : ' '))
        .replaceAll('++', INC).replaceAll('--', DEC)
        .replace(/\s*([{}();,=<>+\-*/%?:[\]!&|])\s*/g, '$1')
        // Removing a space can glue two operators into a third: `a - -b`.
        .replace(/([+\-])([+\-])/g, '$1 $2')
        .replaceAll(INC, '++').replaceAll(DEC, '--')
        .replace(/\n\s*/g, '\n')
        .trim();
}

/**
 * True when `src` is a whole translation unit rather than a snippet meant to
 * be concatenated into one. Only whole units can go through spglsl; the
 * snippets (QUAD_CORNER and friends) have no `#version` and no `main`, so they
 * take the regex path.
 * @param {string} src
 */
const isWholeShader = (src) => /#version/.test(src);

/**
 * @param {string} src
 * @param {string} [name] for error messages
 * @returns {Promise<string>}
 */
export async function minifyGlsl(src, name = 'shader') {
    if (!process.env.GLSL_SPGLSL || !isWholeShader(src)) return minifyGlslRegex(src);

    const result = await spglslAngleCompile({
        mainSourceCode: src,
        mainFilePath: `${name}.glsl`,
        // `gl_Position` is the only reliable tell between the two stages here.
        language: /gl_Position/.test(src) ? 'vert' : 'frag',
        compileMode: 'Optimize',
        minify: true,
        mangle: true,
        // Everything the JS side addresses by name has to keep it.
        mangleGlobals: false,
    });

    if (!result.valid) {
        throw new Error(`GLSL did not compile (${name}):\n${result.infoLog}`);
    }
    return result.output.trim();
}
