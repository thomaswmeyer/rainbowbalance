/**
 * rainbowbalance.tom.to only: the tom.to word mark in the bottom-right corner
 * of the start screen, as on Lord of the Swarm's splash.
 *
 * None of this is in the js13k zip or the Wavedash build. The Cloudflare Pages
 * build (or `npm run build:site`) appends it to dist/index.html as a second
 * script, after the zip has been written, so it costs none of the 13 KB.
 *
 * It runs after the game's own script, which has already built the page and
 * put the start screen up. The mark sits above the overlay, so a click on it
 * opens tom.to instead of starting a run, and it clears the rainicorns'
 * research panel below it. The first time the start screen is hidden, Play
 * was pressed: the mark fades, then hands back its WebGL context and
 * listeners.
 */
import { mountInkMark } from './inkmark.js';

// inkmark.js draws in this stack too; the text is its fallback without WebGL2.
const FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, 'Iowan Old Style', 'Hoefler Text', Georgia, serif";

const style = document.createElement('style');
style.textContent = '#mark{--f:clamp(28px,6.5vmin,48px);position:fixed;z-index:9;'
    + 'right:max(16px,env(safe-area-inset-right,0px));'
    + 'bottom:max(100px,env(safe-area-inset-bottom,0px));'
    + 'width:calc(var(--f)*5.3);height:calc(var(--f)*1.4);display:flex;align-items:center;'
    + `justify-content:flex-end;font:600 var(--f)/1 ${FONT};color:rgba(255,255,255,.92);`
    + 'text-decoration:none;cursor:pointer;user-select:none;-webkit-user-select:none;'
    + '-webkit-tap-highlight-color:transparent;transition:opacity .6s}'
    + '#mark.gone{opacity:0;pointer-events:none}'
    + '#mark:focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:4px;border-radius:4px}'
    + '#mark.live span{visibility:hidden}'
    + '#mark canvas{position:absolute;top:-80px;left:-80px;width:calc(100% + 160px);'
    + 'height:calc(100% + 160px);pointer-events:none}';
document.head.append(style);

const mark = document.createElement('a');
mark.id = 'mark';
mark.href = 'https://tom.to/';
mark.target = '_blank';
mark.rel = 'noopener noreferrer';
mark.setAttribute('aria-label', "tom.to — the site of the game's author");
mark.innerHTML = '<span aria-hidden="true">tom.to</span><canvas aria-hidden="true"></canvas>';
document.body.append(mark);

const ink = mountInkMark({ canvas: mark.querySelector('canvas'), slot: mark });
if (ink) mark.classList.add('live');

const leave = () => {
    mark.classList.add('gone');
    setTimeout(() => { ink?.destroy(); mark.remove(); style.remove(); }, 700);
};
const over = document.getElementById('o');
if (!over || over.style.display === 'none') {
    leave();
} else {
    const watch = new MutationObserver(() => {
        if (over.style.display !== 'none') return;
        watch.disconnect();
        leave();
    });
    watch.observe(over, { attributes: true, attributeFilter: ['style'] });
}
