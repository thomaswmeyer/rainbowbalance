/**
 * Development panel. The build defines __DEBUG__ as false, so the dynamic
 * import that reaches this module is dead code by the time esbuild runs and
 * none of it ships — `npm run build` asserts that.
 *
 * It exists for one job: scrubbing balance by hand, so the rainbow can be
 * judged across its whole range before there is a game underneath it.
 */

/**
 * @param {object} state
 * @param {() => void} reset
 */
export function initDebug(state, reset) {
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
}
