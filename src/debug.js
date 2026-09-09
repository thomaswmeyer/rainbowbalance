/**
 * Development panel. The build defines __DEBUG__ as false, so the dynamic
 * import that reaches this module is dead code by the time esbuild runs and
 * none of it ships — `npm run build` asserts that.
 *
 * Two jobs:
 *
 *   - scrubbing balance by hand, so the rainbow can be judged across its
 *     whole range before there is a game underneath it;
 *   - tuning the shader's constants live. The panel reads them out of the
 *     shader source — every `const float|int NAME = value; // min max` line —
 *     rewrites each into a uniform, compiles that variant once, and then
 *     drives the uniforms from sliders at frame rate. No recompiles.
 *     "copy GLSL" puts the current values on the clipboard as const lines to
 *     paste back over the source; values also persist in localStorage, so a
 *     reload keeps where you were and "reset" goes back to the source.
 */

/**
 * @param {object} state
 * @param {() => void} reset
 * @param {string} shaderSrc the fragment shader
 * @param {(src: string, names: string[]) => (values: Record<string, number>) => void} tuneWith
 */
export function initDebug(state, reset, shaderSrc, tuneWith) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:8px;padding:8px 10px;z-index:9;' +
        'background:#000a;color:#eee;font:12px/1.5 ui-monospace,monospace;border-radius:6px;' +
        'user-select:none;min-width:230px';
    el.innerHTML = `
      <label><input type=checkbox id=dm> drive by hand</label><br>
      balance <input type=range id=db min=-1 max=1 step=.01 value=0 style="width:130px"><br>
      <span id=dr></span> <button id=dx>reset</button>`;
    document.body.appendChild(el);

    const $ = (id) => el.querySelector('#' + id);
    const manual = $('dm'), bal = $('db'), read = $('dr');

    // ?b=0.5 starts in manual mode at that balance, for screenshots.
    const q = new URLSearchParams(location.search);
    if (q.has('b')) {
        manual.checked = state._manual = true;
        bal.value = state._balance = +q.get('b');
    }

    manual.onchange = () => { state._manual = manual.checked; };
    bal.oninput = () => { if (state._manual) state._balance = +bal.value; };
    $('dx').onclick = reset;

    let frames = 0, fps = 0, since = performance.now();
    const tick = () => {
        frames++;
        const now = performance.now();
        if (now - since > 500) { fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now; }
        if (!state._manual) bal.value = state._balance;
        read.textContent =
            `b ${state._balance.toFixed(2)}  ${state._elapsed.toFixed(1)}s  ${fps}fps`;
        requestAnimationFrame(tick);
    };
    tick();

    initTuning(shaderSrc, tuneWith);
}

// ---------------------------------------------------------------------------
// Shader tuning
// ---------------------------------------------------------------------------

/** One tunable line: type, name, literal, then `// min max [note]`. */
const TWEAK = /^const\s+(float|int)\s+(\w+)\s*=\s*([^;]+);\s*\/\/\s*(-?[\d.e+-]+)\s+(-?[\d.e+-]+)(.*)$/gm;
const STORE = 'tweak';

/**
 * @param {string} shaderSrc
 * @param {(src: string, names: string[]) => (values: Record<string, number>) => void} tuneWith
 */
function initTuning(shaderSrc, tuneWith) {
    /** @type {{type: string, name: string, value: number, min: number, max: number, note: string}[]} */
    const params = [];
    // Ints become float uniforms with a #define wrapper, because the one
    // uniform setter in gl.js only speaks float, and that is the right
    // trade: it never ships.
    const src = shaderSrc.replace(TWEAK, (_, type, name, value, min, max, note) => {
        params.push({ type, name, value: +value, min: +min, max: +max, note: note.trim() });
        return type === 'int'
            ? `uniform float ${name}_u;\n#define ${name} int(${name}_u)`
            : `uniform float ${name};`;
    });
    if (!params.length) return;
    const uname = (p) => (p.type === 'int' ? p.name + '_u' : p.name);

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:8px;top:8px;bottom:8px;overflow:auto;padding:8px 10px;' +
        'z-index:9;background:#000a;color:#eee;font:12px/1.5 ui-monospace,monospace;' +
        'border-radius:6px;user-select:none;width:360px;box-sizing:border-box';
    document.body.appendChild(panel);

    let set;
    try {
        set = tuneWith(src, params.map(uname));
    } catch (e) {
        panel.innerHTML = '<b style="color:#f88">tuning variant failed to compile</b><pre style="white-space:pre-wrap"></pre>';
        panel.querySelector('pre').textContent = String(e.message || e);
        return;
    }

    /** Current values by name, seeded from the source then localStorage. */
    const current = {};
    for (const p of params) current[p.name] = p.value;
    try {
        const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
        for (const p of params) if (typeof saved[p.name] === 'number') current[p.name] = saved[p.name];
    } catch { /* fresh start */ }

    const apply = () => {
        const values = {};
        for (const p of params) values[uname(p)] = current[p.name];
        set(values);
        try { localStorage.setItem(STORE, JSON.stringify(current)); } catch { /* fine */ }
    };

    /** A float literal GLSL accepts: always with a point or an exponent. */
    const lit = (p, v) => (p.type === 'int' ? String(Math.round(v))
        : /[.e]/.test(String(v)) ? String(v) : v + '.0');
    /** What the number box shows: enough digits to round-trip a slider step. */
    const show = (p, v) => (p.type === 'int' ? String(Math.round(v)) : String(+v.toPrecision(5)));

    const rows = [];
    let html = '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<b>tweak</b><span><button id=tc>copy GLSL</button> <button id=tr>reset all</button></span></div>';
    for (const [i, p] of params.entries()) {
        const step = p.type === 'int' ? 1 : (p.max - p.min) / 1000;
        html += `<div style="margin-top:4px">
            <div style="display:flex;justify-content:space-between">
              <span id=tn${i} title="double-click to reset${p.note ? '\n' + p.note : ''}" style="cursor:default">${p.name}</span>
              <input id=tv${i} type=number step=any style="width:90px;font:inherit;background:#222;color:#eee;border:1px solid #444;text-align:right">
            </div>
            <input id=ts${i} type=range min=${p.min} max=${p.max} step=${step} style="width:100%;margin:0">
            ${p.note ? `<div style="color:#999;font-size:11px">${p.note}</div>` : ''}
        </div>`;
    }
    html += '<textarea id=to readonly style="display:none;width:100%;height:160px;margin-top:6px;' +
        'font:11px ui-monospace,monospace;background:#111;color:#ddd;border:1px solid #444"></textarea>';
    panel.innerHTML = html;
    const $ = (id) => panel.querySelector('#' + id);

    for (const [i, p] of params.entries()) {
        const slider = $('ts' + i), box = $('tv' + i), name = $('tn' + i);
        const refresh = () => {
            slider.value = current[p.name];
            box.value = show(p, current[p.name]);
            name.style.color = current[p.name] === p.value ? '' : '#fd8';
        };
        slider.oninput = () => { current[p.name] = +slider.value; refresh(); apply(); };
        box.onchange = () => {
            const v = +box.value;
            if (Number.isFinite(v)) { current[p.name] = p.type === 'int' ? Math.round(v) : v; }
            refresh(); apply();
        };
        name.ondblclick = () => { current[p.name] = p.value; refresh(); apply(); };
        rows.push(refresh);
        refresh();
    }

    $('tr').onclick = () => {
        for (const p of params) current[p.name] = p.value;
        for (const r of rows) r();
        apply();
    };

    // The const lines, semicolons included, ready to paste over the source.
    const glsl = () => params.map((p) =>
        `const ${p.type.padEnd(5)} ${p.name.padEnd(12)} = ${(lit(p, current[p.name]) + ';').padEnd(12)}` +
        `// ${p.min} ${p.max}${p.note ? '  ' + p.note : ''}`).join('\n');
    $('tc').onclick = async () => {
        const text = glsl();
        const out = $('to');
        out.style.display = 'block';
        out.value = text;
        try { await navigator.clipboard.writeText(text); $('tc').textContent = 'copied'; }
        catch { out.select(); $('tc').textContent = 'select & copy'; }
        setTimeout(() => { $('tc').textContent = 'copy GLSL'; }, 1200);
    };

    apply();
}
