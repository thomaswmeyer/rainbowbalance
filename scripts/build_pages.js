#!/usr/bin/env node
/**
 * Cloudflare Pages build — assembles the deployable site at dist/pages/.
 *
 *   npm run build:pages      # runs `npm run build` first, then this
 *
 * The deploy is the competition's page served over HTTP instead of played off
 * the filesystem: the one self-contained index.html, the two Pages config
 * files from public/, and a healthz.json for uptime checks. There is nothing
 * else to assemble — by rule the game has no second file — so what this
 * script is really for is the verification at the bottom. Pages publishes
 * whatever directory it is given without looking inside it, and everything
 * that can go wrong here goes wrong as a black page with one console error:
 * the dev index.html deployed instead of the built one, or a CSP that refuses
 * the unpacker.
 *
 * Nothing here is in the dev loop, and nothing here is in the zip. `npm run
 * build` alone still produces the submission.
 */

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'pages');

// Cloudflare rejects a deployment over either limit after it has uploaded it.
// Neither is reachable from a 13KB page, but a stray copy of something large
// is exactly the accident this catches.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Everything the deploy is allowed to contain. A file that turns up here and
// is not on this list was not put there on purpose — add it if it was.
const EXPECTED = ['index.html', '_headers', '_redirects', 'healthz.json'];

const built = path.join(DIST, 'index.html');
if (!existsSync(built)) {
    console.error('[build_pages] dist/index.html missing — run `npm run build` first');
    process.exit(1);
}

// dist/pages/ is inside dist/, which `npm run build` wipes — so this always
// runs after it, and clears its own tree in case it is run on its own.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. The page. Self-contained by construction: scripts/build.js emits the
//    markup, the styles and the whole game inside one <script>.
cpSync(built, path.join(OUT, 'index.html'));

// 2. Pages configuration. It lives in public/ so that the headers and the
//    redirects are reviewable in git rather than clicked into a dashboard.
cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

// 3. A static endpoint for uptime checks, reached at /healthz through the
//    rewrite in public/_redirects.
writeFileSync(path.join(OUT, 'healthz.json'), JSON.stringify({ ok: true }) + '\n');

// --- Verification -----------------------------------------------------------

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const html = readFileSync(path.join(OUT, 'index.html'), 'utf8');
const open = html.indexOf('<script>');
const close = html.lastIndexOf('</script>');
check(open >= 0 && close > open, 'index.html has no <script> block — this is not a built page');

// The packed payload, and the markup around it. Splitting them apart is what
// makes the next check trustworthy: the payload is high-entropy text that
// could contain anything, so it is the shell that gets scanned.
const payload = open >= 0 && close > open ? html.slice(open + '<script>'.length, close) : '';
const shell = open >= 0 && close > open ? html.slice(0, open) + html.slice(close) : html;

check(payload.length > 1000, `the payload is ${payload.length} bytes — the game is not in this page`);

// The competition forbids externally hosted anything, and the deploy should
// be the same page that gets zipped, not a variant that quietly grew a second
// file. Any reference out of the document at all is a failure.
check(!/\b(?:src|href)\s*=|<link|<img|@import|url\(/i.test(shell),
    'index.html references another file — the deploy must be the self-contained build');

// The repo-root index.html is the dev skeleton: it loads src/main.js and turns
// the debug panel on. It would fail the check above too, but by its title it
// is worth naming, because deploying it is the easiest mistake here.
check(!/—\s*dev/.test(shell), 'the dev index.html was deployed instead of dist/index.html');
check(!/__DEBUG__\s*=\s*true/.test(shell), 'index.html turns the debug panel on');

// The CSP has to admit what the payload does, and the payload's first act is
// to eval its way out of the packer. A CSP without this is a black page: the
// deploy succeeds, the build succeeds, and the game never starts.
const headers = readFileSync(path.join(OUT, '_headers'), 'utf8');
const csp = headers.split('\n').find((l) => /^\s*Content-Security-Policy:/i.test(l)) || '';
check(csp !== '', '_headers declares no Content-Security-Policy');
check(/script-src[^;]*'unsafe-inline'/.test(csp),
    "the CSP's script-src has no 'unsafe-inline' — the inline payload would be refused");
if (/\beval\s*\(|\bFunction\s*\(/.test(payload.slice(0, 200))) {
    check(/script-src[^;]*'unsafe-eval'/.test(csp),
        "the CSP's script-src has no 'unsafe-eval' — Roadroller's unpacker would be refused");
}
check(/style-src[^;]*'unsafe-inline'/.test(csp),
    "the CSP's style-src has no 'unsafe-inline' — main.js's stylesheet would be refused");

const redirects = readFileSync(path.join(OUT, '_redirects'), 'utf8');
check(/^\/healthz\s/m.test(redirects), '_redirects has no /healthz rule');

let bytes = 0;
const files = readdirSync(OUT, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(OUT, path.join(e.parentPath ?? e.path, e.name)));
for (const rel of files) {
    const size = statSync(path.join(OUT, rel)).size;
    bytes += size;
    if (size > MAX_FILE_BYTES) {
        failures.push(`${rel} is ${(size / 1024 / 1024).toFixed(1)}MB — over the 25MiB Pages file limit`);
    }
    if (!EXPECTED.includes(rel)) failures.push(`${rel} is in the deploy and nothing put it there`);
}
for (const rel of EXPECTED) check(files.includes(rel), `${rel} missing from the deploy`);

if (failures.length > 0) {
    console.error('[build_pages] FAILED:');
    for (const f of failures) console.error(`  ✖ ${f}`);
    process.exit(1);
}
console.log(`[build_pages] → dist/pages/  (${files.length} files, ${(bytes / 1024).toFixed(2)}KB)`);
