# The sound

All of it is `src/audio.js`, about a kilobyte and a half of the zip. Nothing is
loaded and nothing is sampled: there is no room in 13,312 bytes for a second of
recorded audio, so every noise in the game is an oscillator or a burst of white
noise through a filter, and the music is written as it plays.

Two things fall out of that which are worth having anyway. The whole soundtrack
is one number wide — the same `balance` the sky, the bow and the castles read —
and it never repeats.

## The shape of it

```
                    a tone, or a rush of noise
                              │
                    gain (envelope) → panner
                              │
        ┌─────────────────────┴──────────────────┐
    sfxBus 0.85                            musicBus 0.5   ← 0.18 while paused
        └─────────────────────┬──────────────────┘
              limiter −9 dB, 14:1, 1ms attack
                              │
                       master × 1.7      ← the mute button sets this to 0
                              │
                         destination
```

Two buses because the field and the tune want different levels and the pause
wants to duck one of them and not the other. One limiter over both, because a
melee is forty animals and there is no telling how many of them land a blow in
the same frame as a fanfare. `VOL`, the master gain, is the one number that
says how loud the game is next to everything else the machine is playing;
everything below it is mixed only against everything else below it.

`VOL` is 1.7, which sounds wrong for a gain and is not. Recorded out of a
browser with it at 1, the whole mix peaked at a sixth of full scale — a game
nobody can hear over a fan.

Finding the ceiling took several recordings, because it moves: a burst of noise
starts at a random place in the buffer, so the loudest thing in the game — the
smiting hand — is a slightly different peak every time it is struck. 2.4
reached −0.2 dBFS on a good run. 2 measured 0.89 on one run and clipped two
samples on the next. 1.7, with the limiter's attack brought down from the
default 3ms to 1ms so that it catches the front of a burst rather than the
swell behind it, sits at −2.8 dBFS run after run with nothing clipped.

## The two voices

Everything is one of two functions.

`tone(wave, f0, f1, d, g, pan, t, attack, bus)` is an oscillator swept from
`f0` to `f1` over its whole length. `f1 === f0` is a note that holds still.

`rush(f0, f1, d, g, pan, q, t)` is white noise through a bandpass swept the
same way. The Q is the whole difference between a thump and a chime: 0.7 is a
thunderclap, 6 is a struck glass. The noise is two whole seconds of it, looped,
and each voice starts at a random offset up to 1.5s in, so a tail never hears
the loop come round and two voices in the same frame are not the same noise.

Both end in `out()`, which is the tail they share: a gain envelope, a
`StereoPanner`, a connect and a `stop()` so the node is collected rather than
left running for the rest of the game. The envelope is exponential the whole
way, which means never quite to zero — a ramp to an actual 0 is undefined in
WebAudio and comes out as a click.

## Where on the field it happened

A sound is handed the same projected triple `sparks.js` is handed: screen x,
screen y, screen size, straight out of `sim.project()`. Two functions read it.

```js
const pan  = (p) => clamp(p[0] / 0.8, -1, 1);          // across the picture
const near = (p) => min(1, 0.28 + 1.4 * p[2] / NEAR_S); // and how far off
```

`NEAR_S` is how big a full-grown unicorn draws at the front of the band, which
is as big as anything on the field ever gets, so `p[2] / NEAR_S` is the whole
of the distance cue. A castle at the back of the field comes out at about a
fifth of the volume of a fight at the front — but never at nothing, because
something happening out there is still something happening.

This is why the audio takes a projected triple rather than a world position:
the sound and the sparks then cannot disagree about where the thing was.

## What the field makes

Every event the simulation reports has a sound, and the two the player causes
are the loudest, because they are the only two that are not on the field.
Levels below are peak amplitude, measured out of a browser with the thing at
the front of the field.

| | what it is | peak |
|---|---|---|
| a recruit out of a gate | a triangle rising a fifth, and the puff of the gate. C4 for rainicorns, F4 for sunicorns | 0.15 |
| horn on horn | a wide band of noise falling, with a short ring over it | 0.28 |
| a unicorn falls | a sawtooth with the pitch falling out of it, and the body landing | 0.35 |
| a mage's frost | two sines sweeping up out of each other, and the crystals | 0.18 |
| the smiting hand | a clap, a sawtooth falling to 42 Hz, and a sine sub under it | 0.73 |
| the freezing hand | three chimes an instant apart over the hiss of it going hard | 0.33 |
| a promotion | the D triad of the current key, rising, three notes | 0.14 |
| a castle taken | a bell, the same triad an octave up under it, and a shimmer over the walls | 0.59 |
| a claim broken | a hollow square knock falling, with the stone going out of it | 0.24 |
| a side wins | the triad and the octave, long, over the drone being taken away | 0.56 |

A gate opening is the only report that is sound and nothing else — there is
nothing to see when a recruit walks out of one. Everything else on that list
already had sparks.

Two of them read the key rather than fixed frequencies: a promotion and a
castle taken are both built on `hz()`, so they arrive in whatever the board has
made of the scale. They share the triad on purpose — a castle taken is a
promotion with a bell under it and three times the length.

Which side won is in the root of the cadence and in nothing else: sunicorns
finish an octave above rainicorns, panned to their own side of the screen.

## The music

### The key, and how it goes wrong

D. One scale, and it is *bent* rather than switched:

```js
const SCALE = [0, 2, 4, 5, 7, 9, 11];   // major
const BEND  = [0, 0, 1, 0, 0, 1, 1];    // the third, the sixth, the seventh

hz(d) = ROOT * 2 ** (octave + (SCALE[i] - BEND[i] * sour) / 12)
```

`sour` is `min(1, |balance| * 3)`, so the board is fully soured once one side is
a third ahead. The bend is subtracted *before* the semitones become a ratio,
which is the whole point: at `sour = 0.5` the third is a quarter-tone, neither
major nor minor, and that is the sound of a board that is starting to go. There
is no moment where the music changes mode. It slides, and it slides at the same
rate the bow fades.

At `sour = 1` the scale is exactly D natural minor.

### The round

Eight eighths to the bar, four bars round, I–vi–IV–V as scale degrees
`[0, 5, 3, 4]`. An eighth is 0.42s at normal pace, so the round is 13.4 seconds
and a quarter note is about 71 BPM.

Four voices, and which of them are present is the readout:

**The bass** — one triangle a bar, the chord's root an octave below the key's,
down in D2. Always there.

**The melody** — a random walk over the scale, clamped to degrees 3…16 (G3 to
about F♯5), pulled back onto a chord tone at the top of every bar so it never
wanders out of the harmony for long. Notes are panned by degree, so the walk
moves across the picture as it moves up and down. **It thins as the board
tips**: two notes in three while level, one in three once it has gone. The tune
is what you lose — measured over nine seconds at each of three balances, 21
notes level against 14 and 13.

**The heartbeat** — a sine from 78 Hz down to 44, on every other beat, and
*absent entirely* while the board is level. It arrives with `sour > 0.12` and
its gain is `0.12 * sour`, so it is the one voice that gets louder as the tune
gets worse.

**The second voice** — the melody answered an octave up on a soft sine, gated
on `shine = max(0, 1 - |balance| / 0.08)`. That 0.08 is the same threshold
`rainbow.js` fades the second bow out over. Hold the board level enough to earn
the second bow and the tune answers itself; the reward is heard as well as
seen, and the two cannot come apart, because they read the same number against
the same constant.

### The drone

Not scheduled. Three sawtooths — D2, D3 and A3 — started once at boot and never
stopped, through a lowpass, a gain and a panner. The whole of what it does is
three parameters moved at it once a frame:

| | level | gone |
|---|---|---|
| gain | 0.06 | 0.16 |
| cutoff | 1920 Hz | 420 Hz |
| detune | 0 | ±42 cents, sub flat and fifth sharp |

So: quiet and open while the board is level; loud, dark and beating against
itself once it is not.

And it pans. `padPan.pan = -balance * 0.7`, which gathers the weight on the
side that is winning — which is the side the bow is fading from. `balance > 0`
is sunicorns ahead and sunicorns are the *left* of the screen, so the sign is
negative. **This is on the paired-decision list in the README with the sky, the
clouds and the bow.** Move one of them without the others and the cues
contradict each other.

### Time

The scheduler is a lookahead loop driven from the frame loop, not a timer:

```js
if (due < now) due = now;                      // a tab that was away
const beat = 0.42 / Math.sqrt(max(speed, 0.5));
while (due < now + 0.2) { eighth(due); due += beat; }
```

Tempo follows the pace the fight is watched at, but not one for one — the
square root means three times the speed is twice the tempo, which is quick and
still a tune rather than a chipmunk.

Paused, the music is *held* at 0.18 rather than stopped. The field is holding
still too, and silence would say the run had ended rather than that it was
waiting. Once a side has won, `ended` stops the scheduler and takes the drone
away under the cadence; the next touch calls `begin()` and it all comes back.

## Starting it, and stopping it

A browser will not let a sound out before a user gesture, so `boot()` is called
from every gesture the page has — the smite, the hand buttons, and the pace
keys — because any of them may be the first. It builds the graph once and
resumes the context on every call after that, since a tab that was away comes
back suspended.

The third button at the top left is not a hand. It is the sound, and it says
which state it is in (🔊 / 🔇) rather than lighting up, because the two hands
use lighting up to mean *chosen* and a third light there would read as a third
hand. Off is a ramp on the master gain; nothing is torn down, so on is
instant.

## The budget

Nothing here rations itself, and two things could flood it.

**Voices.** A tab that was away comes back and `main.js` runs three hundred
simulation steps in one frame, reporting five seconds of deaths, spawns and
blows at once. `room()` allows eighteen voices to begin in any one sixtieth of
a second and drops the rest.

The window is *time* and not a frame, and that matters. It was a counter reset
by the music tick, which meant a sound could only be heard if it was called
from inside the loop — and any run of more than eighteen voices went silent
from the tenth on. A promotion, a castle taken and a claim broken, three in a
row, all silent, all reading perfectly correct in the source.

**Blows.** A blow landing is the commonest thing on the field by a wide margin,
so it is rationed again to twenty a second on top of the voice cap. Measured
over ten minutes of `npm run sim` it actually lands about once a second, so the
ration is a safety valve for the catch-up case rather than something the fight
runs into.

## How to check it

A sound cannot be verified by reading it. Levels, panning and *whether a voice
comes out at all* are things a recording answers and nothing else does. Both
bugs above read as correct code.

Counting is as much of it as measuring, and answers the thing levels cannot:
whether a voice is there at the right *times*. Tally the oscillators started
inside a window and the melody's thinning is a number — and it was a number
that caught the third bug in here, which no amount of listening would have. The
density test read `Math.random() > 0.32 + 0.4 * sour`, which fills the bar up as
the board goes wrong instead of emptying it, and it was found by checking this
document against the source rather than the other way round. The music got
busier as a run soured and that is not obviously wrong to a listener; it is
obviously wrong as 13 notes against 21.

The rig is:

1. `page.evaluateOnNewDocument` a subclass of `AudioContext` whose
   `destination` getter returns a tap node — grab the real one first with
   `Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination').get`.
2. Hang a `ScriptProcessorNode` off the tap, write its input into an array of
   `Int16Array`s, and zero its output so the recorder is not itself heard.
3. Launch with `--autoplay-policy=no-user-gesture-required` so the graph runs
   without a real click, and `--use-gl=swiftshader --enable-unsafe-swiftshader`
   so the game still draws.
4. Drive the page with `page.mouse.click` on the real `dist/index.html`, or
   `import()` `src/audio.js` into a bare page and call each export in turn with
   a synthetic projected triple.
5. Pull the buffer out in base64 slices, write a 44-byte WAV header in front of
   it, and measure: peak, RMS and left-against-right per event.

Two numbers to watch. RMS below about 0.0008 over a one-second window is
silence, whatever the code says. And a pan reading is `(rmsR - rmsL) / (rmsR +
rmsL)` — it should come out near ±0.6 for something at the edge of the field
and near 0 for the god's hands.

For the counting, wrap `OscillatorNode.prototype.start` and keep the wave type
and the time. That alone answers "did that event make any sound at all", and it
needs no recording. If you want the frequency with it, note that
`AudioParam.value` does *not* report what `setValueAtTime` scheduled — wrap
`setValueAtTime` and stash the value on the node, or every oscillator in the
game reads as 440 Hz.

## What is not settled

- **A recruit's note is out of key.** C4 and F4 are D natural minor, not D
  major, so the gates are consonant with a board that has gone and slightly
  outside one that is level. That is an accident of picking the two notes for
  their distance apart rather than for the key, and it happens to lean the
  right way. Whether the gates should read the key like a promotion does is a
  design question and not a patch.
- **The melody is the one thing in the game that is not reproducible.** Its
  walk comes off `Math.random()` rather than the simulation's seed, so the same
  run played twice is the same fight over a different tune. `sim.js` has a seed
  and the discipline of using it everywhere; the music does not.
- **The cadence is the same shape for either side.** Only the root moves, an
  octave. If the run's ending grows any ceremony, that is the place to say more
  about who won.
- **Nothing has been heard on a phone.** Mobile is on the README's list
  already; the audio is on it too, and iOS in particular is fussy about which
  gesture counts as the unlocking one.
