/**
 * Development panel. The build defines __DEBUG__ as false, so the dynamic
 * import that reaches this module is dead code by the time esbuild runs and
 * none of it ships — `npm run build` asserts that.
 *
 * Three jobs:
 *
 *   - scrubbing balance by hand, so the rainbow can be judged across its
 *     whole range before there is a game underneath it;
 *   - switching the shader's features off one at a time to see what each
 *     costs in frame rate. The switches are `const int NAME_ON` constants in
 *     the shader, so a feature that is off is gone from the program, not
 *     skipped. `?off=clouds,castle` sets them from the URL;
 *   - tuning the shader's constants live: every
 *     `const float|int NAME = value; // min max` line gets a slider. The
 *     panel rewrites those into uniforms and drives them at frame rate, with
 *     no recompiles. A uniform loop bound is slower than a constant one, so
 *     "bake" recompiles with the current values as real constants: that is
 *     the frame rate to believe. "copy GLSL" puts the values on the
 *     clipboard as const lines to paste back over the source; they also
 *     persist in localStorage.
 */

/**
 * @param {object} state
 * @param {() => void} reset
 * @param {string} shaderSrc the fragment shader
 * @param {(src: string, names?: string[]) => (values: Record<string, number>) => void} recompile
 */
export function initDebug(state, reset, shaderSrc, recompile) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:8px;padding:8px 10px;z-index:9;' +
        'background:#000a;color:#eee;font:12px/1.5 ui-monospace,monospace;border-radius:6px;' +
        'user-select:none;min-width:230px';
    el.innerHTML = `
      <label><input type=checkbox id=dm> drive by hand</label><br>
      balance <input type=range id=db min=-1 max=1 step=.01 value=0 style="width:130px"><br>
      <span id=dr></span> <button id=dx>reset</button><br>
      <span id=df></span>`;
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

    // Feature switches: each `const int NAME_ON = 1` in the shader.
    const features = [...shaderSrc.matchAll(/const int (\w+)_ON\s*=\s*1;/g)].map((m) => m[1]);
    const off = new Set((q.get('off') || '').split(',').filter(Boolean).map((f) => f.toUpperCase()));
    const fs = $('df');
    fs.innerHTML = features.map((f) =>
        `<label><input type=checkbox data-f=${f} ${off.has(f) ? '' : 'checked'}> ${f.toLowerCase()}</label> `).join('');
    /** The shader with the unchecked features compiled out. */
    const switched = () => {
        let src = shaderSrc;
        for (const box of fs.querySelectorAll('input')) {
            if (!box.checked) src = src.replace(new RegExp(`(const int ${box.dataset.f}_ON\\s*=\\s*)1;`), '$10;');
        }
        return src;
    };

    const tuning = initTuning(shaderSrc, switched, recompile);
    fs.onchange = tuning.rebuild;
    if (off.size) tuning.rebuild();
}

// ---------------------------------------------------------------------------
// Shader tuning
// ---------------------------------------------------------------------------

/** One tunable line: type, name, literal, then `// min max [note]`. */
const TWEAK = /^const\s+(float|int)\s+(\w+)\s*=\s*([^;]+);\s*\/\/\s*(-?[\d.e+-]+)\s+(-?[\d.e+-]+)(.*)$/gm;
const STORE = 'tweak';

/**
 * @param {string} shaderSrc
 * @param {() => string} switched the shader with the feature switches applied
 * @param {(src: string, names?: string[]) => (values: Record<string, number>) => void} recompile
 * @returns {{ rebuild: () => void }}
 */
function initTuning(shaderSrc, switched, recompile) {
    /** @type {{type: string, name: string, value: number, min: number, max: number, note: string}[]} */
    const params = [];
    for (const m of shaderSrc.matchAll(TWEAK)) {
        params.push({ type: m[1], name: m[2], value: +m[3], min: +m[4], max: +m[5], note: m[6].trim() });
    }
    if (!params.length) return { rebuild: () => recompile(switched()) };
    const uname = (p) => (p.type === 'int' ? p.name + '_u' : p.name);

    /** Current values by name, seeded from the source then localStorage. */
    const current = {};
    for (const p of params) current[p.name] = p.value;
    try {
        const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
        for (const p of params) if (typeof saved[p.name] === 'number') current[p.name] = saved[p.name];
    } catch { /* fresh start */ }

    /** A float literal GLSL accepts: always with a point or an exponent. */
    const lit = (p, v) => (p.type === 'int' ? String(Math.round(v))
        : /[.e]/.test(String(v)) ? String(v) : v + '.0');
    /** What the number box shows: enough digits to round-trip a slider step. */
    const show = (p, v) => (p.type === 'int' ? String(Math.round(v)) : String(+v.toPrecision(5)));

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:8px;top:8px;bottom:8px;overflow:auto;padding:8px 10px;' +
        'z-index:9;background:#000a;color:#eee;font:12px/1.5 ui-monospace,monospace;' +
        'border-radius:6px;user-select:none;width:360px;box-sizing:border-box';
    document.body.appendChild(panel);

    /** The setter for the live variant, or null while a baked shader runs. */
    let set = null;
    const status = (msg, bad) => {
        const st = panel.querySelector('#tst');
        st.textContent = msg;
        st.style.color = bad ? '#f88' : '#8f8';
    };

    /**
     * Compile the live variant: switches applied, every tunable constant a
     * uniform (ints through a #define, because the one uniform setter in
     * gl.js only speaks float, and that never ships).
     */
    const live = () => {
        const src = switched().replace(TWEAK, (_, type, name) => (type === 'int'
            ? `uniform float ${name}_u;\n#define ${name} int(${name}_u)`
            : `uniform float ${name};`));
        try {
            set = recompile(src, params.map(uname));
            status('live: sliders drive uniforms', false);
        } catch (e) {
            set = null;
            status('live variant failed: ' + String(e.message || e).split('\n')[0], true);
        }
    };

    /** Compile with the current values as constants: the honest frame rate. */
    const bake = () => {
        let src = switched();
        for (const p of params) {
            src = src.replace(new RegExp(`(const\\s+${p.type}\\s+${p.name}\\s*=\\s*)[^;]+;`), `$1${lit(p, current[p.name])};`);
        }
        try {
            recompile(src);
            set = null;
            status('baked: constants, as the build would have them', false);
        } catch (e) {
            status('bake failed: ' + String(e.message || e).split('\n')[0], true);
        }
    };

    const apply = () => {
        if (!set) live();
        if (set) {
            const values = {};
            for (const p of params) values[uname(p)] = current[p.name];
            set(values);
        }
        try { localStorage.setItem(STORE, JSON.stringify(current)); } catch { /* fine */ }
    };

    const rows = [];
    let html = '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<b>tweak</b><span><button id=tb>bake</button> <button id=tc>copy GLSL</button> <button id=tr>reset all</button></span></div>' +
        '<div id=tst style="font-size:11px;margin:2px 0 4px"></div>';
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
    $('tb').onclick = bake;

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
    // A switch flip invalidates whichever variant is running.
    return { rebuild: () => { set = null; apply(); } };
}
