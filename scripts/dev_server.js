#!/usr/bin/env node
/**
 * Static file server for development — `npm run dev`, then open the URL.
 *
 * ES modules cannot be loaded over file://, so opening index.html directly
 * does not work; this is the smallest thing that fixes that. No dependencies,
 * no watching, no reload: esbuild is not in the loop during development, the
 * browser loads src/*.js as written, so a save and a refresh is the whole
 * edit cycle.
 */

import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, normalize, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT || 8080;
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.glsl': 'text/plain',
};

createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    // normalize() collapses any ../ before it can climb out of the repo.
    const file = join(ROOT, normalize(url === '/' ? '/index.html' : url));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('not found');
    }
    res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`[dev] http://localhost:${PORT}/`));
