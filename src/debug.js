/**
 * Development panel. The build defines __DEBUG__ as false, so the dynamic
 * import that reaches this module is dead code by the time esbuild runs and
 * none of it ships — `npm run build` asserts that.
 *
 * A frame-rate readout under the clock, and two URL switches: `?b=0.5`
 * freezes the balance at a value, for screenshots, and `?off=clouds,castle`
 * compiles those features out of the shaders to see what each costs. The
 * features are `const int NAME_ON` constants in the shaders, so one that is
 * off is gone from the program, not skipped.
 *
 * In git history: the balance scrubber and the feature checkboxes (02ed2de
 * and before), and the slider panel that tuned the shader's constants
 * (0e0063e): a slider for every `const … // min max` line, "bake" to
 * recompile with the values as constants, "copy GLSL" to get them back.
 */

/**
 * @param {object} state
 * @param {() => void} reset unused now; kept so main.js need not care
 * @param {Record<string, string>} sources the fragment shaders, by pass
 * @param {(pass: string, src: string) => void} recompile
 */
export function initDebug(state, reset, sources, recompile) {
    // ?b=0.5 freezes the balance wander at that balance, for screenshots.
    const q = new URLSearchParams(location.search);
    if (q.has('b')) {
        state._manual = true;
        state._balance = +q.get('b');
    }

    // Frame rate, under the clock, a third its size.
    const fps = document.createElement('div');
    fps.style.cssText = 'position:fixed;top:70px;right:12px;color:#fff;font:600 18px/1 system-ui,sans-serif;' +
        'text-shadow:0 1px 3px #000c';
    document.body.appendChild(fps);
    let frames = 0, since = performance.now();
    const tick = () => {
        frames++;
        const now = performance.now();
        if (now - since > 500) {
            fps.textContent = Math.round(frames * 1000 / (now - since)) + ' fps';
            frames = 0; since = now;
        }
        requestAnimationFrame(tick);
    };
    tick();

    // Feature switches, from the URL only: ?off=clouds,castle compiles those
    // out of the shaders. Each is a `const int NAME_ON = 1` in a shader.
    const off = (q.get('off') || '').split(',').filter(Boolean).map((f) => f.toUpperCase());
    for (const pass in sources) {
        let src = sources[pass];
        for (const f of off) src = src.replace(new RegExp(`(const int ${f}_ON\\s*=\\s*)1;`), '$10;');
        if (src !== sources[pass]) {
            try { recompile(pass, src); } catch (e) { console.error(e); }
        }
    }
}
