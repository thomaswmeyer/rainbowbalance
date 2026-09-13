/**
 * `npm run sim`, against src/sim.js as terser compresses it for the build.
 *
 * The build is the thing that ships, and a compress option can change what
 * the code means without changing what the source says. This runs every
 * test against the compressed copy, with any arguments passed on, so
 * `npm run sim:min -- games 100` works too.
 *
 * Property mangling is not applied: the tests read the `_` fields by name.
 */
import { minify } from 'terser';
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { COMPRESS } from './terser.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const out = await minify(readFileSync(join(ROOT, 'src/sim.js'), 'utf8'), {
    module: true, ecma: 2020, compress: COMPRESS, mangle: true, format: { comments: false },
});
if (!out.code) throw new Error('terser produced nothing');
const file = join(mkdtempSync(join(tmpdir(), 'sim-min-')), 'sim.js');
writeFileSync(file, out.code);
console.log(`[sim:min] src/sim.js compressed to ${out.code.length} B`);
process.env.SIM_MODULE = pathToFileURL(file).href;
await import('./sim_test.js');
