/**
 * The terser compress options, shared by the build and by `npm run sim:min`,
 * so the tests run against sim.js minified exactly the way it ships.
 *
 * Every option here has to keep strict comparisons meaning what they meant.
 * `booleans_as_integers` did not: it wrote `false` as 0 and left `!==` alone,
 * so `false !== 0` hid the start screen and kept the sunicorns from choosing a
 * castle, in the release build only.
 */
export const COMPRESS = {
    passes: 3, unsafe: true, unsafe_math: true, unsafe_arrows: true, drop_console: true,
};
