/**
 * The simulation — the fight the player never commands.
 *
 * Castles spawn fighters. A fighter picks the nearest enemy it can see —
 * within LOOK of it, and not already set upon by CROWD others — and closes
 * on it. Targeting is one-way: being picked does not make the target pick
 * back. What makes it mutual is being hit. A unicorn that takes a blow turns
 * on whoever landed it, unless it is already horn to horn with someone else,
 * in which case it finishes that fight first. So a unicorn can be jumped
 * from behind while it is busy, and two can gang up on one, but no more.
 *
 * A fight is a sequence of swings, one a second, at the bottom of the neck's
 * lunge, each of which may miss. That is what keeps two evenly matched
 * unicorns from draining each other smoothly and dying in the same instant.
 *
 * With no enemy in sight a fighter walks toward the nearest castle that is
 * not its own, which is what brings the two sides into contact, and is how a
 * castle changes hands: standing on one is what takes it.
 *
 * Positions are on the ground, in world units, flat: x across, y away from
 * the camera. Every distance in here is an ordinary distance between two
 * points on a plain, and a unicorn's size does not change as it walks. What
 * the field being drawn in perspective costs is paid once, at the very end,
 * by project(), which is the same camera the world shader raymarches the
 * ground with and the same one the castle shader plants a castle with. So a
 * castle deep in the field is not a smaller thing to walk to, to stand on or
 * to hold; it only looks smaller, because it is further away.
 *
 * A castle stands under each foot of the bow, at FOOT, and one stands far up
 * the field between them, which is what gives the fight somewhere to go that
 * is not along a single line.
 *
 * Balance — the one number the sky, the bow and the castles read — is who
 * has more fighters alive, smoothed so the weather does not flicker with
 * every death.
 */

/**
 * Where the two home castles stand: under the bow's feet. Keep in step with
 * rainbow.js, whose bow draws its feet from the same numbers. main.js reads
 * FOOT too, to sort the bow into the depth order at its own feet.
 */
export const FOOT = 21;
const FOOT_X = 16.55;
/**
 * And where the unclaimed one stands: on the middle of the field, most of
 * the way back to the horizon. Both sides walk to it on the diagonal, which
 * is what puts the fight across the whole ground rather than along the one
 * line the bow's feet make.
 */
const MID_Y = 41.357;
/**
 * And the near one: the same, in the foreground, under the middle of the
 * arch and in front of everything. It is what the first minute is fought
 * over, being the nearest castle to both sides that neither of them holds.
 */
const NEAR_MID_Y = 14.5;
/**
 * What an unclaimed castle turns recruits out at once it is taken, against a
 * home castle's rate. Both of them use it: the one far up the field and the
 * one in the foreground.
 *
 * An outpost, not a barracks. At a home castle's full rate one of them
 * doubled its holder's spawning, from ground half a field closer to the last
 * castle standing, and the fight was over as soon as either changed hands.
 * Half is worth going for — the recruits, the forward ground, and the denying
 * of it — without being a second army on its own. Taking both is worth as
 * much again as the home castle, which is the point: there are two of them
 * now, at opposite ends of the field, and a side cannot sit on both.
 *
 * It is not what makes a run end quickly, and the measurement is worth
 * keeping: with the middle spawning nothing at all, a run still ends eight
 * seconds after the middle falls, because a claim takes half a minute of
 * standing on a castle unopposed and by then the field is already won.
 */
const OUTPOST = 1 / 2;

/**
 * The camera. These three are the world shader's own: it puts the horizon at
 * HORIZON on the screen, looks through a lens of half-angle 30 degrees, whose
 * half-frame is therefore FOCAL deep, and stands EYE above the ground. The
 * castle shader plants a castle by inverting the same three, and the unicorn
 * shader is handed points that came out of them. One camera, so the ground,
 * the walls and the herd agree about where a thing at a given distance
 * belongs and how big it is when it gets there.
 */
const HORIZON = 0.2, FOCAL = 0.866, EYE = 8.596;
/**
 * A point on the ground, and how big a thing of world size s standing on it
 * draws: one divide, then across and size scale by it and depth is read off
 * the horizon. This is the only place perspective happens.
 * @param {number} x across, world units
 * @param {number} y away from the camera, world units
 * @param {number} s world size
 * @returns {[number, number, number]} screen x, screen y, screen size
 */
export const project = (x, y, s) => {
    const k = FOCAL / y;
    return [x * k, HORIZON - EYE * k, s * k];
};

/**
 * The ground band: how far off the front row of the field is, and the back.
 *
 * The back is where the rain lands. The world shader draws sky through the
 * ground wherever the fog is past its cut, and that is the same test that
 * lets the rain streak down, so the line the rain stops at is the line the
 * ground stops at. Measured off a port of that shader's own march, over the
 * hills and across a wide board, it comes down the screen between 0.088 and
 * 0.138 depending on the column; the band ends at the lowest of them, which
 * is this far off, so there is no column anywhere on the board where a
 * unicorn stands above the rain.
 */
export const NEAR_Y = 11.632, FAR_Y = 66.467;
/**
 * How big a full-grown unicorn is, in world units: a body a shade over two
 * long, so a recruit at half of that is about the length of a pony. One
 * number now rather than a ramp across the band, because a unicorn walking up
 * the field does not shrink. The picture shrinks it.
 */
const BODY = 2.0818;
/**
 * How big one of those draws standing at the front of the band: BODY through
 * project() at NEAR_Y, which is as big as a unicorn ever gets on the screen.
 * Nothing in here wants it. It is what sparks.js measures a burst against —
 * a burst off a big animal near the camera is the whole of one, and one off a
 * recruit deep in the field a fraction — and this is the only place that
 * knows all three numbers it is made of. It was NEAR_S here before the
 * world-space conversion took it out, and three copies of 0.155 in sparks.js
 * have been standing in for it since.
 */
export const NEAR_S = BODY * FOCAL / NEAR_Y;

/**
 * How far the ground reaches across, kept as the screen measure it is: half
 * of what the window shows. On the ground it is not one distance, because the
 * camera's wedge opens away from it — the picture holds more real ground at
 * the back than at the front — so what is stored is the half-width of the
 * picture and the ground is worked out per depth where it is needed.
 *
 * It will not go narrower than the castles stand, though. A home castle's
 * outer wall falls at about 0.735 of the way out, and a fighter wants room to
 * stand beside it; on a tall phone half the aspect is a third of that, and
 * squeezing the board to fit would pile both armies onto their own castles.
 * So a narrow window shows less of the board rather than the board being made
 * smaller, and the fight stays where the castles are.
 */
let edge = 16 / 9 / 2;
/**
 * Tell it the window's shape. main.js calls this at the top of every frame,
 * before it steps anything, since a window can be dragged narrower between
 * one frame and the next.
 * @param {number} aspect width over height
 */
export const setEdge = (aspect) => { edge = Math.max(0.84, aspect / 2); };
/** What the bound came out as, which only the tests ask. */
export const edgeAt = () => edge;
/**
 * Half the ground the picture holds at that depth. The board is not a
 * rectangle — the camera's wedge opens away from the viewer, so the far field
 * is wider than the near — and this is where that wedge is worked out.
 * settle() bounds the herd with it, and the harness checks the bound against
 * it rather than against a second copy of the arithmetic with the focal
 * length written out again.
 * @param {number} y away from the camera, world units
 */
export const wideAt = (y) => edge * y / FOCAL;

/** Fighters alive at once, both sides together. The batch is sized to it. */
export const MAX = 64;
/** Seconds between a castle's spawns. */
const SPAWN = 2.2;
/** Hit points at the first level, and walking speed in world units a second. */
const HP = 6;
const SPEED = 4.298;
/**
 * Veterancy. A unicorn starts at half size and wins its way up: every fight
 * it wins and then walks off to heal from earns it a level. A level adds a
 * quarter of a recruit's size and half a recruit's hit points — added, not
 * compounded, so a veteran of ten fights is three and a half times a
 * recruit rather than nine times one. There is no ceiling.
 */
const SCALE0 = 0.5, GROW = 0.25, TOUGH = 0.5;
/**
 * Ice. A unicorn caught by it is inside a block of it, and can do nothing at
 * all until the block has gone: not walk, not fight, not heal, not even
 * flinch. It can still be cut down where it stands, which is the point of
 * it. The block melts from the top down over this many seconds.
 */
export const FREEZE = 20;
/** Out of a fight, a unicorn heals from nothing to full in this many seconds. */
const HEAL = 30;
/** Below this much health, a unicorn that wins a fight withdraws to heal. */
const HURT = 0.5;
/** How close, in the pair's size, two horns have to be to be fighting. */
const REACH = 0.7;
/** How far a unicorn can see an enemy to pick it out. */
const LOOK = 7.815;
/** How many can set upon one unicorn at once. */
const CROWD = 2;
/**
 * The ground a unicorn takes up, in its own lengths: as long as it is, half
 * that deep. Nothing else stands in it — a unicorn that finds one in its way
 * goes around in depth rather than through.
 */
const LONG = 1.25, DEEP = 0.625;
/**
 * How broad a front a column marching on a castle spreads over, in depth.
 * Each fighter walks to a lane of its own a little to one side of the castle
 * rather than at the castle's exact depth: a side that all walked the one
 * line would arrive in single file, and the ground either side of it would
 * go unused. A lane is a real depth off the castle, the same at every castle,
 * and half of one is well inside CAP_R — so a fighter that has arrived in its
 * lane is standing on the castle whatever depth the castle is at, rather than
 * lining up outside the very claim it came for.
 */
const LANE = 2.735;
/**
 * A castle's half-width, and its ground is square: as deep as it is wide,
 * where a unicorn's is half as deep as it is long. Nothing stands in it but
 * the garrison healing there.
 *
 * Half what the castle draws at. The shader's towers reach 1.28 of the
 * castle's own units out from its middle, which at CASTLE_SCALE is 0.751,
 * and a footprint that size kept too much of the field clear: the exclusion
 * is the castle plus the whole of a unicorn, so at 0.751 nothing could bring
 * its middle within 1.4 of the gate, and a castle turned into a hole in the
 * crowd half again as wide as itself. The towers are also up in the air.
 * What stands on the ground is the wall, and a unicorn a little over it
 * reads as a unicorn against it.
 */
const CASTLE_W = 0.375;
/** A swing connects this often, and takes off this much when it does. */
const HIT = 0.65, DMG = 1.5;
/** Radians a second the neck lunges while fighting: one swing a second. */
const LUNGE = 6.2832;
/**
 * Capture, after the planets in Lord of the Swarm. A castle is held by a
 * claim worth CAP points, and what moves that claim is whoever is standing
 * within CAP_R of it: each fighter presses with its size, a recruit counting
 * one and a veteran more, and only the difference between the two sides
 * tells. A castle with as many defenders on it as attackers is held, however
 * big the crowd.
 *
 * Taking one is two jobs, and that is the whole of why it is slow enough to
 * fight over. The claim on a held castle has to be broken first — at nothing
 * the castle belongs to nobody and spawns nothing — and only then can the
 * attackers build a claim of their own back up to full. Breaking is the
 * faster of the two. A raid driven off before its claim is full leaves the
 * castle standing empty for whoever comes back for it.
 */
export const CAP = 20;
const CAP_R = 3.126;
/** Points a recruit adds a second claiming, and takes off a held castle. */
const TAKE = 0.75, BREAK = 1.5;
/**
 * Recruits' worth of pressure past which a crowd does no more. Without it a
 * side that is already winning takes a castle in the second it arrives, and
 * the fight for one is over before it can be fought.
 */
const MOB = 3;

/**
 * The mage: one recruit in MAGE_EVERY comes out of the gate in a cape, and it
 * is the one unicorn here that never fights horn to horn. It walks where a
 * fighter walks, stops as soon as the nearest enemy is within KEEP of it,
 * gives ground to one that gets well inside that, and every COOL seconds
 * freezes the nearest enemy within CAST for FROST seconds
 * — a unicorn that cannot walk, cannot swing and cannot heal, but is still a
 * target and still stands in everyone's way.
 *
 * What it hands its side is not damage. It is a fight where one of the two is
 * not swinging back. What it costs is a fighter's place in the herd, and it
 * never levels besides, a unicorn that never wins a fight never walking off
 * to heal from one. That is all it costs today, and it is not enough: see the
 * README for what a herd of them does to a run.
 *
 * It gives ground to anything that gets well inside KEEP. That is not settled
 * yet: a mage freezes its pursuer every COOL seconds, which takes as much off
 * the pursuer's speed as the frost lasts, so one that backs away the whole
 * time outruns a fighter however slow it is and kites it off the field. What
 * it is to do instead is a design question, not a bug to be patched around.
 *
 * One thing it does not do, having done it once: walk to a distance rather
 * than to a place. Holding KEEP from something is a whole circle of places to
 * stand, nothing pulls a unicorn shoved along that circle back to where it
 * was, and the crowd squeezed mages out of the field one at a time. So it
 * marches to the same castle a fighter would and simply stops short.
 *
 * CAST and KEEP are flat distances like LOOK, not ground to walk: how far a
 * unicorn can reach is not scaled by the depth it stands at, and a spell is
 * reach.
 */
const MAGE_EVERY = 4, MAGE_V = 0.75;
const CAST = 5.861, KEEP = 3.712;
export const COOL = 3.5, FROST = 1.6;

/**
 * Research, after the tech tree in Lord of the Swarm. Neither side is
 * commanded — the player's whole job is that neither is — so what a side
 * does with what it has won is settled here rather than by anybody, and it
 * is the one thing on this field that only ever goes one way. A run held
 * level is not a run in which nothing happens: both sides are getting better
 * at the fight the whole time it lasts, and the hand that kept them level a
 * minute ago is not the hand that keeps them level now.
 *
 * What a side earns it earns twice over, into two pools that buy different
 * things and are never traded against each other. One is spent on the five
 * areas below, a little at a time and for good; the other is saved whole
 * until it can buy the next power outright. Keeping them apart is what stops
 * a side that is saving up from standing still while it saves.
 *
 * RESEARCH is what a home castle at a full claim pays a second — a claim
 * being broken pays less in proportion, exactly as it spawns less — and an
 * outpost pays its half like everything else it does. BOUNTY is what a
 * recruit's worth of enemy is worth when it falls, so a side winning the
 * fight learns faster than a side merely holding ground, and a veteran is
 * worth what its size says it is.
 */
const RESEARCH = 1, BOUNTY = 1;
/**
 * The five areas points go into, in the order the panel draws them: how fast
 * a unicorn walks, how fast it swings, how far off it can pick an enemy out,
 * how far it can reach one, and how fast its castles turn recruits out.
 */
const PACE = 0, SWING = 1, SIGHT = 2, HORN = 3, GATE = 4;
/**
 * What each is worth at full investment, over and above what every unicorn
 * starts with: two fifths again as fast on its feet, a quarter again as fast
 * with its horn, half again the ground it can pick an enemy out across, a
 * little more reach, and a third again the recruits out of the gate.
 *
 * They are not equally strong and no set of numbers here would make them so,
 * because the fight underneath them is a knife edge: a side that takes the
 * first castle wins ninety-nine unattended runs in a hundred, so *any*
 * standing advantage decides one. Measured both ways round — one side full
 * in an area, the other in nothing, over fifty unattended runs — a side full
 * in reach wins 92%, in swing 96%, in creation 100%, in pace 78%, and in
 * sight 54%. Read those as how sharply each cuts, not as how unfair the game
 * is: an unattended run is decided by any asymmetry at all, which is why
 * there is a player.
 *
 * Reach is kept small for a reason of its own. It is the one of the five
 * that changes what a fight looks like rather than only how it goes — two
 * unicorns swinging at each other from a length apart read as two unicorns
 * missing — so it buys the first blow and stops well short of that.
 *
 * Sight is the weak one, and honestly so. A fighter takes the *nearest*
 * enemy within its look, so a longer look never puts a better target in
 * front of it — it only adds further ones, and what it really buys is a
 * willingness to break off towards a fight instead of walking on to a
 * castle, which is not how runs are won here. What redeems it is the wizard:
 * a spell is aimed at what its caster can pick out, so sight is what gives a
 * side with capes the reach to use them. Weak until freeze, worth having
 * after it — which is the one place in this list where what to research
 * depends on what has already been learned.
 */
const GAIN = [0.4, 0.25, 0.6, 0.15, 0.35];
/**
 * Points in one area for the whole of what it is worth, and a square root on
 * the way up to it. The curve is what makes the first points in an area
 * worth more than the last: a side spread over all five ends up stronger
 * than one that poured everything into one, and a side that has just taken
 * up a new area shows for it within seconds rather than at the end of a run.
 *
 * Three hundred is about two minutes of a side's whole income, so five areas
 * is a good deal longer than a run. That is the point of the number rather
 * than a consequence of it: at half this, ten minutes of play left both
 * sides full in all five and fighting with identical unicorns, and a tech
 * tree whose two sides converge has stopped being one.
 */
export const FULL = 300;
/**
 * How a side chooses. It works on one area at a time, and every THINK
 * seconds it may take up another, which it does SWAP of the time. Whatever
 * is already in an area stays there — nothing is ever taken back out — so
 * two sides come out of a long run good at different things, and which
 * things is the run's own doing rather than anybody's plan.
 */
const THINK = 20, SWAP = 0.5;
/**
 * The powers, in the order they are learned, and what each costs out of the
 * saved pool. They are the god's own two hands, which is the point of them:
 * a side that has watched a whole rainbow's worth of its own frozen and
 * struck down out of a clear sky works out in the end how it was done.
 *
 * Freeze puts the cape on one recruit in MAGE_EVERY. Before it there are no
 * wizards at all and the field is horn to horn and nothing else, which is
 * also the answer to a herd silting up with capes: they arrive when a side
 * has earned them rather than from the first minute. Smite gives a wizard a
 * second spell and a rule for choosing between them — see the cast in
 * decide() — and a bolt that lands rather than a hold that waits. Rage is
 * the first of the three a wizard casts on its own side rather than at the
 * other, and the first that is worth anything to a side that is losing: the
 * other two need an enemy in reach, and this one needs a friend in a fight.
 *
 * More belong here. Another is a cost in this list and a case in that rule.
 */
const COST = [45, 140, 250];
/** What a wizard's bolt takes off, against a recruit's HP hit points. */
const SMITE = 2.5;
/**
 * The rage: how long it is on a unicorn, and how much faster it swings while
 * it is. Twice the swings is twice the damage, which is a great deal for six
 * seconds — and it is all it does. It does not walk faster, hit harder or
 * take less, because a rage that changed four things at once would be a
 * thing nobody could read off the field, and a neck going twice as fast is
 * a thing anybody can.
 *
 * It burns down whatever the animal is doing, frozen included, so an enemy
 * wizard's frost is an answer to it: a berserker held still for a second and
 * a half is a berserker with a second and a half less rage. It does not
 * stack, either — casting on one already roaring only sets the clock back —
 * so a side's wizards spread it about rather than piling it on one animal.
 */
export const RAGE = 6;
const FURY = 2;

/**
 * @typedef {object} Unicorn
 * @property {number} _x
 * @property {number} _y
 * @property {number} _s how big it is, in world units: BODY at full grown,
 *   half of that as a recruit, and a quarter of a recruit more for every
 *   level it has won. It does not change with the depth it stands at — the
 *   picture shrinks a unicorn walking up the field, the field does not
 * @property {number} _side 0 sunicorn, 1 rainicorn
 * @property {number} _face +1 looks right, -1 looks left
 * @property {number} _ph gallop phase
 * @property {number} _lane its own depth to walk a castle down at, so that a
 *   column marching on one arrives on a front rather than in single file
 * @property {number} _held seconds of the hold left on it, 0 when free
 * @property {boolean} _block the hold is the player's block of ice rather
 *   than a mage's frost: it is drawn as a block, the crowd cannot shift it,
 *   and the animal inside it settles onto its feet
 * @property {number} _ox where it stood when the last step ended, and
 * @property {number} _oy the same: the ground it covered since is what its
 *   legs are driven by, so a unicorn that is held still does not walk on the
 *   spot however hard it is trying to get somewhere
 * @property {number} _px a point trailing half a second behind it, and
 * @property {number} _py the same, so it can tell whether it is getting
 *   anywhere. Trying to walk is not the same as getting somewhere: one at a
 *   gate walks into the wall, is put back out of it, and walks in again,
 *   every step of it real movement that adds up to standing on the spot
 * @property {number} _hp above 0 alive; 0 down to −1 is the half-second it fades out
 * @property {number} _max hit points at its level
 * @property {number} _lvl how many fights it has won its way up
 * @property {number} _fight 0…1, the fighting pose, eased so it does not snap
 * @property {boolean} [_fell] reported to `fallen` already
 * @property {boolean} [_rest] withdrawing to a friendly castle to heal
 * @property {Unicorn|null} _foe who it is closing on, one way
 * @property {number} _att how many are closing on it
 * @property {boolean} _eng horn to horn right now, so it will not be drawn off
 * @property {Unicorn|null} _hit who landed a blow on it since its last step
 * @property {boolean} _mage it wears the cape: it casts rather than fights
 * @property {number} _cast seconds until its spell comes round again
 * @property {number} _rage seconds of a wizard's rage left on it, 0 when it
 *   is swinging at its own pace
 */

/** @type {Unicorn[]} */
export const herd = [];

/**
 * @typedef {object} Castle
 * @property {number} _x
 * @property {number} _y
 * @property {number} _from whose it is at the start of a run, for reset
 * @property {number} _side whose it is now: 0, 1, or −1 for nobody's
 * @property {number} _cap the claim on it, 0…CAP
 * @property {boolean} _own the claim is full, so it spawns
 * @property {number} _rate how fast it turns recruits out, against a home
 *   castle's rate
 * @property {number} _t seconds to its next spawn
 * @property {number} _n recruits it has turned out, for whose turn it is to
 *   wear the cape
 */

/**
 * The castles: one at each foot of the bow, held from the first frame, and
 * two standing unclaimed between them, one far up the field and one in the
 * foreground, for the two sides to meet over.
 *
 * The near one is last in the array rather than in its place along the field,
 * because the order here is read elsewhere: the first three are the left
 * castle, the middle and the right, and castles[1] is where a fighter with
 * nothing left to take is sent. Nothing walks this list in order otherwise —
 * the draw sorts it by depth and everything else looks for the nearest.
 * @type {Castle[]}
 */
export const castles = [
    { _x: -FOOT_X, _y: FOOT, _from: 0, _side: 0, _cap: CAP, _own: true, _rate: 1, _t: 1, _n: 0 },
    { _x: 0, _y: MID_Y, _from: -1, _side: -1, _cap: 0, _own: false, _rate: OUTPOST, _t: 1, _n: 0 },
    { _x: FOOT_X, _y: FOOT, _from: 1, _side: 1, _cap: CAP, _own: true, _rate: 1, _t: 1, _n: 0 },
    { _x: 0, _y: NEAR_MID_Y, _from: -1, _side: -1, _cap: 0, _own: false, _rate: OUTPOST, _t: 1, _n: 0 },
];

/**
 * What each side has learned: one of these for the sunicorns and one for the
 * rainicorns. Everything else on the field belongs to a unicorn or a castle;
 * this is the only thing a whole side owns.
 *
 * @typedef {object} Tech
 * @property {number[]} _p points put into each of the five areas
 * @property {number[]} _m what those points come to — the multiplier on each,
 *   worked out once a step so that nothing on the field takes a square root
 * @property {number} _on which area it is working on now
 * @property {number} _t seconds until it thinks about that again
 * @property {number} _saved points saved towards the next power
 * @property {number} _got how many powers it has, the list being a chain
 */

/** @type {Tech[]} */
export const tech = [fresh(), fresh()];

/** A side that has learned nothing yet. */
function fresh() {
    return { _p: [0, 0, 0, 0, 0], _m: [1, 1, 1, 1, 1], _on: 0, _t: THINK, _saved: 0, _got: 0 };
}

/** −1 rainicorns ahead … +1 sunicorns ahead, smoothed. */
export let balance = 0;

/** Who fell this step, for main.js to make sparks of. Drained by the reader. */
export const fallen = [];
/** Who came up a level this step, likewise. */
export const promoted = [];
/** Which castles came up to a full claim this step, likewise. */
export const captured = [];
/**
 * The spells cast this step, for main.js to draw the streak of: from the
 * caster's horn to whoever it was aimed at. The freeze itself has already
 * landed — a spell does not miss and does not travel.
 * Its `_k` is which spell it was: 0 the frost, 1 a smite, 2 a rage. They are
 * drawn in three different colours and they are not the same news — and the
 * third of them goes to one of the caster's own.
 * @type {{_x:number,_y:number,_s:number,_tx:number,_ty:number,_ts:number,_k:number}[]}
 */
export const casts = [];

/**
 * The side that holds every castle, with a full claim on each, or −1 while
 * the run is still on. Nothing in the simulation reads it: it stops when
 * main.js stops calling it, so the field holds still at the moment it was won.
 */
export let winner = -1;

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/**
 * The tuning, for the headless harness to check itself against. The guard is
 * what keeps it out of the build: esbuild replaces __DEBUG__ with false, so
 * the whole object folds to null and goes. In Node, where nothing defines
 * __DEBUG__ at all, the harness gets the real thing.
 */
export const TUNE = typeof __DEBUG__ === 'undefined' || __DEBUG__
    ? { HP, HURT, HEAL, LOOK, CROWD, LONG, DEEP, HIT, DMG, REACH, MAX, NEAR_Y, FAR_Y,
        SPAWN, SCALE0, CAP, CAP_R, TAKE, BREAK, MOB, LANE, OUTPOST, FREEZE,
        CASTLE_W, BODY, FOOT, FOOT_X, SPEED,
        MAGE_EVERY, MAGE_V, CAST, KEEP, COOL, FROST,
        RESEARCH, BOUNTY, GAIN, FULL, THINK, SWAP, COST, SMITE, RAGE, FURY,
        PACE, SWING, SIGHT, HORN, GATE }
    : null;


/**
 * Start a run. The seed is the whole of what makes one run differ from
 * another — everything random in here comes off it — so the same seed gives
 * the same run, which is what makes the headless harness worth anything, and
 * a fresh one gives a fresh game.
 * @param {number} [s]
 */
export function reset(s = 7) {
    seed = s;
    herd.length = 0;
    fallen.length = 0;
    promoted.length = 0;
    captured.length = 0;
    casts.length = 0;
    winner = -1;
    balance = 0;
    // Neither side knows anything at the start of a run, and each takes up a
    // first area off the seed, so the same seed researches the same things in
    // the same order as well as fighting the same fight.
    tech[0] = fresh();
    tech[1] = fresh();
    for (const t of tech) t._on = rnd() * 5 | 0;
    for (const c of castles) {
        c._side = c._from;
        c._own = c._from >= 0;
        c._cap = c._own ? CAP : 0;
        c._t = 1;
        c._n = 0;
    }
}

/**
 * @param {{_x:number,_y:number,_side:number}} castle
 */
function spawn(castle) {
    // Out of the gate and a little to one side of it. The same few strides of
    // ground whichever castle it is: a deep one is not a smaller castle, it is
    // a castle further off.
    const y = Math.max(NEAR_Y, castle._y - (0.391 + rnd() * 1.172));
    // Whose turn it is to wear the cape, and whether there is a cape to
    // wear. Counted rather than rolled: both sides get the same one recruit
    // in four, and the run stays reproducible down to which of them it is.
    // The count runs from the first recruit either way — it is what the
    // castle has turned out, not what it has turned out in capes — so a side
    // that learns to freeze halfway through a run does not owe itself three
    // wizards for the ones it did not send.
    const mage = ++castle._n % MAGE_EVERY === 0 && tech[castle._side]._got > 0;
    herd.push({
        _x: castle._x + (rnd() - 0.5) * 1.954,
        _y: y, _s: BODY * SCALE0,
        _side: castle._side,
        _face: castle._side ? -1 : 1,
        _ph: rnd() * 6.283,
        _lane: (rnd() - 0.5) * LANE,
        _px: castle._x, _py: y,
        _ox: castle._x, _oy: y,
        _held: 0,
        _block: false,
        _hp: HP,
        _max: HP,
        _lvl: 0,
        _fight: 0,
        _rest: false,
        _foe: null,
        _att: 0,
        _eng: false,
        _hit: null,
        _mage: mage,
        _cast: COOL,
        _rage: 0,
    });
}

/**
 * Point `un` at `foe`, keeping the count of who is closing on whom right.
 * @param {Unicorn} un
 * @param {Unicorn|null} foe
 */
function aim(un, foe) {
    if (un._foe === foe) return;
    // The count is of the living closing on the living, so a claim is only
    // given back if the count actually holds it. Undoing one it never held —
    // a unicorn that fell this step, or one whose target did — left a gap
    // that let a fourth in past a cap of two.
    if (un._foe && un._hp > 0 && un._foe._hp > 0) un._foe._att--;
    un._foe = foe;
    if (foe && un._hp > 0 && foe._hp > 0) foe._att++;
}

/**
 * Hold a unicorn still: the player's block of ice, or a mage's frost. One
 * state for the two, because they are one effect — a unicorn that cannot
 * walk, cannot swing, cannot heal and cannot cast, and is still a target
 * standing in everyone's way while it lasts.
 *
 * What the block flag carries is the two things that are not the same, both
 * of them deliberate and both of them written down in the README: a block of
 * ice is not shoved by the crowd where the frost leaves the animal in it, and
 * the block is what the renderer draws around the animal rather than over it.
 *
 * A hold is never cut short by a shorter one, which is what keeps a mage
 * casting into the player's ice from turning twenty seconds of block into a
 * second and a half of frost.
 * @param {Unicorn} un
 * @param {number} secs
 * @param {boolean} block the player's ice, rather than a mage's frost
 */
function holdStill(un, secs, block) {
    if (secs <= un._held) return;
    un._held = secs;
    un._block = block;
}

/**
 * The nearest enemy within `look` that is not already set upon by `crowd`
 * others. A fighter looks LOOK ahead and leaves a mobbed one alone; a mage
 * looks as far as its spell reaches and does not care how many are already on
 * its mark, since freezing one is not standing in anyone's way.
 * @param {Unicorn} un
 * @param {number} look
 * @param {number} crowd
 */
function seek(un, look, crowd) {
    let best = null, bd = look * look;
    for (const e of herd) {
        // One foe at a time, up to the cap — whoever it is already after is
        // of course still allowed, or it could not keep the foe it has.
        if (e._side === un._side || e._hp <= 0
            || (e._att >= crowd && e !== un._foe)) continue;
        const d = (e._x - un._x) ** 2 + (e._y - un._y) ** 2;
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

/**
 * The nearest of its own within `look` that is horn to horn and not already
 * roaring: what a wizard with the rage is looking for. Written out rather
 * than folded into seek() with another flag, because what it wants is not
 * the same question — seek() asks who can be attacked and this asks who is
 * worth helping, and the two agree on nothing but the distance.
 *
 * Already fighting, because a rage lasts six seconds and one spent walking
 * is one wasted. Not already roaring, so a side's wizards spread it about.
 * @param {Unicorn} un
 * @param {number} look
 */
function ally(un, look) {
    let best = null, bd = look * look;
    for (const e of herd) {
        if (e._side !== un._side || e._hp <= 0 || !e._eng || e._rage > 0) continue;
        const d = (e._x - un._x) ** 2 + (e._y - un._y) ** 2;
        if (d < bd) { bd = d; best = e; }
    }
    return best;
}

/**
 * The nearest castle of a kind, or null if this unicorn has none of that kind
 * left. A castle is its own when its side holds it with a full claim, which
 * is the only sort that is any use to it: one its side is still working a
 * claim up on is no home, because a castle that cannot spawn cannot heal
 * anyone either.
 *
 * Which makes the other kind everything else — the enemy's, nobody's, and one
 * of its own with a part-made claim on it — and that is where a unicorn with
 * nothing in sight to fight walks. It is what sends both sides to the middle
 * of the field, and what brings them back to finish a claim they walked away
 * from.
 *
 * One search rather than two: the kinds are exact opposites, so the only
 * thing that differs is which side of the test to keep.
 * @param {Unicorn} un
 * @param {boolean} own its own castles, or the ones it has yet to hold
 */
function nearestCastle(un, own) {
    let best = null, bd = Infinity;
    for (const c of castles) {
        if ((c._side === un._side && c._own) !== own) continue;
        const d = (c._x - un._x) ** 2 + (c._y - un._y) ** 2;
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}

/**
 * The claims on the castles, one step. What moves a claim is who is standing
 * on the castle: each living fighter within CAP_R presses with its size, and
 * only the difference between the two sides counts, so an evenly matched
 * crowd holds everything where it is.
 *
 * A claim held by the other side is broken first and built afterwards — the
 * castle passes through belonging to nobody, where it spawns nothing — so
 * taking one off a side that is still spawning into it is the work of two
 * separate stretches of standing there.
 * @param {number} dt seconds
 */
function capture(dt) {
    for (const c of castles) {
        let sun = 0, rain = 0;
        for (const un of herd) {
            if (un._hp <= 0) continue;
            // What counts as standing on this castle: a circle of real ground,
            // the same at every castle. One far up the field looks like a
            // tighter gathering only because it is further away.
            if ((un._x - c._x) ** 2 + (un._y - c._y) ** 2 > CAP_R * CAP_R) continue;
            // Size is the weight: a veteran presses harder than a recruit,
            // the same way it hits harder. A recruit is BODY * SCALE0 across,
            // and counts one.
            const w = un._s / (BODY * SCALE0);
            if (un._side) rain += w; else sun += w;
        }
        const lead = sun - rain;
        if (!lead) continue;
        const side = lead > 0 ? 0 : 1, force = Math.min(MOB, Math.abs(lead));
        if (c._side >= 0 && c._side !== side) {
            // Breaking someone else's claim. At nothing the castle is
            // nobody's, and stops spawning until a claim is full again.
            c._cap -= BREAK * force * dt;
            if (c._cap <= 0) { c._cap = 0; c._side = -1; c._own = false; }
        } else {
            // Building one's own: on an unclaimed castle, or back up on one
            // of its own that an enemy left half broken.
            c._side = side;
            c._cap = Math.min(CAP, c._cap + TAKE * force * dt);
            if (c._cap >= CAP && !c._own) {
                c._own = true;
                // The new garrison is not the old one: the wait for the
                // first spawn starts here.
                c._t = SPAWN;
                captured.push(c);
            }
        }
    }
}

/**
 * A side is paid, into both pools at once. The saved pool takes the whole of
 * it; the rest goes into whichever area the side is working on, and if that
 * one is already full the side takes up another there and then rather than
 * pouring points onto the floor.
 * @param {number} side
 * @param {number} n points
 */
function earn(side, n) {
    const t = tech[side];
    t._saved += n;
    if (t._p[t._on] >= FULL) t._on = pick(t);
    t._p[t._on] = Math.min(FULL, t._p[t._on] + n);
}

/**
 * An area to work on: one of the five that is not yet full, or the one it is
 * already on if they all are. Off the run's own seed, like everything else
 * random here.
 * @param {Tech} t
 */
function pick(t) {
    const room = [];
    for (let i = 0; i < 5; i++) if (t._p[i] < FULL) room.push(i);
    return room.length ? room[rnd() * room.length | 0] : t._on;
}

/**
 * Research, one step: what the ground pays, what each side then does with it,
 * and what all of it comes to on the field.
 *
 * Kills are not counted here. They are paid where the blow lands, in wound(),
 * because that is the only place that knows who struck it — so this is the
 * ground half of a side's income and no more.
 * @param {number} dt seconds
 */
function research(dt) {
    // What a side holds pays it, at the rate of the claim it holds it by: a
    // castle being broken is already worth less to its holder than a quiet
    // one, and it is worth less in this too.
    for (const c of castles) {
        if (c._own) earn(c._side, RESEARCH * c._rate * c._cap / CAP * dt);
    }
    for (const t of tech) {
        // Thinking about where the points are going. This moves the tap and
        // nothing else — what is in an area stays in it.
        t._t -= dt;
        if (t._t <= 0) {
            t._t = THINK;
            if (rnd() < SWAP) t._on = pick(t);
        }
        // And the next power, bought outright the moment it is affordable.
        // One at a time, cheapest first: the list is a chain, so how many a
        // side has is the whole of which ones it has.
        if (t._got < COST.length && t._saved >= COST[t._got]) {
            t._saved -= COST[t._got];
            t._got++;
        }
        // What the points come to, worked out here and read everywhere: the
        // field asks for these several times per unicorn per step, and none
        // of them changes inside a step.
        for (let i = 0; i < 5; i++) t._m[i] = 1 + GAIN[i] * Math.sqrt(t._p[i] / FULL);
    }
}

/**
 * A blow lands. Whatever was struck turns on whoever struck it, and if that
 * was the last blow in it, the striker's side is paid the bounty on what it
 * felled — a veteran for what a veteran took to make.
 *
 * The player's own hand does not go through here, and so is not paid for:
 * god mode is nobody's work but the god's, and a smite that fed the side it
 * was meant to hold back would be a strange thing to hand a player.
 * @param {Unicorn} un who struck
 * @param {Unicorn} foe who was struck
 * @param {number} dmg
 */
function wound(un, foe, dmg) {
    // Never past zero in one blow: zero is where the fade starts, and a blow
    // that overshot it took the unicorn out of the herd before anyone
    // noticed it had fallen.
    foe._hp = Math.max(0, foe._hp - dmg);
    foe._hit = un;
    if (foe._hp <= 0) earn(un._side, BOUNTY * foe._s / (BODY * SCALE0));
}

/**
 * One fixed step: what the sides have learned, the castles, then every
 * unicorn deciding for itself, then the herd settled as a whole.
 *
 * The order is the whole of why it reads the way it does. What a unicorn
 * decides, it decides against the field as it stood at the top of the step —
 * nobody is answering a shove that has not happened yet — and what the crowd
 * then does to it, it does to everybody at once.
 * @param {number} dt seconds
 */
export function step(dt) {
    // Before anything moves, because what a side has learned is what the
    // step is then played under — and against the field as it stood at the
    // top of it, which is the rule everything else in here follows too.
    research(dt);
    capture(dt);

    // Every castle one side's, and every claim on them full: the run is over.
    const first = castles[0]._side;
    if (first >= 0 && castles.every((c) => c._side === first && c._own)) winner = first;

    for (const c of castles) {
        if (!c._own) continue;
        // A castle spawns at its own rate, and at the rate of the claim on
        // it besides, so one that is being broken falls quiet a while
        // before it changes hands.
        c._t -= dt * c._rate * c._cap / CAP * tech[c._side]._m[GATE];
        if (c._t <= 0 && herd.length < MAX) { spawn(c); c._t = SPAWN; }
    }

    // Who is closing on whom, counted afresh: the crowding rule reads it.
    for (const un of herd) un._att = 0;
    for (const un of herd) if (un._hp > 0 && un._foe && un._foe._hp > 0) un._foe._att++;

    decide(dt);
    settle(dt);
}

/**
 * Every unicorn, one at a time, deciding what it is doing and doing it:
 * fading if it has fallen, standing still if it is held, otherwise picking a
 * foe or a castle, walking at it, healing, casting, levelling and moving its
 * legs. Nothing in here looks at the herd as a whole — that is what settle()
 * is for — and nothing in here is allowed to assume it ends up where it
 * meant to, because the crowd has not had its say yet.
 * @param {number} dt seconds
 */
function decide(dt) {
    for (const un of herd) {
        if (un._hp <= 0) {
            // Fading out over half a second. The moment it fell it is
            // reported, and whoever it was fighting is free to seek again.
            if (!un._fell) {
                un._fell = true;
                fallen.push(un);
                // Everyone who was on it has won and is free. A winner left
                // under HURT withdraws to a castle of its own rather than
                // looking for the next fight.
                for (const w of herd) {
                    if (w._foe !== un) continue;
                    aim(w, null);
                    w._eng = false;
                    if (w._hp > 0 && w._hp < w._max * HURT) w._rest = true;
                }
                aim(un, null);
            }
            un._hp -= dt * 2;
            un._fight = Math.max(0, un._fight - dt * 4);
            continue;
        }
        // A rage burns down whatever the animal is doing, and that includes
        // standing frozen: a berserker held still for a second and a half is
        // a berserker with a second and a half less of it, which is what
        // makes an enemy wizard's frost an answer to one.
        if (un._rage > 0) un._rage = Math.max(0, un._rage - dt);

        // Held, by the ice or by the frost: it does nothing and nothing of
        // its own changes, beyond the hold wearing off it. It keeps whatever
        // it was after, to take that up again when it is free — and it is
        // still a target, still presses whatever claim it was standing on,
        // and still stands in everyone's way, which is the whole of what a
        // mage is worth.
        //
        // The pose is the one thing the block does differently, and it is the
        // length of the two that asks for it. Twenty seconds of a neck held
        // at the bottom of a lunge is a statue of a swing; the animal in the
        // block settles onto its feet instead. A second and a half of frost
        // is an animal stopped dead, and stopped dead is the stride it was
        // caught in.
        if (un._held > 0) {
            un._held = Math.max(0, un._held - dt);
            if (!un._held) un._block = false;
            un._eng = false;
            un._ox = un._x;
            un._oy = un._y;
            if (un._block) {
                un._fight += (1 - un._fight) * Math.min(1, dt * 6);
                // The short way round to zero. Winding a phase of twenty down
                // by thirds takes it through every lunge on the way, and a
                // unicorn setting into the ice was throwing its neck up and
                // down a dozen times on the way to standing still.
                let ph = un._ph % 6.2832;
                if (ph > 3.1416) ph -= 6.2832;
                un._ph = ph * Math.max(0, 1 - dt * 4);
            }
            continue;
        }

        // What its side has learned, which is the same for every unicorn on
        // that side and is already worked out: five multipliers, in the order
        // PACE, SWING, SIGHT, HORN, GATE.
        const m = tech[un._side]._m;

        // A target that has fallen frees it.
        if (un._foe && un._foe._hp <= 0) aim(un, null);

        // Struck: it turns on whoever landed the blow, unless it is already
        // horn to horn with someone, in which case it finishes that fight.
        // Answering a blow ignores the crowding cap — being set upon is not
        // a choice — so a mobbed unicorn can briefly have three on it.
        // A mage answers nothing: it has no fight to turn to, only ground to
        // give.
        if (un._hit) {
            if (!un._mage && un._hit._hp > 0 && !un._eng) aim(un, un._hit);
            un._hit = null;
        }

        // A unicorn that has withdrawn looks for no fight until it is whole,
        // but it answers one that comes to it.
        const rest = un._rest ? nearestCastle(un, true) : null;
        if (!rest) un._rest = false;
        // The nearest enemy it can see, every step. Packed into a crowd it
        // is forever being carried away from whatever it first picked, and
        // walking back across the press to reach that one rather than the
        // one under its nose is how a fight turns into a crush of animals
        // going past each other. The exception is a fight already joined:
        // that is seen out. A mage takes no foe at all.
        if (!un._mage && !un._rest && !un._eng) {
            aim(un, seek(un, LOOK * m[SIGHT], CROWD) || un._foe);
        }

        // What a mage has instead of a foe: the nearest enemy within a
        // spell's length, which it freezes and keeps its distance from. It is
        // not a target — nobody is closing on anything — so nothing here
        // touches who is set upon by whom. (MAX for the crowding cap is a cap
        // no crowd can reach: it would take the whole herd on one unicorn.)
        // How far a spell carries is how far its caster can pick something
        // out, so it is sight rather than reach: a wizard does not have to
        // get near what it freezes, it has to see it. Which is what makes
        // sight worth anything at all — on a side with no wizards it is the
        // weakest of the five, because a fighter takes the nearest enemy
        // within range and a longer look only ever adds further ones.
        const mark = un._mage ? seek(un, CAST * m[SIGHT], MAX) : null;
        // How far off that is, which is the only thing a mage's walk asks.
        const gap = mark ? Math.hypot(mark._x - un._x, mark._y - un._y) : 1e9;

        // Its foe, or the castle it is resting at, or the nearest castle its
        // side does not hold. With nothing left to take it walks home. A mage
        // walks where a fighter walks and stops short: it has to be going
        // somewhere, or the crowd would squeeze it out of the field. Holding
        // a distance from something is a whole circle of places to stand, and
        // a unicorn shoved along that circle has nothing pulling it back.
        const goal = un._foe || rest
            || nearestCastle(un, false) || nearestCastle(un, true) || castles[1];
        // Marching on a castle it walks to its own lane, a little to one
        // side of the castle in depth, instead of at the castle's exact
        // depth. Every castle stands far enough inside the band for a lane
        // either side of it, so there is nothing to clamp.
        const march = !un._foe && !rest;
        const dx = goal._x - un._x, dy = goal._y + (march ? un._lane : 0) - un._y;
        const d = Math.hypot(dx, dy);
        // A mage walks no closer once it has something to cast at, and backs
        // away from anything that gets well inside that.
        const back = gap > 1e-6 && gap < KEEP * 0.75;
        // Where to stop, and from how close the horns connect: a little
        // further out than the stop, so a pair that eases to a halt at the
        // stop is fighting by the time it gets there.
        // The doorstep is inside the castle's ground on purpose: a besieger
        // walks at the gate, is put back out of the wall by walls(), and
        // takes that depth for its lane. Stopping it outside the wall
        // instead would have a big veteran standing beyond CAP_R, unable to
        // press the claim it came for.
        // A garrison stops as soon as it is on the castle rather than walking
        // for the exact middle of it: five of them cannot all stand on one
        // point, and any that try spend the watch shoving each other off it
        // and walking back. Anywhere on the stone will do.
        const stop = un._foe
            ? REACH * m[HORN] * (un._s + un._foe._s) : (rest ? 0.781 : 1.563);
        // Once horn to horn it takes more than a shove from the crowd to
        // break it off, or the pair spend the fight stepping in and out of
        // range of each other.
        const fighting = un._foe && d < stop * (un._eng ? 1.7 : 1.3);
        // How far it has got from where it was half a second ago. A step on
        // its own cannot tell walking from jittering: both move real ground,
        // and only one of them ends up anywhere.
        const arrived = Math.hypot(un._x - un._px, un._y - un._py) < SPEED * 0.06;
        // The ground it actually covered last step, shoves and all. The mark
        // is dropped here rather than at the end of the step: nothing moves
        // between one step ending and the next beginning, so a mark dropped
        // there would measure nothing at all.
        const gx = un._x - un._ox, gy = un._y - un._oy;
        const gone = Math.hypot(gx, gy);
        un._ox = un._x;
        un._oy = un._y;
        // Standing on the castle, unmolested: four times the healing, and no
        // walking. The reach it heals from is roomier than the stop, so that
        // being shoved aside by another of its own does not send it walking
        // back — and one that has queued up behind a full garrison, and is
        // getting no closer for trying, settles where it stands rather than
        // circling the walls for the rest of the watch.
        const healing = rest && !un._foe
            && (d <= 1.368 || (arrived && d <= 3.517));
        // Near where it was going and getting no nearer: it stops walking.
        // A crowd round a castle is pushed off the doorstep as fast as it
        // reaches it, and without this the ones at the back spend the siege
        // walking back in — forty of them covering a fifth of a walk each
        // every three seconds, for as long as the siege lasted.
        // Never far enough out to be idling outside the very claim it came
        // for: the reach a castle is held from is the limit.
        const stuck = arrived && d < Math.min(stop * 3, CAP_R * 0.9);
        // A mage is the slower animal, going or coming — and both of them
        // walk at whatever pace their side has learned.
        const pace = SPEED * m[PACE] * (un._mage ? MAGE_V : 1);
        let v = 0;
        // Horn to horn it holds its ground. It is already where it needs to
        // be, and a pair that walks at each other every step is a pair the
        // crowd can bounce: shoved apart, they close again, and the two of
        // them shudder for the whole fight. The reach it fights at is
        // roomier than the reach it closes to, so a nudge does not break it
        // off and it does not have to chase.
        // Walked into something and came off worse: last step it ended up
        // further from where it was going than it set out. Walking at it
        // again this step only repeats the collision, and a unicorn doing
        // that every step in a crowd shudders on the spot. It waits instead,
        // and the crowd moves on around it.
        const blocked = gx * dx + gy * dy < 0;
        if (back) {
            // Away from the mark, not backwards along the way it was walking:
            // what it is giving ground to is the enemy, not the castle.
            v = pace;
            un._x += (un._x - mark._x) / gap * v * dt;
            // Walking backwards is the one walk with nothing in front of it
            // to stop at, so the band has to.
            un._y = Math.min(FAR_Y, Math.max(NEAR_Y,
                un._y + (un._y - mark._y) / gap * v * dt));
        } else if (d > stop && gap > KEEP && !healing && !stuck && !un._eng && !blocked) {
            // Full speed the whole way, and never a step past the thing it is
            // walking to. It used to ease off over the last little way
            // instead, and then nothing could close on anything that was
            // walking away from it: the two settled at the distance where the
            // pursuer's eased-off speed matched the pursued's and went off
            // the field together. There is still no floor under it — the step
            // is whatever is left of the way — so one shoved a hair past
            // where it meant to stand still ambles back by that hair rather
            // than setting off at a walk.
            v = Math.min(pace, (d - stop) / dt);
            un._x += dx / d * v * dt;
            un._y += dy / d * v * dt;
        }
        // Shoved aside at the gate, it takes the depth it was shoved to for
        // its own rather than pushing back into the crowd. That is what lets
        // a garrison spread along the wall instead of stacking on the
        // doorstep: what the crowd settles in depth, nobody walks back out.
        if (march && d < stop * 2) un._lane = un._y - goal._y;
        // Horn to horn; and out of a fight, healing, four times as fast at home.
        un._eng = !!fighting;
        if (!fighting) un._hp = Math.min(un._max, un._hp + un._max / HEAL * dt * (healing ? 4 : 1));

        // The spell. It does not travel and it does not miss: what a mage
        // brings to a fight is not damage but a target that cannot answer for
        // FROST seconds. A mage that is held itself never gets this far.
        if (un._mage) {
            // A spell is a swing: how fast it comes round again is the same
            // thing the horn asks of a side, and a side that has learned to
            // swing has learned to cast.
            un._cast -= dt * m[SWING];
            if (un._cast <= 0) {
                // Which spell, for a wizard that has more than one. In order:
                //
                // A mark already standing still is blasted rather than
                // frozen again — a freeze on something that cannot move is a
                // freeze thrown away — and that is what makes two wizards
                // worth more than twice one: the first holds and the second
                // strikes, and a held unicorn takes the bolt without ever
                // swinging back.
                //
                // With nothing helpless in front of it, the rage goes on one
                // of its own that is in a fight. That saturates on its own,
                // a rage lasting the best part of two cooldowns and never
                // stacking, so a wizard is back to freezing as soon as the
                // fights around it are all roaring — which is why putting it
                // above the freeze does not bury the freeze.
                //
                // And otherwise the frost, which is what it started with.
                const got = tech[un._side]._got;
                const friend = got > 2 ? ally(un, CAST * m[SIGHT]) : null;
                let at = mark, k = 0;
                if (mark && mark._held > 0 && got > 1) k = 1;
                else if (friend) { at = friend; k = 2; }
                if (at) {
                    un._cast = COOL;
                    if (k === 1) wound(un, at, SMITE);
                    else if (k === 2) at._rage = RAGE;
                    else holdStill(at, FROST, false);
                    // Both ends are the ground each of them stands on, and
                    // the sizes with them. A horn and a head are above the
                    // ground, and nothing on this plain has a height to put
                    // them at, so main.js lifts each end once it has
                    // projected it.
                    casts.push({
                        _x: un._x, _y: un._y, _s: un._s,
                        _tx: at._x, _ty: at._y, _ts: at._s,
                        _k: k,
                    });
                }
            }
        }
        // Whole again, at a castle it withdrew to: that is a level. It grows
        // into it over the next second and goes back to the fight.
        if (un._rest && un._hp >= un._max) {
            un._rest = false;
            un._lvl++;
            un._max = HP * (1 + TOUGH * un._lvl);
            un._hp = un._max;
            promoted.push(un);
        }
        // A level's worth of size, taken on over a second.
        const grown = BODY * SCALE0 * (1 + GROW * un._lvl);
        if (un._s < grown) un._s = Math.min(grown, un._s + BODY * SCALE0 * GROW * dt);
        // Nothing to fight and nowhere it is actually getting: it stands, and
        // standing is all four feet down. The fighting pose is what plants
        // them — the stride fades out of it — and winding the phase down to
        // zero takes the lunge back out, which leaves a unicorn on its feet
        // with its head up.
        //
        // What counts is the ground it covered last step, not whether it
        // tried to walk. One at a gate walks into the wall, is put back out
        // of it, and walks in again: it is trying the whole time and getting
        // nowhere, and it should be standing there like anything else that
        // has arrived.
        const still = !fighting && arrived;
        if (!still && Math.abs(dx) > 0.01) un._face = dx > 0 ? 1 : -1;
        un._fight += ((fighting || still ? 1 : 0) - un._fight) * Math.min(1, dt * 6);
        if (still) {
            // The short way round to zero, so the neck does not swing through
            // a whole lunge on the way.
            let ph = un._ph % 6.2832;
            if (ph > 3.1416) ph -= 6.2832;
            un._ph = ph * Math.max(0, 1 - dt * 3);
        } else if (fighting) {
            // The blow lands at the bottom of the lunge, or misses there. A
            // pair spawned with different phases swing out of step, which is
            // most of why they no longer fall together.
            const next = un._ph + dt * LUNGE * m[SWING] * (un._rage ? FURY : 1);
            if (Math.floor(next / 6.2832 - 0.5) > Math.floor(un._ph / 6.2832 - 0.5)
                && rnd() < HIT) {
                wound(un, un._foe, DMG * (0.75 + 0.5 * rnd()));
            }
            un._ph = next;
        } else {
            // The legs are driven by the ground it covered, not by the speed
            // it meant to walk at: one held still by the crowd in front of
            // it stops its legs rather than walking on the spot. Measured in
            // its own lengths, so a veteran takes longer strides for the
            // same ground.
            un._ph += Math.min(gone / un._s, 0.1) * 3.9;
        }
    }
}

/**
 * And the herd as a whole, once every unicorn has had its turn: nobody
 * standing inside anyone else, nobody off the board, the trailing point
 * brought along, the faded taken out, the rest put in depth order for the
 * draw, and the balance the whole game is read off.
 * @param {number} dt seconds
 */
function settle(dt) {
    separate(dt);

    // Nothing leaves the board. Most of the shoving bounds itself as it goes,
    // because a shove has to know what room it has; this is the backstop that
    // catches what does not — a walk to a lane marked out past the back of
    // the band, and anything pushed across the sides, which nothing reads
    // mid-step and so nothing has to bound until the step is over. Across it
    // is the whole animal that is kept on rather than the point it stands on,
    // so a unicorn at the side is one you can see all of. In depth it is the
    // feet: the band is the ground, and a head above the back of it is only a
    // head in the rain, which is what the back of the field should look like.
    for (const un of herd) {
        un._y = Math.min(FAR_Y, Math.max(NEAR_Y, un._y));
        // The board is not a rectangle. The picture is a wedge opening away
        // from the camera, so the ground it shows at the back is wider than
        // the ground it shows at the front, and the bound has to open with it
        // or the far field would be fenced off where it is widest.
        const wide = wideAt(un._y) - un._s * LONG * 0.5;
        un._x = Math.min(wide, Math.max(-wide, un._x));
    }

    // The trailing point creeps after everyone, shoves and all. A steady walk
    // leaves it a tenth of a unit behind; a unicorn going nowhere is sat on
    // top of it.
    const k = Math.min(1, dt * 2);
    for (const un of herd) {
        un._px += (un._x - un._px) * k;
        un._py += (un._y - un._py) * k;
    }

    // Gone once faded.
    for (let i = herd.length; i--;) if (herd[i]._hp <= -1) herd.splice(i, 1);

    // Back to front, since the draw order is the depth order.
    herd.sort((a, b) => b._y - a._y);

    let sun = 0, rain = 0;
    for (const un of herd) if (un._hp > 0) un._side ? rain++ : sun++;
    const target = (sun - rain) / Math.max(sun + rain, 6);
    balance += (target - balance) * Math.min(1, dt * 1.5);
}

/**
 * Nobody stands in anyone else's ground. The shove is in depth: a unicorn
 * blocked head-on goes around rather than through, which is also the only
 * direction that does not undo the walk it is making. One pinned at the
 * edge of the band pushes the other twice as far, and a pair with no depth
 * left to give gives way sideways.
 */
function separate(dt) {
    // Resolving one pair can push a unicorn into another, so it takes a few
    // sweeps to settle. The last one gives way sideways instead: whatever a
    // crowd could not solve by stepping aside in depth, it solves by
    // spreading out along the field. The castles are put in between, so a
    // unicorn shoved into one is put back out before the next sweep.
    const was = herd.map((u) => [u._x, u._y]);
    sweep(0); walls(); sweep(0); walls(); sweep(0); sweep(1); walls();

    // No unicorn is shoved faster than it could run. Resolving every pair in
    // full is what stops a crowd standing inside itself, but in a dense one
    // the pushes compound: twenty at a gate flung each other half a field and
    // then walked back, over and over, for as long as they were there. The
    // limit is what turns that into a crowd that settles.
    const cap = SPEED * dt * 1.5;
    for (let i = 0; i < herd.length; i++) {
        const u = herd[i], [x, y] = was[i];
        const dx = u._x - x, dy = u._y - y;
        const m = Math.hypot(dx, dy);
        if (m <= cap) continue;
        u._x = x + dx / m * cap;
        u._y = y + dy / m * cap;
    }
}

/**
 * Out of the castles. They do not move, so the unicorn gives all the ground,
 * and it gives it the short way: whichever of depth and across is the less
 * far to go. Always choosing depth would put a besieger that walked up to a
 * gate at the castle's exact depth, whatever lane it marched in, and a
 * column would arrive in single file after all. A unicorn healing at a
 * castle of its own is the garrison and stands on it.
 */
function walls() {
    for (const un of herd) {
        if (un._hp <= 0 || un._block) continue;
        for (const c of castles) {
            if (un._rest && c._side === un._side) continue;
            const w = CASTLE_W;
            const ex = w + un._s * LONG * 0.5;
            const ey = w + un._s * DEEP * 0.5;
            const dx = un._x - c._x, dy = un._y - c._y;
            const ox = ex - Math.abs(dx), oy = ey - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            // The short way out, and out of the band is no way at all.
            const y = un._y + (dy === 0 ? 1 : Math.sign(dy)) * oy;
            if (oy <= ox && y >= NEAR_Y && y <= FAR_Y) {
                un._y = y;
            } else {
                un._x += (dx === 0 ? (un._x < c._x ? -1 : 1) : Math.sign(dx)) * ox;
            }
        }
    }
}

/** @param {number} sideways */
function sweep(sideways) {
    for (let i = 0; i < herd.length; i++) {
        const a = herd[i];
        if (a._hp <= 0) continue;
        for (let j = i + 1; j < herd.length; j++) {
            const b = herd[j];
            if (b._hp <= 0) continue;
            // A block of ice does not give way; whoever met it goes round.
            if (a._block && b._block) continue;
            const w = (a._s + b._s) * 0.5;
            const oy = w * DEEP - Math.abs(b._y - a._y);
            if (oy <= 0) continue;
            const ox = w * LONG - Math.abs(b._x - a._x);
            if (ox <= 0) continue;

            if (sideways) {
                // Only for what stepping aside could not solve. A pair that
                // depth has already parted is left alone, or every meeting
                // would end with both of them backing off as well.
                if (oy < w * DEEP * 0.05) continue;
                const sx = b._x === a._x ? (i & 1 ? 1 : -1) : Math.sign(b._x - a._x);
                a._x -= sx * ox * 0.5;
                b._x += sx * ox * 0.5;
                continue;
            }
            // Away from each other in depth; a dead heat breaks on the index.
            const dir = b._y === a._y ? (i & 1 ? 1 : -1) : Math.sign(b._y - a._y);
            let da = -dir * oy * 0.5, db = dir * oy * 0.5;
            // One of them pinned at the edge of the band pushes the other
            // twice as far, and so does one under the ice.
            if (a._block || a._y + da < NEAR_Y || a._y + da > FAR_Y) { db -= da; da = 0; }
            if (b._block || b._y + db < NEAR_Y || b._y + db > FAR_Y) { da -= db; db = 0; }
            const ay = Math.min(FAR_Y, Math.max(NEAR_Y, a._y + da));
            const by = Math.min(FAR_Y, Math.max(NEAR_Y, b._y + db));
            // What the edge of the band ate, they give way sideways instead.
            // This is what stops a crowd with no depth left to give from
            // standing inside itself.
            const left = oy - Math.abs(by - ay) + Math.abs(b._y - a._y);
            a._y = ay;
            b._y = by;
            if (left > 0) {
                const sx = b._x === a._x ? (i & 1 ? 1 : -1) : Math.sign(b._x - a._x);
                const give = Math.min(left / (w * DEEP), 1) * ox * 0.5;
                a._x -= sx * give;
                b._x += sx * give;
            }
        }
    }
}

/**
 * The unicorn nearest a point, if one is near enough to mean it. The point is
 * the player's, so it is a point on the screen, and the herd is met there
 * rather than on the ground: what the player is aiming at is a picture, and
 * two unicorns a long way apart on the plain can be a thumb's width apart in
 * it. So each is projected and the pick is made in the picture.
 * @param {number} x on the screen, the rainbow's units
 * @param {number} y
 */
function nearest(x, y) {
    let best = null, bd = 0.02;
    for (const un of herd) {
        if (un._hp <= 0) continue;
        const [px, py, ps] = project(un._x, un._y, un._s);
        const d = (px - x) ** 2 + (py - (y + ps * 0.4)) ** 2;
        if (d < bd) { bd = d; best = un; }
    }
    return best;
}

/**
 * God mode, whichever hand is out: the unicorn nearest the point is either
 * struck down where it stands, or frozen into a block of ice — out of the
 * fight but still in the way of it until the block has melted off.
 *
 * One function for the two because they are the same three lines: find the
 * nearest unicorn to a point on the screen, and set one field on it.
 * @param {number} x on the screen, the rainbow's units
 * @param {number} y
 * @param {boolean} ice the freezing hand, rather than the smiting one
 */
export function strike(x, y, ice) {
    const un = nearest(x, y);
    if (!un) return;
    // Zero, not below: zero is where the fade starts. And not through
    // wound(), which pays a side the bounty on what it felled: this one was
    // felled by the sky, and neither side is owed for it.
    if (ice) holdStill(un, FREEZE, true); else un._hp = 0;
}
