# Sandworm Sentinel — First-Person Boss Design Document

<span dir="rtl" lang="ar">حَارِسُ دُودَةِ الرِّمَالِ</span>

*A Level 5 tutorial encounter in the Desert Oasis, fought through the penitent's own eyes.*

| | |
|---|---|
| Version | 1.0 |
| Status | Design complete, pre-production |
| Date | 2026-10-29 |
| Product | **Anees**, a bilingual (English + Arabic, RTL) Math and Science platform for students of roughly grades 4–6 (ages 9–12) |
| Encounter | Level 5 boss, Desert Oasis (واحة الصحراء); seeded mechanic "Steady Strikes" / «ضربات ثابتة» |
| Perspective | First-person melee, viewmodel hands, Pointer Lock camera |
| Platform | React 18 + Vite + TypeScript, react-three-fiber; 60 FPS on school laptops |
| Owner | Game Design, Anees |

## The Fight in One Minute

A student enters a sunken cistern in the Desert Oasis carrying the Veiled Blade, a plain cross-guard sword wrapped in linen, with ten amber tasbih beads on the left wrist counting Vigor. Before the first frame of combat, the Penitent's Rite shows every control and will not start the fight until the student presses **Enter the Cistern**.

The Sentinel is blind, about 38 m long and almost entirely underground. It hunts by vibration and strikes to a 60 BPM metronome: one attack per 4-second measure, each impact on a beat, each announced by one sound, one motion and one colour. The student learns three defences: tap Guard to **Parry** the bronze-gleaming Mandible Sweep, **Dash** sideways from the crimson-eyed lunge and the charging gullet, **Jump** the sand ridge. Melee never touches the Penance bar; it fills Posture, and a full Posture bar drops the creature's head onto the flagstones in front of the player.

That is the door; the mind walks through it. Time slows to 15 % and a stone tablet carries one of six Math or Science questions, with four answer stones in a cross bound to W, D, S, A. A correct answer is a Judgement Strike: the blade enters the creature's eye, a Seal breaks, and the next two attacks are slow and harmless. A wrong answer or a time-out is a Tail Reprisal: 30 damage, a four-second concussion, and quicker attacks. If six verses pass without a Posture Break the Sentinel burrows and the question arrives through a sand vortex, so all six are always asked.

Five of six correct wins. After the third correct answer the 4/4 rhythm breaks into syncopation with delayed feints, and a dust storm closes the edges of the screen. A passing run ends in a first-person execution and the relic **Eye of the Buried Pilgrim**. Dying never spends an attempt; only the quiz ratio can. Expect 6–9 minutes of play after the briefing.

```
ControlsBriefing --> Idle --> Telegraph --> ActiveStrike --> Recovery --+
 (Enter the Cistern)  ^                                                 | up to 6 verses
                      |                         +-----------------------+
                      |                         v
   Judgement  <-- correct --  QuestionActive <-- PostureBreak  (Posture 100)
   Reprisal   <-- wrong/time-out --'          <-- Burrow       (no break in 6 verses)
        |
        +--> Idle (next cycle) ... PhaseShift after the 3rd Judgement
             Execution after the 6th question if >= 5 correct, Endures if not
             PlayerFall from any combat state (no try spent)
```

## Design Pillars

| # | Pillar | Rule it imposes | How we verify it |
|---|---|---|---|
| 1 | **The Metronome Is the Teacher** | Every Phase I impact lands on a beat; the chain-click is the countdown. | Automated frame-data test: each Phase I Impact (first Active frame) falls on a multiple of 60 f from the verse downbeat. Chastened (90 f) and Quickened (48 f) wind-ups are scheduled backwards from the next beat, so Impact stays on the grid and T0 floats. |
| 2 | **The Blade Opens the Door, the Mind Walks Through It** | Melee fills Posture and cracks seals visually; only a correct answer reduces Penance, which keeps the server contract authoritative. | Unit test: Penance changes only in `Judgement`. |
| 3 | **Read, Don't Guess** | Each attack has one distinct sound, one distinct motion and one distinct colour or shape tell, never colour alone. | Telegraph matrix has no shared channel; colour-vision simulation pass (Appendix B). |
| 4 | **Diegetic First** | Vigor, Breath, Posture and questions live on the viewmodel and in the world, not in screen-corner chrome. | Combat screenshot audit at Alpha and Beta. |
| 5 | **Failure Teaches, Never Traps** | Combat cannot end the attempt; explanations always reach the student (see Module 5). | A scripted bot that falls 20 times never triggers `/submit`. |

## Quick-Reference: Canonical Constants

Every module obeys these values. Frames convert at f × 16.667 ms.

### Timing

| Constant | Frames | Time |
|---|---|---|
| Simulation step | 1 f | 16.667 ms (60 FPS fixed step) |
| Tempo | 60 BPM, 4/4 | — |
| Beat / eighth note / measure | 60 f / 30 f / 240 f | 1000 ms / 500 ms / 4.000 s |
| Beat positions in a measure | 1→0 · 1&→30 · 2→60 · 2&→90 · 3→120 · 3&→150 · 4→180 · 4&→210 | — |
| Phase II impacts | 2& (f90) and 4& (f210) | 1.5 s and 3.5 s |
| Time dilation | timescale 0.15; in over 12 f, out over 18 f | 200 ms in, 300 ms out |

### Defence windows

| Constant | Value | Time |
|---|---|---|
| Parry window | 10 f: press in `[Impact−10, Impact−1]` | 166.7 ms |
| Perfect Parry | last 4 f: `[Impact−4, Impact−1]` | 66.7 ms |
| With the relic | 14 f (Perfect stays 4 f) | 233.3 ms |
| Chastened Rhythm window | 14 f | 233.3 ms |
| Whiffed-parry recovery | 24 f | 400 ms |
| Parry Cone | ±25° around the striking part | — |
| Dash | 2 f startup; i-frames f2–f13 (12 f); 3.2 m in 14 f; lockout 36 f; Breath 20 | 200 ms i-frames, 600 ms lockout |
| Jump | feet above 0.6 m for 28 f; air time 44 f; apex 1.1 m; buffer 6 f | 466.7 ms, 733.3 ms, 100 ms |
| `DSR` jump press window | f35–f52 = 18 f | 300 ms |
| Phase II feint | stall 18 f (24 f in cycles 5–6) | 300 ms (400 ms) |
| Tail Reprisal concussion | 240 f | 4.0 s |

### Meters

| Meter | Rule |
|---|---|
| Vigor | 100 = 10 beads × 10 HP; Burrow mends +20 (cap 100); no consumables |
| Breath | 100; +25/s after 0.5 s idle; Dash −20; Guard absorbing a hit −15; Parry and Jump 0; Guard Break = 30 f stagger, full damage |
| Movement | Eye 1.65 m; walk 5.0 m/s; deep sand 3.75 m/s and dash ×0.75 (the 25 % penalty) |
| Melee | Slash 10/6/12 f, chain of 3, link window 8 f; Thrust = hold 30 f, then 16/6/20 f |
| Posture dealt | exposed neck: Slash 6, Thrust 14; anywhere else 1; Parry +15; Perfect Parry +25 (6 f hit-stop) |
| Sentinel Posture | 0–100; decays 4/s after 3 s without gain; Break at 100; after a question: correct → 45, wrong → 0 |
| Penance | 6 Seals; HP % = 100 − correct × 16.667; Phase II at ≤ 50 % (3rd correct answer) |
| Guard | raise 6 f; damage ×0.3; costs 15 Breath |
| Mercy | Vigor 0 → Penitent's Fall (2.5 s fade, cycle restarts, no try spent); after 2 falls Mercy Mode is offered: damage ×0.5, parry +4 f, Quickened off |

### Question and server rules

| Constant | Value |
|---|---|
| Question window | 6.0 world-s ÷ 0.15 = **40.0 real s**; relic 7.5 → 50.0 s; Scholar Mode ×2 → 80 s / 100 s; time-out = wrong |
| Commit beat | 0.4 world-s = 2.67 real s; no change after sealing |
| Correct | Judgement Strike: −1 Seal, Posture 45, **Chastened** for 2 attacks (`SMS`, wind-up 90 f, parry window 14 f, damage 0, no feints) |
| Wrong / time-out | Tail Reprisal `TR`: 30 damage, Posture 0, **Quickened** for 3 attacks (wind-ups ×0.8; `SMS` 48 f) |
| Pass rule | 5 of 6 (ratio 0.7; 4/6 = 66.7 % fails); 2nd wrong answer triggers the Litany of Review |
| Rewards and tries | First defeat 300 XP, replays 0; 3 lost fights → 24 h lockout |

### Controls

| Action | Keyboard + Mouse | Gamepad | Touch |
|---|---|---|---|
| Move / Look | W A S D / Mouse (Pointer Lock) | Left stick / Right stick | Left stick / drag right half |
| Slash / Thrust (hold) | LMB | RT | Big button (hold = thrust) |
| Guard / Parry (tap) | RMB | LT | Medium button |
| Dash Left / Right | Q / E | LB / RB | Two arrow buttons |
| Jump | Space | A | Small button |
| Pause + Controls Card | Esc | Start | Menu button |
| Answer (question only) | W top, D right, S bottom, A left; or ↑ → ↓ ←; or 1–4 | Y top, B right, A bottom, X left | Tap a stone or flick |

## Glossary

† marks an Arabic rendering proposed in this document; the rest are fixed by the project's canonical constants or the shipped app.

| English | Arabic | Meaning |
|---|---|---|
| Sandworm Sentinel | حَارِسُ دُودَةِ الرِّمَالِ | The boss; seeded title «حارس دودة الرمال» |
| The Cistern | الجُبُّ | The sunken arena |
| Veiled Blade | سَيْفُ التَّائِبِ | The linen-hilted sword; plain, no religious symbol |
| The Penitent's Rite | طَقْسُ التَّائِبِ | Mandatory controls briefing |
| The Steady Litany | الوِرْدُ الثَّابِتُ | Phase I, 4/4 on the beat |
| The Desecrated Meter | الإِيقَاعُ المُدَنَّسُ | Phase II, syncopation and feints |
| Penance bar / Seal | الكَفَّارَةُ† / الخَتْمُ† | Sentinel health; six Seals, one per correct answer |
| Vigor / Breath | العَافِيَةُ† / النَّفَسُ† | Player health (beads) / stamina |
| Posture / Posture Break | الاِتِّزَانُ† / اخْتِلَالُ الاِتِّزَانِ† | Stagger meter / the break that opens a question |
| Litany Cycle / Verse | دَوْرَةُ الوِرْدِ† / المَقْطَعُ† | Up to 6 attacks plus one question / one attack per measure |
| Burrow | الغَوْصُ† | Subterranean Hover: the fallback question trigger |
| Penitent Contemplation | تَأَمُّلُ التَّائِبِ† | The question window after a Posture Break |
| Chrono-Dilation | بُطْءُ الزَّمَنِ† | Timescale 0.15 during a question |
| Tablet | اللَّوْحُ | The floating stone that carries the question |
| Parry / Perfect Parry / Guard | الصَّدُّ† / الصَّدُّ التَّامُّ† / الاِحْتِرَاسُ† | Tap Guard / last 4 f of the window / held block |
| Judgement Strike | ضَرْبَةُ الحُكْمِ† | Correct-answer thrust into the eye |
| Tail Reprisal | قِصَاصُ الذَّنَبِ | Wrong-answer or time-out tail hit (`TR`) |
| Chastened Rhythm / Quickened Penance | الإِيقَاعُ المُؤَدَّبُ† / الكَفَّارَةُ المُعَجَّلَةُ† | Reward tempo / punishment tempo |
| Penitent's Fall | سَقْطَةُ التَّائِبِ† | Vigor 0; sepia fade, no try spent |
| Mercy Mode / Scholar Mode | وَضْعُ الرَّحْمَةِ† / وَضْعُ الدَّارِسِ† | Easier combat / double question time |
| Beat Ring | حَلْقَةُ النَّبْضِ† | Visual metronome on the reticle |
| Litany of Review | وِرْدُ المُرَاجَعَةِ† | No-damage review flow after the 2nd wrong answer |
| Eye of the Buried Pilgrim | عَيْنُ الحَاجِّ الدَّفِينِ | The relic dropped on victory |
| Bridle bit | الشَّكِيمَةُ† | Iron bit through the jaw (never "bridal") |

## How to Read This Document

Frames are simulation frames at timescale 1.0 unless a section says "real seconds". Attack IDs (`SMS`, `PGC`, `VGL`, `DSR`, `SB`, `PCL`, `TR`) and state names (`Idle`, `Telegraph`, `ActiveStrike`, `PostureBreak`, `QuestionActive`, `Execution`) are used exactly as in the modules. Cross-references read "Module 4 §2". The Quick-Reference above is the single source for shared numbers; a module that disagrees with it is wrong. Arabic appears in table cells and in `dir="rtl"` blocks; a renderer that ignores bidirectional text should apply right-to-left to them.

| Part | Subject |
|---|---|
| Module 0 | The Penitent's Rite: the mandatory pre-fight controls briefing, Training Post and settings |
| Module 1 | Liturgical title, lore, the Vow and the Miracle, whispered 3D lines |
| Module 2 | Viewmodel, boss scale and anatomy, telegraph visuals |
| Module 3 | Arena architecture, surfaces, spatial soundscape and rhythm |
| Module 4 | Defence mechanics, frame-data attack table, Phase II |
| Module 5 | Diegetic questions, Chrono-Dilation, answer binding, stakes |
| Module 6 | Execution cinematic, relic, state-machine JSON |
| Appendix A | Integration with the Anees codebase and the server contract the fight honours |
| Appendix B | Accessibility, wellbeing, content and cultural notes |
| Appendix C | Assets, milestones, KPIs, risks, open questions |

---

## Module 0 — The Penitent's Rite (Mandatory Pre-Fight Controls Briefing)

> <p dir="rtl" lang="ar">قِفْ يَا تَائِبُ، وَتَعَلَّمْ قَبْلَ أَنْ تَهْبِطَ إِلَى الجُبِّ.</p>
> *Stand, penitent, and learn before you descend into the cistern.* (Carved over the cistern stair; invented inscription.)

**Client requirement traced:** "make sure the controls are displayed to the student before the fight starts." This module makes that a hard gate, not a tooltip: the Sentinel stays dormant and combat input stays unrouted until the student has seen the controls and pressed **Enter the Cistern / ادخل الجُبّ**. It applies pillar 3 (*Read, Don't Guess*) before the first combat frame. The Rite is DOM UI on the real clock; the Training Post runs a private fixed-step sim at 60 FPS (1 f = 16.667 ms). Every sub-state below lives inside the canonical `ControlsBriefing` state.

### 0.1 Purpose and gating rules

| ID | Rule |
|---|---|
| G1 | **Hard gate.** Until `briefing.confirmed`, the fight sim tick count stays 0, the Sentinel stays dormant (head half-buried in the pit, no animation) and no input reaches combat. |
| G2 | **Every start.** Shown on every entry and retry, including replays of a cleared boss. Not shown after a Penitent's Fall (same fight) or in the 2D `BossArena`. On a 429 lockout the existing lockout panel appears with **Train at the Post**: the Training Post alone, no Enter Card, no `fight.begin()`. |
| G3 | **First visit** = flag `anees.boss5.briefed.<userId>` absent **and** `battle.triesLeft == battle.maxTries`. Otherwise **retry**. The flag is written at Enter. |
| G4 | **Dwell.** Next/Enter on each card stays disabled for **3000 ms (180 f)** of *visible, focused* time. A hidden tab pauses the clock; Back keeps earned dwell; there is no maximum. |
| G5 | **Cannot be skipped:** Cards 1–3, the Enter Card, the Enter gesture. **Skippable:** the Training Post and practice question, by a **2000 ms (120 f)** hold. |
| G6 | **On every card:** status strip "Tries left: 3 of 3 · Answer 5 of 6 questions correctly to win" (live from `battle`; at 1 try it adds "Last try."), the three-defences line, EN/AR toggle, and a settings gear: mouse sensitivity, invert-Y, FOV 70–110 (default 90), camera-shake 0–100 %, Beat Ring, Scholar Mode ×2, Mercy Mode. First visit adds a comfort question (Yes applies Appendix B.1's presets). |
| G7 | **Flows.** First visit: Card 1 → 2 → 3 → Training Gate → Training Post → Enter Card (dwell already earned, so 0). Retry: Enter Card only (Card 1 layout, compact, with "Replay training"), dwell 3000 ms. |
| G8 | **Ready gate.** The Rite is also the loading screen (Appendix A.2). Enter needs the fight chunk loaded and `GET /api/map/boss/5` answered; until then it reads "Preparing the cistern… 62 %". **Play the flat arena** (2D `BossArena`) is always a text link on the Enter Card. |

### 0.2 Screen-by-screen specification

Chrome: a stone-tablet panel (`#b9ae96`, ink `#14100d`, contrast ≈ 8.6:1) over the frozen, dimmed arena; device tabs top-left, progress pips top-right, status strip at the foot. **Live Echo:** each key or button lights its glyph while pressed, proving the device works. Tokens used by the cards resolve per scheme:

| Token | Keyboard + Mouse | Gamepad | Touch |
|---|---|---|---|
| `{slash}` | LMB (hold = Thrust) | RT | Big button |
| `{parry}` | RMB tap (hold = Guard) | LT tap | Medium button |
| `{dash}` | Q left / E right | LB / RB | Two arrow buttons |
| `{jump}` | Space | A | Small button |
| `{pause}` | Esc | Start / Menu | Menu button |

#### Card 1 — Controls (Keyboard + Mouse, Gamepad, Touch)

```
KEYBOARD + MOUSE
+------------------------------------------------------------+
| [*Keyboard+Mouse] [Gamepad] [Touch]           (*)( )( )    |
| THE PENITENT'S RITE      Card 1 of 3 - Controls            |
|  +-----+-----+   [Q][W][E]  W A S D move   Q/E dash L/R     |
|  | LMB | RMB |   [A][S][D]  Space jump     Esc pause        |
|  +-----+-----+   [ SPACE ]  Mouse = look (Pointer Lock)     |
|  LMB tap Slash, hold Thrust.  RMB tap Parry, hold Guard.   |
| Gold ting: tap RMB. Crimson eyes: Q/E. Sand ridge: Space.  |
| Tries left: 3 of 3   Answer 5 of 6 questions correctly     |
| [gear][EN|AR]                    [Back]  [Next  3..2..1]   |
+------------------------------------------------------------+
GAMEPAD                           TOUCH (landscape)
 LB Dash L          RB Dash R     [Menu]      drag right half = look
 LT Parry/Guard     RT Slash      (stick) [<][>]   (Guard)
 L-stick move   R-stick look      move    dash  [Jump] (SLASH)
 A Jump         Start pause                    hold SLASH = Thrust
```

Only the diagram changes per scheme. Gamepad glyphs follow the detected family (Xbox, PlayStation, neutral): LT/RT/LB/RB read L2/R2/L1/R1 and A/B/X/Y read ✕/○/□/△. A portrait touch device sees "Turn your device sideways" and Next stays disabled.

#### Card 2 — Read the Sentinel (three telegraph codes)

```
+------------------------------------------------------------+
| Card 2 of 3 - Read the Sentinel                 ( )(*)( )  |
| +----------------+ +----------------+ +----------------+   |
| | GOLD TING  /\  | | CRIMSON EYES() | | OCHRE RIDGE ~~ |   |
| | bronze gleam on| | embers from    | | crescent slump |   |
| | the bridle bit | | both eyes, red | | in the sand,   |   |
| | head dips low  | | ring on sand   | | look down      |   |
| | [)) 2.6 kHz]   | | [)) low drone] | | [)) scrape]    |   |
| | [Hear it]      | | [Hear it]      | | [Hear it]      |   |
| | = PARRY {parry}| | = DASH {dash}  | | = JUMP {jump}  |   |
| +----------------+ +----------------+ +----------------+   |
| A furrow in the sand or a dust ring under you: Dash too.   |
| Crimson cannot be blocked or parried. Move.                |
+------------------------------------------------------------+
```

Each column is a 2.0 s looped clip plus a text caption of its sound, so colour, shape, motion and sound each carry the code alone. The Parry column shows the real timeline: ting f36, window f50–f59 (10 f = 167 ms), Perfect f56–f59 (4 f = 67 ms), a gap of 50 − 36 = 14 f (233 ms) from ting to window. "Hear it" plays a 1 s sample.

#### Card 3 — Answer the Litany (answer cross, 5-of-6 rule, tries left)

```
+------------------------------------------------------------+
| Card 3 of 3 - Answer the Litany                 ( )( )(*)  |
|                [ A  top    W / Up / 1 ]                    |
| [ D  left A/Left/4 ]  (TABLET)  [ B  right D/Right/2 ]     |
|                [ C  bottom S / Down / 3 ]                  |
| Incense = your time: 40 s (80 s with Scholar Mode).        |
| An answer seals when pressed. No mouse pointer needed.     |
| Win = 5 of 6. One miss is allowed; a second miss loses     |
| this try, and you review the rest unharmed.                |
| Falling never costs a try.                                 |
| Tries left: 3 of 3                    [Back]  [Next 3..]   |
+------------------------------------------------------------+
```

| Stone | Label | Keyboard | Gamepad | Touch |
|---|---|---|---|---|
| Top (A) | أ | W, Up, 1 | Y (D-Pad up) | tap, or flick up from centre |
| Right (B) | ب | D, Right, 2 | B (D-Pad right) | tap, or flick right |
| Bottom (C) | ج | S, Down, 3 | A (D-Pad down) | tap, or flick down |
| Left (D) | د | A, Left, 4 | X (D-Pad left) | tap, or flick left |

The cross stays fixed in Arabic (RTL) mode because the keys are physical; only text mirrors. Pressing an answer on the card lights its stone and is never graded. Time-out is a wrong answer; 40 s = 6.0 world-s ÷ 0.15 (see Module 5).

### 0.3 The Training Post

**Setting.** The Training Post `T` of Module 3 §3.1.2 stands on the flagstones 6.3 m from the spawn (√(6² + 2²)): a 4.6 m acacia mast, tall enough for the head to rear to the Sentinel's eye height, whose arm carries the **Rehearsal Head**, a woven palm-fibre head with bleached chitin collar plates and a brass bit. A brass **Training mark** sits 2.4 m from the mast; loose sand is spread across the paving so a ridge can travel. [Begin training] is a gesture and requests Pointer Lock (keyboard + mouse). The head is non-lethal: a drill that "would have hit" dims the wrist beads for 60 f (1000 ms), then refills. Player-side rules stay real (Breath, 24 f whiffed-parry recovery, ±25° Parry Cone). On a retry the Post rises from the paving only for "Replay training".

**Slowing rule.** Wind-ups ×2 (telegraph events scale with them); parry window ×2 (Perfect ×2); Active and Recovery unchanged; the chain-click follows the slowed beat (every 120 f = 2000 ms). This is a separate `training` frame table, never the global timescale (Module 5 owns that).

| Drill | Wind-up real → training | Telegraph (training f) | Defence window (training f) | Active | Would have cost |
|---|---|---|---|---|---|
| `SMS` slow | 60 → **120 f** (2000 ms) | gleam f72–f96, ting f72, clicks f0, f120 | Parry press `[120−20, 120−1]` = **f100–f119** (20 f, 333 ms); Perfect `[112, 119]` (8 f, 133 ms). Ting-to-window gap 100 − 72 = 28 f (467 ms) = 2 × 14 | f120–f127 | 18 HP (1.8 beads) |
| `VGL` slow | 120 → **240 f** (4000 ms) | embers f96, ring appears f144, locks f200 | Dash press **f200–f238**: i-frames `[D+2, D+13]` cover Impact f240 for D = f227–f238; earlier presses clear the 2.2 m ring (3.2 m travel); before f200 the ring still tracks. Lock-to-impact 40 f (667 ms) | f240–f249 | 30 HP (3 beads) |
| `DSR` slow | 60 → **120 f** (2000 ms) | ridge visible f48, chain scrape rising | Jump press P needs P+8 ≤ 120 and P+36 ≥ 131, so **f95–f112** (18 f, 300 ms) | f120–f131 | 15 HP (1.5 beads; no sand-drag) |

The jump window is as wide as the real one (f35–f52, 18 f), shifted by +60 f, because jump arc and Active frames are not slowed: slowing buys reading time, not a wider commit window.

**Checklist logic.** Plaque on the post: `[ ] Parry the jaw  [ ] Dash out of the ring  [ ] Jump the ridge`. Drills loop `SMS` → `VGL` → `DSR` with a 120 f (2000 ms) rest; a ticked drill is skipped, a failed drill repeats next pass. Ticks are order-independent and last for the visit only.

| Item | Ticks when | Does not tick (hint) |
|---|---|---|
| Parry | Guard **tap** in f100–f119, reticle within ±25° of the head | Hold-block works, costs 15 Breath, no tick ("Tap, do not hold"); earlier "Too soon"; later "Too late"; off-cone "Face the jaw" |
| Dash | Dash in f200–f238 and the standard hit test passes over f240–f249 | Standing still, or pressing before the lock: "Wait until the red ring stops, then Dash"; Guard or Parry: "Crimson cannot be blocked or parried. Move." |
| Jump | Feet above 0.6 m on all of f120–f131 | P < f95 "Too soon"; P > f112 "Too late"; "Look down at the sand" |

After two consecutive fails on one drill, **Window Echo** pulses a notched arc on the Beat Ring through the window (shape, not colour). After the Parry tick the head recoils (90 f recovery) and its neck pales; "Slash the pale neck" is optional and unticked.

**Calibration (optional, after 3/3).** The Beat Ring pulses at 60 BPM; the student taps `{slash}` on eight beats (8 s). Offset = median of (tap time − nearest beat time); taps over 250 ms from a beat are discarded, fewer than 5 valid keeps the old value, and the result is clamped to ±100 ms (±6 f; 6 × 16.667 = 100 ms). Stored as `anees.boss.audioOffsetMs`; it shifts audio scheduling only, never a hit window (Appendix C.3).

**Practice question.** Then the head withdraws and one practice question appears: "Salma shares 36 dates equally among 4 children. How many dates does each child get?", choices 6 · 8 · 9 · 12, explanation "36 ÷ 4 = 9, because 4 × 9 = 36" (Arabic in §0.4). It is client-side only: no `/check`, no XP, nothing written to mastery, and not from `boss_questions`, so it exposes no server secret. Presentation is Module 5's (tablet 2.2 m ahead, four stones, 12 f dilation to 0.15, 40.0 s). Wrong or timed out: the explanation shows, the tablet re-lights, no Reprisal, unlimited retries. Correct (**9**, bottom stone C, the key that normally walks you backwards): golden chime, the head bows. Training ends at 3/3 plus an answer, or on skip: release Pointer Lock and go to the Enter Card; the Post sinks into the paving at Enter.

### 0.4 UI copy and i18n keys

Keys follow the existing flat camelCase `boss.*` namespace (`boss.backToMap`, `boss.loadError`) and are added to the `en` and `ar` `boss` blocks of `frontend/src/lib/i18n.ts`. `{n}`, `{max}`, `{s}` are interpolations. Card titles carry tashkeel; instructions use plain Modern Standard Arabic for readability at grades 4–6.

| Key | English | Arabic |
|---|---|---|
| `boss.riteTitle` | The Penitent's Rite | <span dir="rtl" lang="ar">طَقْسُ التَّائِبِ</span> |
| `boss.riteCard1` | Controls | <span dir="rtl" lang="ar">التَّحَكُّمُ</span> |
| `boss.riteCard2` | Read the Sentinel | <span dir="rtl" lang="ar">اِقْرَأِ الحَارِسَ</span> |
| `boss.riteCard3` | Answer the Litany | <span dir="rtl" lang="ar">أَجِبْ عَنِ الوِرْدِ</span> |
| `boss.riteCardOf` | Card {n} of 3 | <span dir="rtl" lang="ar">البطاقة {n} من 3</span> |
| `boss.riteTabKbm` | Keyboard + Mouse | <span dir="rtl" lang="ar">لوحة المفاتيح والفأرة</span> |
| `boss.riteTabPad` | Gamepad | <span dir="rtl" lang="ar">ذراع التحكّم</span> |
| `boss.riteTabTouch` | Touch | <span dir="rtl" lang="ar">اللمس</span> |
| `boss.riteNext` | Next | <span dir="rtl" lang="ar">التالي</span> |
| `boss.riteBack` | Back | <span dir="rtl" lang="ar">السابق</span> |
| `boss.riteDwell` | Read on… {s} | <span dir="rtl" lang="ar">تابع القراءة… {s}</span> |
| `boss.riteTries` | Tries left: {n} of {max} | <span dir="rtl" lang="ar">المحاولات المتبقية: {n} من {max}</span> |
| `boss.riteTriesLast` | Last try. | <span dir="rtl" lang="ar">المحاولة الأخيرة.</span> |
| `boss.riteRule` | Answer 5 of 6 questions correctly to win. | <span dir="rtl" lang="ar">أجب عن 5 من 6 أسئلة إجابةً صحيحة لتفوز.</span> |
| `boss.riteDefencesKbm` | Gold ting: tap the right mouse button. Crimson eyes: Q or E. Sand ridge: Space. | <span dir="rtl" lang="ar">رنين ذهبي: اضغط زر الفأرة الأيمن. عينان قرمزيّتان: Q أو E. حافة رمل: مفتاح المسافة.</span> |
| `boss.riteDefencesPad` | Gold ting: tap LT. Crimson eyes: LB or RB. Sand ridge: A. | <span dir="rtl" lang="ar">رنين ذهبي: اضغط LT. عينان قرمزيّتان: LB أو RB. حافة رمل: A.</span> |
| `boss.riteDefencesTouch` | Gold ting: tap Guard. Crimson eyes: tap an arrow. Sand ridge: tap Jump. | <span dir="rtl" lang="ar">رنين ذهبي: المس زر الحراسة. عينان قرمزيّتان: المس سهمًا. حافة رمل: المس زر القفز.</span> |
| `boss.riteCode1` | Gold ting = Parry | <span dir="rtl" lang="ar">رنين ذهبي = صدّ الضربة</span> |
| `boss.riteCode2` | Crimson eyes = Dash | <span dir="rtl" lang="ar">عينان قرمزيّتان = اندفاع</span> |
| `boss.riteCode3` | Ochre ridge = Jump | <span dir="rtl" lang="ar">حافة ترابيّة = قفز</span> |
| `boss.riteUnblock` | Crimson cannot be blocked or parried. Move. | <span dir="rtl" lang="ar">لا يمكن صدّ الضربة القرمزيّة؛ تحرّك.</span> |
| `boss.riteNoTry` | Falling never costs a try. Only the questions can. | <span dir="rtl" lang="ar">السقوط لا يكلّفك محاولة؛ الأسئلة وحدها تفعل.</span> |
| `boss.riteMissOne` | You may miss one question. A second miss loses this try, and you review the rest unharmed. | <span dir="rtl" lang="ar">يمكنك أن تُخطئ في سؤال واحد. الخطأ الثاني يُفقدك هذه المحاولة، وتراجع الباقي دون أذى.</span> |
| `boss.riteTrainBegin` | Begin training | <span dir="rtl" lang="ar">ابدأ التدريب</span> |
| `boss.riteTrainSkip` | Hold to skip practice | <span dir="rtl" lang="ar">اضغط مطوّلًا لتخطّي التدريب</span> |
| `boss.riteTrainOnly` | Train at the Post | <span dir="rtl" lang="ar">تدرّب عند العمود</span> |
| `boss.riteChk1` | Parry the jaw | <span dir="rtl" lang="ar">صُدَّ ضربة الفكّ</span> |
| `boss.riteChk2` | Dash out of the ring | <span dir="rtl" lang="ar">اندفع خارج الحلقة</span> |
| `boss.riteChk3` | Jump the ridge | <span dir="rtl" lang="ar">اقفز فوق الحافة</span> |
| `boss.riteHintSoon` | Too soon. | <span dir="rtl" lang="ar">مبكّر جدًا.</span> |
| `boss.riteHintLate` | Too late. | <span dir="rtl" lang="ar">متأخّر جدًا.</span> |
| `boss.riteHintCone` | Face the jaw. | <span dir="rtl" lang="ar">واجه الفكّ.</span> |
| `boss.riteHintTap` | Tap, do not hold. | <span dir="rtl" lang="ar">اضغط ضغطة قصيرة ولا تُطِل.</span> |
| `boss.riteHintRing` | Wait until the red ring stops, then Dash. | <span dir="rtl" lang="ar">انتظر حتى تثبت الحلقة الحمراء ثم اندفع.</span> |
| `boss.riteHintDown` | Look down at the sand. | <span dir="rtl" lang="ar">انظر إلى الرمل تحت قدميك.</span> |
| `boss.riteWouldHit` | That would have dimmed your beads. Nothing is lost here. | <span dir="rtl" lang="ar">كان ذلك سيُخفِت حبّات سُبحتك. لا شيء يضيع هنا.</span> |
| `boss.riteCalib` | Tap on every pulse of the ring. | <span dir="rtl" lang="ar">اضغط مع كل نبضة من الحلقة.</span> |
| `boss.ritePracticeQ` | Salma shares 36 dates equally among 4 children. How many dates does each child get? | <span dir="rtl" lang="ar">وزّعت سلمى 36 تمرةً بالتساوي على 4 أطفال. كم تمرةً يحصل عليها كلُّ طفل؟</span> |
| `boss.ritePracticeC0` `C1` `C2` `C3` | 6 · 8 · 9 · 12 | <span dir="rtl" lang="ar">6 · 8 · 9 · 12</span> |
| `boss.ritePracticeWhy` | 36 ÷ 4 = 9, because 4 × 9 = 36. | <span dir="rtl" lang="ar">36 ÷ 4 = 9 لأنّ 4 × 9 = 36.</span> |
| `boss.riteEnter` | Enter the Cistern | <span dir="rtl" lang="ar">ادخل الجُبّ</span> |
| `boss.riteLoading` | Preparing the cistern… {n} % | <span dir="rtl" lang="ar">جارٍ تجهيز الجُبّ… {n}%</span> |
| `boss.riteFlat` | Play the flat arena | <span dir="rtl" lang="ar">العب في الساحة المسطّحة</span> |
| `boss.riteDizzy` | Does a moving view make you dizzy? | <span dir="rtl" lang="ar">هل يُشعرك المنظر المتحرّك بالدوار؟</span> |
| `boss.riteYes` / `boss.riteNo` | Yes / No | <span dir="rtl" lang="ar">نعم / لا</span> |
| `boss.riteResume` | Return to the Fight | <span dir="rtl" lang="ar">عُد إلى المعركة</span> |
| `boss.riteResumeTrain` | Return to Training | <span dir="rtl" lang="ar">عُد إلى التدريب</span> |
| `boss.riteReplay` | Replay training | <span dir="rtl" lang="ar">أعد التدريب</span> |
| `boss.ritePaused` | Paused | <span dir="rtl" lang="ar">إيقاف مؤقّت</span> |
| `boss.riteLockRetry` | The cursor could not be held. Press again. | <span dir="rtl" lang="ar">تعذّر تثبيت المؤشّر. اضغط مرة أخرى.</span> |
| `boss.riteSteer` | Cursor-steer on: hold the cursor off-centre to turn. | <span dir="rtl" lang="ar">التوجيه بالمؤشّر: أبعِد المؤشّر عن المركز لتدور.</span> |
| `boss.riteNoSound` | Sound is off, so the Beat Ring is on. | <span dir="rtl" lang="ar">الصوت متوقّف، لذلك فُعِّلت حلقة الإيقاع.</span> |
| `boss.riteRotate` | Turn your device sideways. | <span dir="rtl" lang="ar">أدِر جهازك أفقيًّا.</span> |
| `boss.riteReconnect` | Press any button to reconnect your gamepad. | <span dir="rtl" lang="ar">اضغط أي زر لإعادة توصيل ذراع التحكّم.</span> |
| `boss.riteSilent` | The sands are silent. Retry | <span dir="rtl" lang="ar">الرمال صامتة. أعد المحاولة</span> |

### 0.5 Input-device detection, Pointer Lock handshake, fallbacks

**Detection.** `lastInputDevice` ∈ {`kbm`, `pad`, `touch`}, persisted in `localStorage` (`anees.boss.device`, try/catch). First load: `(pointer: coarse)` without hover means touch, else kbm. Updates: `keydown` or a real `mousemove` means kbm; a Gamepad API button press or axis beyond 0.5 (dead-zone 0.25) means pad (browsers hide a pad until its first press); `pointerType === 'touch'` means touch, with emulated mouse events ignored for 500 ms. A change crossfades the diagram over 24 f (400 ms); a manual tab click pins it until Enter. Tabs only preview: the scheme that plays is the device that *activated Enter*, logged as `device`.

**Handshake (kbm).** (1) Enter is a `<button>`. Its handler runs, synchronously and before any `await`, `audioCtx.resume()` and `canvas.requestPointerLock({ unadjustedMovement: true })` (once more without the option if it rejects or throws). (2) State `Arming`: overlay stays, spinner on the button. (3) Success is `pointerlockchange` with `document.pointerLockElement === canvas` within **30 f (500 ms)**. (4) Then write the `briefed` flag, emit telemetry, dissolve the overlay over 18 f (300 ms), route input to combat and call `fight.begin()` (first Verse per Module 4). Pad and touch skip the lock: resume audio, hide the cursor, begin. [Begin training] runs the same handshake without `fight.begin()`.

| Failure | Detection | Fallback |
|---|---|---|
| Lock refused | `pointerlockerror`, or no event in 30 f | Button reads "The cursor could not be held. Press again."; a second failure enables Cursor-Steer |
| Lock API absent or sandboxed | no `requestPointerLock` | **Cursor-Steer** (the drag-look fallback of Appendix C.4; dragging is impossible because LMB and RMB are combat): turn rate = clamp(cursor offset ÷ (0.35 × min(w, h)), −1, 1) × 180°/s, dead-zone 10 %, pitch ±85° |
| Lock lost mid-fight | `pointerlockchange` to null (Esc, Alt-Tab) | Pause + Controls Card; Enter inert for 90 f (1500 ms), since browsers refuse an immediate re-lock after Esc |
| Audio blocked | context not `running` after resume (a pad press may not count as user activation) | Force Beat Ring on, show "Sound is off…", allow Enter; the next pointer or key activation resumes audio |
| Pad disconnected | `gamepaddisconnected` | Pause; "Press any button to reconnect" |
| WebGL lost or absent, chunk fails, frame probe > 20 ms | `webglcontextlost`, import error, 5 s probe (Appendix A.2) | Rite closes; 2D `BossArena` opens |
| Boss status request fails | request error | "The sands are silent. Retry"; the fight cannot start without its questions |
| Storage blocked | `localStorage` throws | Settings and the `briefed` flag live in memory; first-visit logic falls back to `triesLeft == maxTries` |

### 0.6 Pause and reopen

Esc / Start / Menu, or any lock loss, sets `paused` at any time, including inside the Post. The browser swallows Esc when it releases the lock, so pause is driven by `pointerlockchange`, not the key. Timescale goes to 0, audio fades to 25 % over 12 f, and the question incense timer holds (Module 5). The same Controls Card reopens in **paused mode**: same layout, tabs and live settings (G6), "Replay training", and a primary button reading **Return to the Fight** (**Return to Training** in the Post). Resume re-arms as in §0.5 (lock request, 90 f guard), then a chain-click **count-in** with the scene frozen and the Beat Ring ticking: 3 clicks × 60 f = 180 f (3000 ms) in combat, 1 click (60 f) in a question. Beat phase continues from the frozen frame.

### 0.7 Accessibility of the briefing

- Cards are DOM: `role="dialog" aria-modal="true"`, focus trapped, heading focused on open, a real controls list (`<dl>`) beside each diagram, text alternatives for every glyph. Dwell-locked buttons use `aria-disabled` so they stay focusable; completion is announced via `aria-live="polite"`.
- Operable by keyboard (Tab, arrows for tabs), pad (D-Pad focus, A activate, B back, LB/RB tabs) and touch (targets ≥ 48 px).
- Never colour alone: each code has name, shape, motion and sound caption. Body text ≥ 18 px at 1280 px wide (Arabic Naskh ≥ 20 px, line-height 1.7); contrast ≥ 4.5:1 text, ≥ 3:1 graphics.
- `prefers-reduced-motion`: crossfades ≤ 6 f, clips become 3-step storyboards, shake preview 0. Nothing flashes above 2 Hz.
- Every hold has a **hold-free alternative** (activate twice within 2000 ms). Arabic sets `dir="rtl"`; diagrams and the answer cross do not mirror. **Play the flat arena** serves students who cannot play real-time combat.

### 0.8 Flow and state diagram

```
GET /api/map/boss/5 --429--> lockout panel --[Train at the Post]--> [TrainingPost]
   | 200                                                              (no Enter Card)
 first visit?
   | yes                                         | no (retry)
 [Card1]-3s->[Card2]-3s->[Card3]-3s->[TrainGate] |
   ^__Back____^__Back____^     | Begin   | hold 2 s = skip
                          [TrainingPost] |        |
                          drills 3/3, calibration, practice Q
                               |                  |
                               v                  v
                           [EnterCard] <------------- (retry lands here, 3 s dwell)
                               |  ^__ Replay training -> [TrainingPost] -> back
                               | Enter enabled only when dwell done AND chunk + data ready
                               v
                           [Arming] --lock ok / pad / touch--> [Combat: Idle ...]
                               | 2 refusals -> [Cursor-Steer] -> [Combat]
[Combat] --Esc / Start / lock lost--> [PausedCard] --Return (90 f guard)--> [Arming]
```

### 0.9 Acceptance criteria and QA checklist

**Acceptance criteria**
1. AC1: Sim tick count is 0 and no combat input is accepted from load until `briefing.confirmed`.
2. AC2: Next enables after 3000 ms ± 50 ms of visible time per card; a hidden tab does not count; Enter also waits for chunk and data (G8).
3. AC3: Scheme preselected from the last-used device within one input event; touch never triggers kbm.
4. AC4: Training windows match §0.3 (Parry f100–f119, Dash f200–f238, Jump f95–f112), verified by frame-injection tests at each edge and one frame outside.
5. AC5: Skip hold completes at 2000 ms ± 50 ms and resets on early release; the hold-free alternative works.
6. AC6: `requestPointerLock` runs in the same task as the Enter activation; two refusals yield Cursor-Steer.
7. AC7: Every `boss.rite*` key exists in EN and AR; Arabic renders RTL unclipped at 1280 × 720 and 640 × 360.
8. AC8: Completable by keyboard alone and by pad alone; axe 0 serious issues; Training adds ≤ 12 draw calls, ≤ 3k triangles; calibration stays within ±100 ms and moves no hit window.

**QA checklist**
- [ ] 429 shows the lockout panel, no Rite, and Train at the Post; WebGL off routes to `BossArena`.
- [ ] Fresh account = first visit; second entry = retry; cleared storage with 3/3 tries = first visit again.
- [ ] Tab hidden 10 s mid-card does not advance dwell; touch ghost-click ignored.
- [ ] Each drill: edges tick, one frame outside fails with the right hint; block-hold does not tick Parry; dash at f199 fails.
- [ ] Practice wrong, time-out, then correct: no Reprisal, no network call.
- [ ] Esc in the Rite, Post and a question reopens the Card; count-in 180 f / 60 f; instant Enter after Esc is held by the guard.
- [ ] Settings persist across reload; portrait phone blocked; Arabic keeps the cross un-mirrored.

### 0.10 Telemetry

Canonical events keep their names; payloads extend additively. No PII; practice results never enter mastery data. A Training-only session from the lockout panel emits nothing. Abandonment is derived: `boss_briefing_shown` without `boss_briefing_confirmed`.

| Event | Fires | Payload |
|---|---|---|
| `boss_briefing_shown` | Rite opens | `{visit: first or retry, device, triesLeft, lang}` |
| `boss_briefing_confirmed` | Lock ok, or pad/touch begin | `{device, trainingCompleted, visit, totalMs, cardDwellMs[3], itemsTicked, attempts{parry,dash,jump}, practiceCorrect, calibrationOffsetMs, lockAttempts, fallback}`; `trainingCompleted` = all three ticks |
| `pause_opened` (proposed, shared with Appendix C.3) | Card reopens mid-fight | `{where: briefing, training, combat or question, trigger: key, lockLoss or padLoss}` |

---

## Module 1 — Liturgical Title, Lore & World Narrative

This module fixes the Sentinel's name, founding myth and only voice. All text is invented for the game: no Qur'anic verse is quoted or paraphrased, no Catholic iconography appears, and nothing is presented as real scripture (bible §5). Arabic blocks are authored right-to-left.

### Part 1 — Full Liturgical Epithet

> **The Blind Coils of the Unabsolved Caravan**
>
> <div dir="rtl" lang="ar">الحَلَقَاتُ العَمْيَاءُ لِلرَّكْبِ غَيْرِ المَغْفُورِ لَهُ</div>

The client's example becomes the folk name, spoken by the Oasis NPCs and used in codex headers:

> <div dir="rtl" lang="ar">حَارِسُ الرِّمَالِ الأَعْمَى ذُو الخَطَايَا المُعَلَّقَةِ</div>

The canonical roster title stays «حَارِسُ دُودَةِ الرِّمَالِ» / Sandworm Sentinel.

**Rationale.** *Coils* names the segmented body and the chain wound through it in one word, so the silhouette and the title agree. *Blind* is mechanical as well as poetic: the Sentinel hunts by sound and vibration, which is why the sand ring is dangerous and why its only voice (Part 3) is a listening one. *Unabsolved* is rendered *ghayr maghfūr lahu* ("not forgiven"), a passive that leaves forgiveness with God; no character, priest or player ever grants it, and the player's role is to answer, not to absolve. *Caravan* is plural on purpose: the guilt is collective and every chain link is a person.

| Where it appears | Treatment |
|---|---|
| Boss nameplate | Golden sand-script burns into the flagstones at the player's feet over 90 f (1.5 s) during the first `Idle`; no HUD chrome (Pillar 4) |
| Penitent's Rite card | Short title only |
| Adventure Map level-5 node | Short title only |
| Codex headers | Folk name |
| Pass end card | Epithet shown once, then "Unabsolved" and «غَيْرِ المَغْفُورِ لَهُ» fade out; on `Endures` it stays |

### Part 2 — The Vow and The Miracle

Medium: a corroded brass plate riveted to the cistern lip beside the south flagstones (Module 3 §1), unlocked in the Codex when the player enters the cistern.

> **VOW AND MIRACLE**
>
> In the year the wells were sold by weight, a caravan of pilgrims and merchants, who had measured water against silver while the thirsty looked on, was swallowed by the dunes in a single night, and no one wrote down their names. By the will of the Merciful Lord, their shared guilt was forged into one blind colossus, coiled in corroded brass and weeping ribbons, and set beneath the sand to keep the cistern they had left dry. Whoever descends in penitence will hear it circling below, and will loosen its seals by understanding alone, for the sin of many is ransomed only by the learning of one.
>
> <div dir="rtl" lang="ar">فِي العَامِ الَّذِي بِيعَتْ فِيهِ الآبَارُ بِالمِيزَانِ، ابْتَلَعَتِ الكُثْبَانُ فِي لَيْلَةٍ وَاحِدَةٍ رَكْبًا مِنَ الحُجَّاجِ وَالتُّجَّارِ كَانُوا قَدْ وَزَنُوا المَاءَ بِالفِضَّةِ وَالعِطَاشُ يَنْظُرُونَ، وَلَمْ يُدَوِّنْ أَحَدٌ أَسْمَاءَهُمْ.</div>
> <div dir="rtl" lang="ar">وَبِمَشِيئَةِ المَوْلَى الرَّحِيمِ سُبِكَ إِثْمُهُمُ المُشْتَرَكُ فِي عِمْلَاقٍ وَاحِدٍ أَعْمَى، مُلْتَفٍّ بِنُحَاسٍ صَدِئٍ وَشَرَائِطَ بَاكِيَةٍ، وَأُقِيمَ تَحْتَ الرَّمْلِ حَارِسًا لِلجُبِّ الَّذِي تَرَكُوهُ جَافًّا.</div>
> <div dir="rtl" lang="ar">فَمَنْ نَزَلَ تَائِبًا سَمِعَهُ يَدُورُ تَحْتَهُ، وَلَنْ يَفُكَّ أَخْتَامَهُ إِلَّا بِالفَهْمِ وَحْدَهُ، فَإِنَّ إِثْمَ الجَمَاعَةِ لَا يُفْدَى إِلَّا بِعِلْمِ وَاحِدٍ.</div>

Sentence check: English 3 (full stops after "names", "dry", "one"); Arabic 3 (after «أَسْمَاءَهُمْ», «جَافًّا», «وَاحِدٍ»). The third sentence states the rule of the fight in lore terms: Seals loosen by understanding, not by the blade (Pillar 2).

### Part 3 — Spatial Dialogue: The Whispers

The Sentinel never speaks. The voices are the caravan's: an unvoiced, whispering chorus of mixed adult voices, so no fundamental competes with the oud (D2 73.4 Hz, A2 110 Hz). Each line is a 3.0 s (180 f) mono one-shot at 48 kHz, recorded by a native classical-Arabic voice actor, not synthesised.

| ID | Classical Arabic | Liturgical translation |
|---|---|---|
| W1 | <span dir="rtl" lang="ar">بِعْنَا المَاءَ لِلعِطَاشِ، فَأَطْبَقَ الرَّمْلُ عَلَيْنَا.</span> | We sold the water to the thirsty, and the sand has closed upon us. |
| W2 | <span dir="rtl" lang="ar">يَا تَائِبُ، أَجِبْ عَنَّا فَتَنْحَلَّ أَخْتَامُنَا.</span> | O penitent, answer for us, that our seals may be loosed. |

#### Trigger states (canonical names)

| State | Whisper | Rule |
|---|---|---|
| `ControlsBriefing` | none | Sentinel dormant |
| `Idle`, first of each attempt | W1, then W2 | Full orbit, t = 0 at `Idle` entry (the Sentinel is below the sand); hard-cancelled by a 12 f fade at the first `Telegraph` T0, so a short `Idle` plays W1 only, or nothing |
| `Burrow`, standard Hover | none | Module 5 §5.1.3 starts dilation at W48 (48 f = 0.8 s), shorter than one 180 f line; the 38 Hz rumble (Module 3 §3.2.3) carries the circling there |
| `Burrow`, Litany of Review | W1, then W2 | Full orbit, t = 0 at entry (after any concussion has cleared); Review Hovers are about 10 s apart (Module 5 §5.3.3) and the orbit needs 8.0 s |
| `QuestionActive` | none | A live whisper fades over 12 f (200 ms), matching the dilation ease-in; nothing plays at timescale 0.15 |
| `Telegraph`, `ActiveStrike`, `Recovery`, `PostureBreak`, `Judgement`, `Reprisal`, `PhaseShift`, `PlayerFall` | none | Hard gate; a live whisper fades over 12 f |
| `Execution` | W2 once | Centred, panner bypassed, mono, −24 dBFS; cue timing owned by Module 6 |

State gating keeps every whisper away from attack cues, including the `SB` rumble azimuth. The one overlap, the 12 f cancel fade at the first `Telegraph`, is covered by the duck in the masking budget.

#### Azimuth sweep

Convention: 0° = camera forward at orbit start, positive = clockwise from above (right ear +90°); world bearing β = yaw₀ + θ, with yaw₀ the camera's compass bearing (clockwise-positive) at orbit start. Rate **45°/s**, one full revolution in 360 / 45 = **8.0 s = 480 f** (two measures), so the source travels 0.7854 rad/s × 9.0 m = 7.07 m/s. θ(t) = −180° + 45·t.

```
                  0°  (4.0 s, silent crossing)
        W1 end -22.5°   |   +22.5° W2 start
          (3.5 s)       |       (4.5 s)
 L ear -90° ------------ P ------------ +90° R ear
   (2.0 s)                              (6.0 s)
      W1 start -157.5°  |  +157.5° W2 end
        (0.5 s)         |        (7.5 s)
                ±180°  (0 s / 8.0 s)
```

| t (s) | Frame | θ | Event |
|---|---|---|---|
| 0.0 | 0 | −180° | Orbit starts, silent |
| 0.5 | 30 | −157.5° | W1 onset on the "1&" eighth, between cajón hits |
| 2.0 | 120 | −90° | W1 crosses the left ear |
| 3.5 | 210 | −22.5° | W1 ends |
| 4.0 | 240 | 0° | Source passes under the player's front, silent |
| 4.5 | 270 | +22.5° | W2 onset (measure 2, "1&") |
| 6.0 | 360 | +90° | W2 crosses the right ear |
| 7.5 | 450 | +157.5° | W2 ends |
| 8.0 | 480 | ±180° | Orbit complete |

W1 and W2 are separated by 4.5 − 3.5 = 1.0 s = 60 f (one beat). If a Hover or the first `Telegraph` cuts in before t = 4.5 s, only W1 is heard.

#### Implementation parameters

| Parameter | Value |
|---|---|
| Orbit start | t = 0 is quantised to the next beat of the audio clock (wait ≤ 59 f), so every onset (+30 f, +270 f) lands on an "&" eighth |
| Orbit centre | Live player XZ; radius R = 9.0 m; depth −2.5 m; eye +1.65 m, so Δy = 4.15 m. The emitter is an audio proxy |
| Derived | d = √(9.0² + 4.15²) = 9.91 m; elevation = −atan(4.15 / 9.0) = −24.8°, constant |
| Position | `x = px + R·sin β`, `y = −2.5`, `z = pz − R·cos β`; written each real-time frame (60 Hz, unscaled) via `positionX/Y/Z.setValueAtTime`; listener orientation from the camera |
| `PannerNode` | Headphones: `panningModel:'HRTF'`; `distanceModel:'inverse'`, `refDistance:2`, `rolloffFactor:0.7` (Module 3 §3.2.2 default for non-P1 cues), `coneInnerAngle:360`, `coneOuterAngle:360`, `coneOuterGain:0` |
| Distance gain | 2 / (2 + 0.7 × (9.91 − 2)) = 2 / 7.54 = 0.265 = **−11.5 dB** |
| Level | Authored peak −16 dBFS, so −16 − 11.5 = **−27.5 dBFS** at the listener; bus `vox`, voice class P3 (Module 3 §3.2.5, §3.2.7) |
| Filters | High-pass 220 Hz (12 dB/oct) clears the oud D2/A2 and the 38 Hz rumble; low-pass 1.8 kHz, Q 0.7 ("through earth"); peaking notch 2.6 kHz, −18 dB, Q 4, insurance so the parry ting can never be unmasked |
| Reverb | The Module 3 cistern IR (RT60 1.8 s) on a `ConvolverNode`, pre-delay 24 ms, return high-cut 2.5 kHz, send −8 dB under dry (wetter than Module 3's −20 dB on purpose), whisper bus only; the send fades over 30 f after the state exits |
| Envelope | 12 f fade-in and fade-out on every line |
| Voice rules | One-shot only (`loop = false`); one whisper voice at a time; no layering; no looping layer (the only Burrow loop is Module 3's rumble bed) |
| Fallback | Speakers: `equalpower`, pan = sin θ × 0.85 (Module 3 §3.2.2). Mono: no panning; the caption carries the direction |
| Captions | Settings → Subtitles (default on, EN/AR): line as a 60 %-opacity sand-script lower-third with a direction arrow |

#### Masking budget

1. **Priority.** Whispers are P3 (Module 3 §3.2.7): under every P1 and P2 cue, over wind and music. The `vox` bus ducks −12 dB (×0.251) under every P1 cue (chain-click, 2.6 kHz ting, brass drone, rumble, tinnitus), attack 50 ms, release 250 ms (Module 3 §3.2.5), scheduled on the audio clock 50 ms ahead of the cue (cues are queued at T0), so full depth is reached on the cue's first sample. With a 160 ms hold (link strike plus 140 ms rattle), one click occupies 50 + 160 + 250 = 460 ms of each 1000 ms beat; a whisper is at full level for the other 540 ms (54 %, about 1.6 s of a 3.0 s line).
2. **Level.** At the listener the whisper peak must sit at least 15 dB under the chain-click peak: −12 − (−27.5) = 15.5 dB. Module 3's mix must hold the click at or above −12 dBFS.
3. **Spectrum.** Cues occupy sub-100 Hz (rumble, oud), the low brass band and 1–6 kHz transients (click, ting); the whisper is carved to 220 Hz–1.8 kHz with a 2.6 kHz notch.
4. **Time.** In a whisper state the only periodic sounds are the oud swell and the cajón heartbeat on the beats; onsets at +30 f and +270 f fall on "&" eighths, between cajón hits.
5. **Acceptance.** An offline render from orbit start through the first `Telegraph` T0 + 12 f must show click-to-whisper ≥ 15 dB at every click, and a mono sum must show no P1 cue cancelled.

### Lore Hooks Used Elsewhere

| Hook | Lore meaning | Used in |
|---|---|---|
| Golden prayer ribbons | Petitions the caravan wrote and never sent; they weep gold when cut | Module 2 §2; Module 6 §1 (prayer dust) |
| Corroded brass chains | The caravan's scales and weights fused into one chain, a name per link; the click is the old tally | Module 3 §2; Module 4 §2 (`SMS`, `PCL`); Module 6 §1 (jaw chain) |
| Stone tablet | The cistern's ledger slab carrying the Vow; the floating question tablet is that stone raised | Module 5 §2 |
| Dry cistern | The well they left empty; the arena | Module 3 §1; Module 6 |
| Tasbih beads | The pilgrims' counting beads; ten amber beads are 10 Vigor, a dim bead a lost count | Module 2 §1; Module 4 §1 |
| The Buried Pilgrim | The one who gave his water away and was entombed with them; his open eye is the only seeing eye in the colossus, behind the collar plates | Module 6 §2 (relic text must follow this); Codex entry 1 |

### Codex Entries

Stored with the account's existing boss progress; the server contract is untouched.

**1. The Cistern Remembers — «الجُبُّ يَتَذَكَّرُ»** (unlocked by Execution)

> The last seal falls and the brass goes quiet. The blade only opened the door; what loosened the caravan was every answer given. Carry the Pilgrim's eye. Whether they are forgiven is not written here.
>
> <div dir="rtl" lang="ar">سَقَطَ الخَتْمُ الأَخِيرُ وَصَمَتَ النُّحَاسُ. لَمْ يَفْتَحِ السَّيْفُ إِلَّا البَابَ، وَالَّذِي فَكَّ الرَّكْبَ هُوَ كُلُّ جَوَابٍ صَحِيحٍ. احْمِلْ عَيْنَ الحَاجِّ. وَهَلْ غُفِرَ لَهُمْ؟ ذَلِكَ لَيْسَ مَكْتُوبًا هُنَا.</div>

**2. The Tail's Reproof — «تَوْبِيخُ الذَّنَبِ»** (first Tail Reprisal; the toast waits until the 240 f concussion ends, so it is never shown during blur)

> The tail strikes without malice. It is the caravan's old reproach: a weight sold short, a question left unanswered. The sands will show the true answer when you can see again. Take it, and stand steadier.
>
> <div dir="rtl" lang="ar">لَا يَضْرِبُ الذَّنَبُ حِقْدًا، بَلْ هُوَ عِتَابُ الرَّكْبِ القَدِيمُ: مِيزَانٌ نَقَصَ، وَسُؤَالٌ بِلَا جَوَابٍ. سَتُرِيكَ الرِّمَالُ الجَوَابَ الصَّحِيحَ إِذَا أَبْصَرْتَ مِنْ جَدِيدٍ، فَخُذْهُ وَكُنْ أَثْبَتَ.</div>

**3. The Circling — «الدَّوَرَانُ»** (first Burrow, shown when the Burrow ends)

> When the Sentinel sinks, it does not flee. It circles beneath you, listening for your steps. The voices that rise from the sand are the caravan's, not the beast's. Listen to what they ask.
>
> <div dir="rtl" lang="ar">إِذَا غَاصَ الحَارِسُ فَلَيْسَ هَارِبًا، بَلْ يَدُورُ تَحْتَكَ مُصْغِيًا لِخُطَاكَ. وَالأَصْوَاتُ الَّتِي تَرْتَفِعُ مِنَ الرَّمْلِ لِلرَّكْبِ لَا لِلوَحْشِ. أَصْغِ إِلَى مَا يَسْأَلُونَ.</div>

**Cultural-care notes.** Vocabulary: *tawba* (penitent), *du'a*-style petition, *ḥajj*/caravan, *tasbih*, *al-Mawlā al-Raḥīm* as a generic epithet. Forgiveness is left to God (Part 1, Codex 1); no priestly absolution, confession, saints or cross symbolism. A native Gulf-Arabic editor reviews the Arabic before shipping.

---

## Module 2 — First-Person Visual Design, Viewmodel & Boss Scale

All timings are 60 FPS simulation frames at timescale 1.0 (1 f = 16.667 ms); frame data belongs to Module 4 and the design bible. Camera: eye height 1.65 m (5.4 ft), FOV 90°, read here as horizontal: 58.7° vertical at 16:9 (2 × atan(tan 45° × 9/16)), half-angle 29.4°. Angular figures assume 16:9 and shift with the FOV slider (70–110).

### 2.1 Player Viewmodel and Arms

#### 2.1.1 The hands and the diegetic meters

The student sees two forearms, a sword and a rim of iron at the top of the frame, never a face. The hands are dressed as penance, not heroism.

- **Gauntlets:** rusted iron lames over knuckle and forearm, rust `#6b4a2b` and `#7a4a1e`, brass rivets `#8a6a2f` with verdigris `#4f7a6a`, worn edges `#b9ae96`.
- **Penitent wraps:** rough linen `#e8dcc0`, sand-stained to `#c17a3a` at the cuffs, knotted every few centimetres. The left wrap carries a stitched invented line and is the surface Module 5 burns questions onto.
- **Veiled Blade / سَيْفُ التَّائِبِ:** a plain straight sword, 0.95 m (3.1 ft), linen-wrapped cross-guard hilt, with a linen veil at the guard that streams behind every swing (3-bone chain). No religious symbol is carved on it.
- **Brow-guard ("visor"):** a rusted iron lip across the top 5% of the frame; it catches splatter.

> <div dir="rtl" lang="ar">كُلُّ خَطِيئَةٍ عُقْدَةٌ، وَكُلُّ عُقْدَةٍ طَرِيقٌ إِلَى الرَّمْلِ</div>

*Wrap stitching (invented text, not scripture): "Every sin is a knot, and every knot a road into the sand."*

Pillar 4 (Diegetic First) puts the meters on the viewmodel and the Sentinel. These readings are visual only; Module 4 owns the numbers they mirror.

| Meter | Lives on | Reading |
|---|---|---|
| Vigor | Left-wrist cord, ten amber beads `#e0a860` | 1 bead = 10 Vigor; a damaged bead dims toward `#7a4a1e` in proportion. Beads sit lower-left and swing up in Guard; a Burrow mend (+20) flares them gold |
| Breath | Veil and brow-guard rim | 20 or more: veil streams. Below 20 (no Dash): veil droops, rim fogs. Below 15 (a block would Guard Break): blade trembles ±0.3° |
| Posture | Gold hairline cracks on the collar plates | One fissure at 25–49 (the Wounded carry-over of 45 shows as one), two at 50–74, three at 75–99; at 100 the plates spring open into Posture Break. Cracks close as Posture decays |

Viewmodel budget: ≤ 5,500 triangles (arms/gauntlets 2,600 + wraps 900 + blade and veil 700 + beads 10 × 96 = 960 + brow-guard 340 = 5,500), one 256² atlas, ≤ 6 draw calls. It renders in its own depth-cleared pass with a fixed 60° vertical camera, so the hands never stretch with the FOV slider or clip into the Sentinel. The Penitent's Rite controls card loops the Guard, Parry, Dash and Jump rows below as 2-second clips beside their key caps.

#### 2.1.2 Viewmodel state table

| State | Duration | Pose and motion | Secondary read |
|---|---|---|---|
| Idle | loop 240 f (4.0 s) | Low guard, blade upright, tip 20° right of vertical; arms rise 0.012 m over f0–f120 and fall over f120–f240, locked to the measure | Veil sways; soft bead click at f0 |
| Walk | cycle 34 f; 45 f on deep sand | Viewmodel counter-bob 0.012 m vertical, 0.008 m lateral (×1.5, plus 0.02 m gauntlet sag, on sand). The camera stays level unless head-bob is on (Appendix B.1) | 5.0 ÷ 1.4 m stride = 3.57 steps/s, 2 steps = 0.56 s ≈ 34 f; sand 3.75 ÷ 1.4 = 2.68/s, 0.747 s ≈ 45 f |
| Guard | raise 6 f (100 ms); release 6 f, cosmetic | Blade to centre-high, flat toward the Sentinel, left gauntlet braced on it | Breath trembling (meter table) |
| Parry | 10 f active (167 ms); whiff recovery 24 f (400 ms) | f0–f5 blade snaps into the Parry Cone, f6–f9 braced. Whiff: overshoot, 18° dip, beads swing, locked | Gold edge line for the active frames (14 f with relic); Perfect has no indicator, it is felt as hit-stop |
| Dash | 2 f startup, i-frames f2–f13, 14 f travel, 36 f lockout | Arms drag back 0.06 m, blade trails 12°, roll 3° toward travel, eased out by f36 | Sand streaks drawn f2–f13, equal to the invulnerable window; 3.2 m ÷ 14 f = 0.229 m/f |
| Jump | air 44 f (733 ms); above 0.6 m f8–f36; apex 1.1 m at f22 | Arms lag 0.05 m on lift-off, beads float | Cosmetic landing dip 0.04 m over 6 f |
| Slash | 10 + 6 + 12 = 28 f (467 ms); link 8 f | Chain of three: right-to-left diagonal, left-to-right return, vertical overhead; the veil leaves a 12 f trail | 3 f hit-stop; ichor streak on neck hits, sparks elsewhere |
| Thrust | hold 30 f (500 ms); 16 + 6 + 20 = 42 f (700 ms) | Blade draws to right hip, tip on reticle, arm trembling; at f30 the veil snaps taut and a gold flash runs the blade ("armed"); 0.5 m lunge | Same hit-stop and ichor rules |
| Question-kneel | in 12 f; held 6.0 world-s (40.0 real s; 50.0 with relic); out 18 f | Eye height 1.65 → 1.05 m; blade planted point-down, gauntlets on the pommel, beads hang forward; left wrap glows with the key map | Follows the timescale ease (1.0 → 0.15 over 12 f, back over 18 f) |

#### 2.1.3 Dynamic reactions

Hit-stop (counted in real frames) freezes simulation and viewmodel; the shake clock keeps running so the stop reads as a snap. Camera presets are defined in §2.3.4.

| Event | Viewmodel recoil | Camera | Sparks (count / life) |
|---|---|---|---|
| Guard absorbs a hit | Blade pushed back 0.10 m, 8°, settles in 8 f | S1 | 24 / 18 f |
| Parry | Blade kicks 0.14 m, 12°, 10 f | S1 + 3 f stop | 40 / 24 f |
| Perfect Parry | Kick 0.18 m, 16°, 12 f; gauntlet flares gold; gold ring flash, one 12 f ramp | S2 + 6 f stop | 60 / 30 f |
| Blade on plated chitin (Posture +1) | Rebound 0.18 m, 14° twist: "the chitin rejects the blade" | S1 + 3 f stop | 40 / 24 f |
| Blade on exposed neck | Blade sinks 0.05 m before the stop; ichor runs down the veil | S1 + 3 f stop | none; 8 ichor drops |
| Guard Break (30 f = 500 ms stagger) | Blade batted up 25°, left gauntlet torn off the flat, beads lash | the hit's own preset | 30 / 24 f |
| `VGL` guard or parry attempt | Blade skids 0.25 m sideways along the chitin; beads lash | S3 on hit | 30 / 30 f, grinding |
| `TR` | Gauntlets thrown up and aside 0.3 m; blade drops to 40° | S5 | none; heavy splatter |

Sparks are GPU streak billboards, gold `#e0a860` heads fading to `#c17a3a`, launched from the contact point across the camera. Only the head is luminous, and for ≤ 3 f; the rest of the listed life is a dim fading streak, which keeps Appendix B.2 intact (≤ 3 flashes in any second, nothing faster than 2 Hz). Concurrent cap: 150.

**Splatter.** Three kinds land on the visor rim (droplets that bead and run) and in the peripheral annulus (screen-space decals).

| Kind | Source | Look | Lifetime |
|---|---|---|---|
| Sand | `SMS` sweep, `DSR`, `PGC`, `SB` eruptions | Matte `#c17a3a` grit, slides down | 90 f (1.5 s), fades over the last 30 f |
| Ichor | neck hits, parries, `TR`, Execution | Glossy `#14100d`, drips 0.02 screen-heights/s | 240 f (4.0 s), fades over the last 60 f |
| Golden dust | Perfect Parry, Judgement | Additive `#e0a860` flecks, rising | 60 f (1.0 s) |

**Cap and clean-up rules**
1. Max 24 live decals (16 in Phase II, where the dust storm already masks the periphery). Each ≤ 4% of screen area; combined ≤ 20%. Eviction is oldest-first, fading over 6 f.
2. Nothing spawns inside the reticle clear zone, radius 30% of half-height around screen centre: a telegraph is never hidden by a stain.
3. A Perfect Parry flash wipes the two oldest ichor decals; a Dash wipes sand decals older than 30 f (12 f fade).
4. Entering `QuestionActive` fades every decal over 18 real frames (300 ms) so the tablet is legible; `PlayerFall` clears all instantly.
5. Setting "Screen Splatter" (Full / Reduced / Off): Reduced = cap 8, lifetimes ×0.5.

### 2.2 Boss Scale and First-Person Visual Anatomy

The Sentinel is 38 m long and almost entirely underground. The student meets only the first 5.4 m, from below: a blind head the size of a doorway, hung with penance.

#### 2.2.1 Scale table

| Element | Metres | Feet |
|---|---|---|
| Player eye height | 1.65 | 5.4 |
| Veiled Blade | 0.95 | 3.1 |
| Body radius (diameter 3.2 m / 10.5 ft) | 1.6 | 5.2 |
| Gullet diameter | 3.6 | 11.8 |
| Head height, lowered (`SMS`) | 1.7 | 5.6 |
| Eye height, reared (`VGL`) | 4.6 | 15.1 |
| Eye above the player's eye (4.6 − 1.65) | 2.95 | 9.7 |
| Crown, reared | 5.4 | 17.7 |
| Eye diameter / centre spacing | 0.5 / 2.0 | 1.6 / 6.6 |
| Bridle bit length | 0.45 | 1.5 |
| Prayer ribbon, ×8 (length × width) | 3.2 × 0.35 | 10.5 × 1.1 |
| Dragging chain, ×4 (24 links × 0.25 m) | 6.0 | 19.7 |
| Total length | ≈ 38 | ≈ 125 |

#### 2.2.2 Anatomy as the camera meets it

```
        seals x6 hang on the bridle chain
  | | |      ____________________      | | |   gold ribbons weep
  | | |     /  (O)            (O)  \    | | |
              cataract eyes, 4.6 m (15 ft)
         ==[bit]=================[bit]==       bridle bits through jaw
            /  .-"""""""""""""""-.  \
           |  /  zellij ring       \  |
           | |  masonry teeth ring  | |        gullet 3.6 m
           |  \  dark honeycomb    /  |
            \   '-._____________.-'  /
   C1 ====== SOFT NECK (matte ochre) ======     exposed in recovery only
   C2 collar plate, then rings R1..R9 into the sand
   ~~~ bronze chain ~~~~~~~~ bronze chain ~~~    dragging toward the camera
```

- **Segmented carapace:** collar plates C1–C3, then ring segments R1–R9 trailing into the sand. Bleached chitin, ichor-black seams, sand-stained in the lowest metre.
- **Eyes:** two milky cataract eyes, chitin clouded with tablet-stone swirls, unlit except during the `VGL` tell. The head turns toward the player's footsteps (blind, hunting by vibration).
- **Bridle bits:** two iron bars driven through the jaw hinge, capped with bronze rosettes that carry the gleam.
- **Gullet:** three concentric rings of calcified teeth: 18 outer blocks of minaret masonry (brick courses), 12 middle shards of shattered zellij (star-and-hexagon tile, verdigris and brass faces), 8 inner points, then dark muqarnas-like honeycomb. The tiles are geometric and carry no lettering, so no sacred script is ever shown broken.
- **Soft neck:** the one matte, unplated surface, in concentric folds, a band 0.8 m tall whose midpoint is posed 0.9–1.6 m above the flagstones in every recovery pose (chest-to-eye height, readable with a level reticle). When exposed it pulses a golden glow `#e0a860` once per 60 f.
- **Ribbons and chains:** eight golden prayer ribbons weep dust (one drip per ribbon every 20 f) and trail onto the sand before the camera. Four bronze chains drag across the flagstones; in Phase I the nearest slack loop lifts 0.15 m over the 6 f before each beat and drops on it, so the chain-click is visible as well as audible.

#### 2.2.3 What the player sees

Elevation to the reared eyes = atan(2.95 ÷ d). Gullet width = 3.6 ÷ (2 × d × tan 45°) = 1.8 ÷ d of screen width. A level reticle shows up to 29.4° above the horizon.

| Distance | Eye elevation | Gullet width | View |
|---|---|---|---|
| 3 m | 44.5° (needs +15.1° pitch to reach the top edge) | 60% of screen (61.9°) | Melee range, and the distance of a lodged `VGL` head. Chitin walls fill the frame; the eyes are overhead and off-screen at level pitch; teeth, zellij shards and ribbon ends sweep past. The neck band sits at chest height |
| 6 m | 26.2° (87% of the way to the top edge) | 30% (33.4°) | The whole head is a dark mouth under two pale eyes. Chains cross the foreground; `SMS` and `DSR` are readable here |
| 11 m | 15.0° (48% of the way up) | 16% (18.6°) | Full silhouette: trunk, collar, head. Ember eyes and the `VGL` ring read at a glance. `PGC` furrows draw toward the camera |
| 16 m | 10.4° (33% of the way up) | 11% (12.8°) | A bleached tower with a hanging chain-and-ribbon skirt. Burrowing, vortices and the dust ring read best here |

"Way up" is tan(elevation) ÷ tan 29.4° (0.4917 ÷ 0.5625 = 0.87 at 6 m). Widths: 1.8/3 = 0.60, 1.8/6 = 0.30, 1.8/11 = 0.16, 1.8/16 = 0.11. The eyes reach the top edge at 2.95 ÷ 0.5625 = 5.24 m; inside that the student must pitch up.

#### 2.2.4 Palette use

| Surface | Colours |
|---|---|
| Carapace | Chitin `#e8dcc0`; seams `#14100d`; base stain `#7a4a1e`; Phase II tint 25% toward `#b9ae96` |
| Eyes | Chitin `#e8dcc0` + `#b9ae96` swirl; `VGL` ember `#c4291c` only |
| Bits, chains | Brass `#8a6a2f`, verdigris `#4f7a6a`; gleam highlight `#e0a860` |
| Gullet | Teeth `#b9ae96` / `#e8dcc0`; tile faces `#4f7a6a` / `#8a6a2f`; throat `#14100d` |
| Soft neck | `#c17a3a` mixed 60% with `#b9ae96`, glow `#e0a860` |
| Ribbons | `#e0a860` with `#14100d` invented glyphs |

**Reserved-cue rule:** crimson emission exists only on Dash cues and the 4-point horizontal flare only on Parry cues. Ambient gold (ribbons, neck pulse) is soft and never flares, so no decoration imitates a telegraph.

#### 2.2.5 Model and texture budget

| Item | Budget |
|---|---|
| Sentinel total | ≤ 45,000 tris; planned **44,408** |
| Head crown/cheeks/sockets 7,500; jaw 5,500; gullet 10,500; collar + neck 4,000 | 27,500 |
| Trunk R1–R9 8,000; tail 1,500; bridle 1,400; seals and ribbons 1,400 | 12,300 |
| Chains: 4 × 24 links × 48 tris | 4,608 |
| Mobile LOD1 (50%) | ≤ 22,500 tris (22,204 planned) |
| Atlas | one 1024² (16 tiles of 256 px, nearest-neighbour, baked AO, dithered shadow) |
| Draw calls | Sentinel ≤ 12; viewmodel ≤ 6; VFX, decals and post ≤ 8; total ≤ 26 of the 150 budget |

### 2.3 Animation and Telegraph Systems

#### 2.3.1 Principles

Every cue is anchored to Impact, not T0, so Chastened and Quickened variants keep each cue's lead (§2.3.3). Every attack has a unique sound, motion and shape. Clips are authored at 60 fps and sampled by simulation frame, so a clip frame is a combat frame; Chastened and Quickened retime only the wind-up segment (60 → 90 or 48 f).

#### 2.3.2 Telegraph Cue Matrix (Phase I, frames from T0)

In Phase I a chain-click sounds on every beat, so every row has clicks at T0 and each 60 f after it; rows name them where they matter.

| Attack | Visual tell | VFX | Camera | Audio |
|---|---|---|---|---|
| `SMS` Impact f60, Active f60–f67 | Head lowers to 1.7 m and cocks 35° to the origin side by f36; jaw opens 20°; held to f59; 140° sweep | Bronze gleam on the origin-side bit f36–f48 (4-point horizontal flare). It ends at f48, before the parry window opens at f50 (f50–f59, Perfect f56–f59): the cue is not the target | Hit S2 yaw-biased; Guard S1; Parry S1 + 3 f; Perfect S2 + 6 f | Chain-click f0, f60; 2.6 kHz ting f36, panned to the origin side |
| `PGC` Impact f120, Active f120–f143 | Sentinel ≈ 14 m away dives; 3.0 m furrow draws toward the player, locks f60; surfaces f85; rush f85–f120 (35 f × 0.4 m/f = 14 m) | Furrow edges flash crimson at f60, then hold as two steady lines; sand curls; eruption wall at f120 | S1-capped tremor from f85; hit S3 pitch-biased | Low brass drone rises f60–f120; sand hiss tracks the furrow f85–f120 |
| `VGL` Impact f120, Active f120–f129 | Head rears to 4.6 m f0–f60, gullet tilts down | Crimson embers pour from both eyes from f48; heat shimmer f48–f120; red 2.2 m-radius ring with radial ticks appears f72, follows to f100, locks | Pitch up to read; hit S3 + 30 f knockdown (eye drops to 0.5 m) | Brass drone rises from f48; chain-click f0, f60, f120; blade-skid scrape if blocked |
| `DSR` Impact f60, Active f60–f71 | Head slides under the dune; crescent slump from f24; ridge 0.55 m high, 7 m arc | Ochre-lit crest line, sand tumbling off it; jump window f35–f52 | Ridge leaves the level view inside 2.93 m (1.65 ÷ 0.5625); look down; hit S2 + sand-drag wash 60 f | Chain scrape rises from f24 |
| `SB` Impact f120, Active f120–f127 | Burrow dive at f0; no body is visible | f54 ring of radius 2.4 m (dust, fluttering golden paper) under the player, tracks to f96, locks as a hard-edged wall; erupts f120 | Tremor ramps 0 → 0.4° by f96; hit S4 | 38 Hz sub-bass at f0 panned to the eruption azimuth; ring hiss from f54 |
| `PCL` (II) Impact f54, Active f54–f59 | Chain coils high-left or high-right f0–f40, whips f54 | Gleam on chain head f30–f42 (Impact − 24 to − 12); window f44–f53, Perfect f50–f53 | Parry S1; hit S2 | False off-pattern click f24; ting f30 |
| `TR` Active f12–f17 | None by design; tail whips in from screen right at +12 f | Splatter burst; 240 f concussion: 6 px blur, 8 px double-vision | S5, never tiered down | 2.8 kHz tinnitus 240 f; chain-click stays audible |

`SMS` timeline (the gleam ends two frames before the window opens):

```
f   0         36     48 50        56 59 60      67
    |         |      |  |         |  |  |       |
head ==cock+lower==jaw 20°==held=====>sweep=====|
gleam               [======]
ting                ^
parry window              [=========]
perfect                         [====]
impact                               ^
```

The tier rule: any Active frame that does not hit the player at full damage (dodged, guarded or parried) plays one preset lower, with S1 as the floor; Perfect Parry is the one exception and plays S2 as its reward. `TR` and hit-stop are never tiered.

#### 2.3.3 Modifier and Phase II variants

Cues sit at fixed leads before Impact (`SMS` ting at Impact − 24; gleam Impact − 24 to − 12), so the modifiers move them with the wind-up:

| `SMS` under | Wind-up | Ting / gleam | Parry window | Perfect |
|---|---|---|---|---|
| Standard | 60 f | f36 / f36–f48 | f50–f59 (10 f) | f56–f59 |
| Relic (14 f) | 60 f | f36 / f36–f48 | f46–f59 | f56–f59 |
| Chastened | 90 f | f66 / f66–f78 | f76–f89 (14 f) | f86–f89 |
| Quickened (60 × 0.8) | 48 f | f24 / f24–f36 | f38–f47 (10 f) | f44–f47 |

With a 14 f window (relic, Chastened) the window opens while the gleam is still lit: cue and target meet, the intended reward. Phase II:

| Variant | Frames | Cue changes |
|---|---|---|
| Feint `SMS` | Stall f40–f57 (18 f) or f40–f63 (24 f, cycles 5–6); motion resumes f58 or f64; Impact 60 + 18 = f78 or 60 + 24 = f84; Perfect f74–f77 or f80–f83 | Head frozen, gleam lit, false click at f40. Resumed motion is the true cue |
| Feint `PCL` | Impact 54 + 18 = f72 or 54 + 24 = f78; Perfect f68–f71 or f74–f77 | Same stall rules |
| `PGC` II | Wind-up 96; locks f48; surfaces f61 (96 − 35) | Furrow edges flash faster (2 flashes) |
| `VGL` II | Wind-up 96; embers f24, ring f48 (Phase I leads of 72 and 48 f); locks f84; Echo Slam at 96 + 36 = f132 | Echo ring: outline only, on the landing zone from f96 |
| `DSR` Twin Ridge | Ridge 1 f60–f71, ridge 2 f102–f113 (+42) | Scrape repeats a minor third higher |
| `SB` Twin Breach | Two rings 3 m apart, both lock f96 | Two sub-bass pulses panned to two azimuths |

#### 2.3.4 Camera shake presets

Rotation = A × k × e^(−3t/T) × noise, where k is the player's shake slider (0–100%, default 100%). Overlaps take the stronger shake rather than summing. At 0%, hit-stop and viewmodel recoil still play. Shake runs on the world clock: under dilation a 24 f preset rolls out over 24 ÷ 0.15 = 160 real frames (Module 5).

| ID | Peak | Duration | Roll | Rate | Axis | Used by |
|---|---|---|---|---|---|---|
| S1 Tick | 0.4° | 6 f (100 ms) | none | 28 Hz | even | Guard, parry, blade landing, tremor ramps |
| S2 Thud | 1.2° | 12 f (200 ms) | none | 22 Hz | yaw 70% | `SMS`, `PCL`, `DSR` hits; Perfect Parry |
| S3 Slam | 3.0° | 24 f (400 ms) | none | 16 Hz | pitch 80% | `PGC`, `VGL` hits |
| S4 Breach | 4.5° | 36 f (600 ms) | ±5° | 12 Hz | pitch 70% | `SB` hit |
| S5 Reprisal | 6.0° | 45 f (750 ms) | 10° | 9 Hz | roll + pitch | `TR` only |

#### 2.3.5 Signature effects

- **Ember eyes (`VGL`):** two emitters, 0.25 m radius, rate ramping 0 → 90 per second each over f48–f120 (1.2 s, so 75/s²). Lifetime 58 f, the free-fall time from 4.6 m (√(2 × 4.6 ÷ 9.8) = 0.97 s). Peak live ≈ 104 (75 × (1.2² − 0.23²) ÷ 2 ≈ 52 per eye); pool 240. Crimson core `#c4291c`, ichor-black smoke, no gold (gold is the Parry code). Emission is continuous, never blinking; cinders smoulder on the flagstones.
- **Bronze gleam (`SMS`, `PCL`):** a flare 0.9 m long and 0.25 m tall with a 12 f UV-scrolled specular sweep across the rosette. Side is encoded three ways: head cock, gleam side, ting panned to that ear.
- **Dust geysers (`SB`):** the ring's 2.4 m is a radius, matching `VGL`'s 2.2 m; a 3.2 m dash clears either. 160 dust particles rise 0.6–1.4 m/s; 12 golden paper strips flutter at 3 Hz. The column grows from 0.3 to 1.2 m over f54–f96, then stops rotating and hardens into a wall at lock. The f120 eruption throws a 6 m column past the camera.
- **Heat distortion:** one post pass offsets UVs by noise, 0 → 4 px (1080p) by f120, plus a 3-tap radial blur peaking at 1.5 px, centred on the Sentinel's projected head (radius 0.35 of half-height). Strength × smoothstep(0.1, 0.3, r), r the distance from screen centre in half-heights, so the reticle never wobbles. Phase II adds a 2 px edge shimmer. Suppressed during the `TR` concussion; under `prefers-reduced-motion` it becomes the static vignette (Appendix B.1).

#### 2.3.6 Idle and breathing

Phase I: the trunk swells 3% over f0–f120 (neck folds open) and eases back over f120–f240, with a 40-particle dust exhale at f120 (beat 3). The head yaws ±20° toward the player's last footstep with a 90 f lag (30 f on the deep-sand ring); this is cosmetic and changes no frame data. Phase II: the breath splits 90 + 90 + 60 = 240 f, mirroring the 3+3+2 tresillo (accents f0, f90, f180), and the chain lifts follow the syncopated click.

#### 2.3.7 Phase II visual changes

At `PhaseShift` (after the 3rd Judgement): three seals have burst; three trunk plates (R2, R4, R6) shear off and fall, exposing an ichor-black underlayer, while the collar plates stay so the neck keeps its frame; ribbon drips double (one per ribbon every 10 f); the dust storm begins (vignette opacity 0.55, peripheral visibility ≈ 70% of screen radius, edge-weighted shimmer). Audio cues are not masked. No ember glow appears outside `VGL`.

#### 2.3.8 Colour-independent alternatives

Relative luminance: gold `#e0a860` ≈ 0.45, ochre `#c17a3a` ≈ 0.26, crimson `#c4291c` ≈ 0.13. Gold:ochre is only 1.6:1 ((0.45 + 0.05) ÷ (0.26 + 0.05)), and crimson on sand about 1.7:1, so luminance is never the cue. Every telegraph shape therefore carries a ≥ 2 px ichor-black rim or sits on a dark surface (Appendix B.4), and the optional Telegraph Outline adds a chitin-white edge.

| Defence | Shape and motion | Sound | Haptic (gamepad) | High-contrast mode |
|---|---|---|---|---|
| Parry | Horizontal flare, sideways motion | 2.6 kHz ting | Short sharp pulse | Diagonal-hatched outline |
| Dash | Vertical rise; furrow line (`PGC`), ring with radial ticks (`VGL`) | Low brass drone | Rising low rumble | Double-line ring |
| Jump | Crescent ridge on the ground | Chain scrape | Stuttering pulses | Dotted crest line |
| Breach | Hard-edged dust ring | 38 Hz sub-bass | Heavy rumble weighted to the azimuth | Concentric rings |

The **Beat Ring** (reticle metronome) contracts from 3.0° to 0.4° over 60 f and lands on each beat; in Phase II it follows the chain-click. The controls card uses these same glyphs.

#### 2.3.9 react-three-fiber implementation notes

- **Loop:** `<Canvas dpr={[0.75, 1]}>` with drei's `PerformanceMonitor` driving DPR. A fixed 1/60 s accumulator; timescale scales simulation dt only. UI, input and the question timer use real time.
- **Camera:** three.js `fov` is vertical, so on resize set it to 2 × atan(tan(hFOV ÷ 2) ÷ aspect): 58.7° at hFOV 90° and 16:9.
- **Viewmodel pass:** a positive-priority `useFrame` takes over rendering: render the world, call `gl.clearDepth()`, then render the viewmodel scene.
- **Materials:** one lit material with a 4-step dither ramp via `onBeforeCompile`; `magFilter = NearestFilter`.
- **Sentinel:** SkinnedMesh, 36 bones; `AnimationMixer.setTime(frame / 60)` per attack clip, cue events at the frames above.
- **Chains and ribbons:** one InstancedMesh of 96 links (4 × 24) with CPU verlet at 60 Hz; the 8 ribbons are vertex-shader sine sway on 8 strips of 12 segments.
- **Particles:** stateless GPU particles. The CPU writes spawn records (t0, origin, seed) into a ring buffer and the vertex shader evaluates position from world time, so dilation is free. Three draw calls: additive world, alpha world, screen-space. Decals are one 24-instance mesh.

| Pool | Size |
|---|---|
| Sparks 150; screen droplets 200; ember eyes 240; golden dust 800 | 1,390 |
| Geysers (2 × 160 dust + 48 paper) 368; ejecta and ichor 400; ribbon drips 64 | 832 |
| Ambient motes 300; chain puffs 96; Phase II storm 1,200 | 1,596 |
| **Total** | **3,818 of 4,000** |

Golden dust 800 plus the 400 ejecta/ichor slots are Module 5's 1,200-particle Judgement burst; ejecta and ichor share a pool because an eruption never coincides with a Judgement or Execution. On mobile LOD (50%) halve every pool (1,909), cap decals at 12, and use one half-resolution post pass: a single shader for heat, storm vignette and the concussion blur (5-tap), gated by uniforms.

---

## Module 3 — 3D Arena Architecture & Spatial Soundscape

The Sentinel is blind, so the arena is its instrument: the paving is a drum, the sand is a wire, and the student's own footsteps are the loudest sound in the room. This module owns geometry, surfaces, light and positional cues; frame data stays in Module 4, question staging in Module 5. Frames are 60 FPS simulation frames (1 f = 16.667 ms); T0 is an attack's first Telegraph frame.

### 3.1 Arena Layout and Navigation

The arena is **The Dry Cistern of the Caravan** / «الجُبُّ الجَافُّ»: a sunken courtyard the dunes have half refilled.

#### 3.1.1 Coordinate frame and zones

Compass: N = −Z (three.js forward), E = +X, azimuth clockwise from N, `(x, z) = (r·sin az, −r·cos az)`. FOV here means **horizontal 90°**: vertical 58.7° at 16:9, half-angle 29.4°, tan = 0.5625.

| Zone | Radius | Surface | Area | Note |
|---|---|---|---|---|
| Cistern pit | 0 – 3.0 m | broken coping, 6 m drop | π·3² = 28.3 m² | Sentinel's mouth; 0.4 m kerb collider, so walkable floor starts at r = 3.4 m (3.0 + capsule 0.4) |
| Flagstone disc | 3.0 – 11.0 m | firm paving | π(11² − 3²) = 351.9 m² | fighting floor |
| Deep-sand ring | 11.0 – 16.0 m | deep sand | π(16² − 11²) = 424.1 m² | penalty ground |
| Sand bank | 16.0 – 17.4 m | rising dune | — | soft boundary |
| Arch wall | 18.0 m | 24 horseshoe arches | — | enclosure |

Sand is 424.1 ÷ (351.9 + 424.1) = 54.7 % of the floor out to r = 16 m: the paving is an island, and retreat should feel like leaving it.

- **Arches:** 24 at 15° steps (arc spacing 2π·18 ÷ 24 = 4.71 m), aperture 3.2 m, pier 1.5 m, 5.6 m tall, half-buried (2.8 m showing). The arch at az 0°, the Mihrab Arch «قَوْسُ المِحْرَابِ», is unburied, holds a muqarnas niche and the **pilgrim's lamp**, the only warm light after dusk. When the wind rises, each aperture whistles one scale degree of D Phrygian dominant (P4, §3.2.7).
- **Palms:** six petrified date palms, trunk 9.0 m, collider radius 0.45 m, at r = 13.5 m, az 30°, 90° … 330°.
- **Spawn / Penitent's Fall respawn:** r = 8.0 m, az 180°, facing N: 5.0 m from the pit edge and 3.0 m from the sand, i.e. 3.0 ÷ (5.0 ÷ 60) = 36 f of backing up before the penalty. Dead ahead on the pit kerb (r = 3.0 m, az 180°) is the **Vow Plate**, the brass tablet of Module 1 Part 2.
- **Narthex:** the West Landing (V3, §3.1.5) is Module 0 §0.3's stair landing. The first-visit Training Post stands on it (r = 9.0 m, az 270°) and sinks at **Enter the Cistern**, when the student is set down at the spawn.
- **Emergence Annulus:** the Sentinel's collar (body radius 1.6 m) rises only where its body stays on paving: r ∈ [3.0 + 1.6, 11.0 − 1.6] = [4.6, 9.4] m, via 12 underground Surfacing Anchors at r = 7.0 m, 30° apart (chord 2 × 7.0 × sin 15° = 3.62 m). An anchor is skipped while a prop or the player is closer than 3.0 m, which retires the four at az 0°, 150°, 180° and 210° (stump, columns, spawn) and leaves eight. Only the PGC furrow and the SB ring cross the sand.

#### 3.1.2 Top-down map

```
                    N
               A    M    A
           A  ,,,,,,,,,,,,,  A
          ,,,...............,,,
       A,,...P.............P...,,A
    A ,,........:::::::::........,, A
     ,,......:::::::n:::::::......,,
    ,,.....:::::::::::::::::::.....,,
   A,.....:::::::::::::::::::::.....,A
   ,,.....D:::::::#####:::::::D.....,,
  A,,.P...HT::::::#####:::::::H...P.,,A
   ,,.....::::::::#####::::::::.....,,
   A,.....::::::::::v::::::::::.....,A
    ,,.....::::::c:::::c::::::.....,,
     ,,......:::::::S:::::::......,,A
    A ,,........:::::::::........,,
       A,,...P.............P...,,A
          ,,,...............,,,
           A  ,,,,,,,,,,,,,  A
               A    A    A
   +---------+  = 10 m   (1 column = 1 m E-W, 1 row = 2 m N-S)
```

`#` pit · `:` flagstone · `.` deep sand · `,` bank · `A` arch · `M` Mihrab Arch · `P` palm · `H` stair landing · `D` drum · `n` North Stump · `c` fallen column · `S` spawn · `v` Vow Plate · `T` Training Post (Narthex, first visit only).

#### 3.1.3 Boundary: sand-slope, not wall

From r = 16.0 m the bank's slope grows linearly from 0° to 45° at r = 17.4 m. The controller's 30° limit is reached at 16.0 + (30 ÷ 45) × 1.4 = 16.93 m, so terrain stops the player, who slides along the contour with sand hiss underfoot. A hidden backstop at r = 17.4 m is glitch insurance only. No tell is placed outside r = 16 m.

#### 3.1.4 Ground surface mechanics

| Property | Flagstones | Deep sand (r ≥ 11.0 m) |
|---|---|---|
| Walk and strafe | 5.0 m/s (0.0833 m/f) | 3.75 m/s (0.0625 m/f): the 25 % penalty |
| Dash | 3.2 m / 14 f (0.229 m/f) | ×0.75 = 2.4 m / 14 f (0.171 m/f); i-frames f2–f13, lockout 36 f, Breath 20 unchanged |
| Jump | unchanged | unchanged (sand takes distance, never height) |
| Own footstep | dry click | extra 70 Hz thud (−12 dB) and a sand-ring decal |

The penalty ramps over 6 f after crossing r = 11.0 m, marked by a 0.15 m kerb of broken flags. Modifiers multiply: sand × DSR sand-drag = 5.0 × 0.75 × 0.70 = 2.625 m/s (−47.5 %).

**Noise rule (the Sentinel hears footsteps).** Tracked telegraphs (VGL ring to f100, SB ring to f96, PGC furrow bearing to f60) follow the player delayed by `aimLagFrames`:

| Player state | aimLagFrames |
|---|---|
| Still on flagstones | 24 |
| Moving on flagstones | 12 (1.0 m trail at 0.0833 m/f) |
| Moving or dashing on sand | 0: perfect tracking |
| Airborne | last grounded position held; a landing on sand is a noise event |

Against VGL's 2.2 m ring, a flagstone dash gains 3.2 m plus up to 1.0 m of lag; a sand dash gains 2.4 m with no lag, a 0.2 m margin (the margin PGC's 2.2 m safe line also leaves). Against SB's 2.4 m ring it ends exactly on the rim, so the i-frame answer matters: i-frames `[D+2, D+13]` must cover Active f120–f127, so D ∈ [114, 118] (5 f).

#### 3.1.5 Verticality

The controller steps up 0.4 m, so 0.30 m stair treads are walked; the jump apex of 1.1 m clears any ledge up to 1.0 m with 0.1 m spare.

| ID | Element | Position | Top | Eye on top | Access |
|---|---|---|---|---|---|
| V1 | East Landing | r 10.0, az 90° | 1.2 m (4 × 0.30) | 2.85 m | walk |
| V2 | East Drum | r 10.5, az 75° | 2.1 m | 3.75 m | jump from V1 (rise 0.9 m) |
| V3 / V4 | West Landing / Drum | mirror (az 270° / 285°) | 1.2 / 2.1 m | 2.85 / 3.75 m | as V1 / V2 |
| V5 | North Stump | r 7.5, az 0° | 0.9 m | 2.55 m | jump from floor |
| — | Fallen columns | r 6.5, az 150° / 210° | 1.0 m | — | jump over |

What each height lets the student read (rearing eyes at 4.6 m, camera 1.65 m, Δ = 2.95 m):

- **Floor.** The eyes leave the frame inside 2.95 ÷ 0.5625 = 5.24 m (3.7 m at FOV 110°, 7.5 m at 70°); at 4 m they sit 36.4° up, so VGL's ember eyes need a pitch-up. The VGL ring (radius 2.2 m) is below the frame, since the nearest visible ground is 1.65 ÷ 0.5625 = 2.93 m ahead: the dash decision is made on eyes and drone, and the ring is a confirming glance down.
- **Landing (1.2 m).** Eyes 23.6° up at 4 m, in frame at level pitch; the PGC furrow at 14 m reads at 11.5° depression instead of 6.7°. The best side-on view of SMS and DSR.
- **Drum (2.1 m).** Eyes 12.0° up at 4 m, in frame beyond 0.85 ÷ 0.5625 = 1.5 m; furrow at 15.0°; the raked sun makes the DSR crescent obvious.

**Perch rule: reading, not hiding.** Scenery is never cover or immunity: attack volumes over a perch footprint extend to full height, and a perch gives way 180 f (3.0 s) after landing (18 f crumble, S1 Tick, harmless drop, a 0.4 m stump until the cycle ends). Three seconds reads one telegraph; it does not camp.

#### 3.1.6 Sight-lines

- **Approach:** spawn → pit → Mihrab Arch, 8 + 18 = 26 m; only the 0.9 m stump lies on it, below eye height. From spawn the pit-centre head sits at atan(2.95 ÷ 8) = 20.2°, inside the 29.4° half-FOV.
- **Cross:** East Landing ↔ West Landing, 20 m, clear; bleached chitin `#e8dcc0` reads against palm brown and arch shadow.

#### 3.1.7 Lighting, time of day, Phase II storm

Late afternoon. The sun (`#e0a860`) sits at az 250°, raking from the left-rear of a player facing N to relieve the DSR ridge and PGC furrow. At 22° a 9 m palm would throw 9 ÷ tan 22° = 22.3 m, far enough to stripe the paving and hide the furrow, so shadow reception is off inside r = 11 m and the palms shade only the sand. The sun drops 3° per broken Seal while the lamp brightens:

| Seals broken | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Sun elevation | 22° | 19° | 16° | 13° | 10° | 7° | 4° |

Ambient never falls below 35 % of its opening level; every tell is emissive ≥ 1.0, independent of the sun.

**Phase II dust storm** (3rd correct answer; builds over 180 f in PhaseShift): a counter-clockwise sand wall circles the arches at 15°/s (24 s a lap), density 0 inside r = 12 m rising to 1 at r = 18 m, so the paving stays a calm eye. The screen-edge mask (vignette 0.55, ~70 % peripheral view) is Module 4 §3's; the swirl spends ≤ 1,200 of the 4,000 particles. The storm is dressing; the mask is the mechanic. Audio is never masked (§3.2.7).

#### 3.1.8 Collision and navigation

- Capsule radius 0.4 m, height 1.8 m. Dash is a swept capsule (0.229 m/f) that stops at any collider without penalty.
- World colliders: pit kerb, palm trunks, arch piers, drums, landings, columns, bank, and the standing collar (1.6 m-radius cylinder). Attack volumes use their own layer and ignore the world.
- No navmesh: the Sentinel follows authored splines between Surfacing Anchors. Static scenery ≤ 20 draw calls (instanced arches and palms), leaving ≥ 130 of 150.

### 3.2 Spatial Audio and Rhythm

#### 3.2.1 Music architecture

D Phrygian dominant (D E♭ F♯ G A B♭ C), 60 BPM, 4/4. Harmony rocks D major ↔ E♭ major; melody falls through the tetrachord D–C–B♭–A, with the augmented second E♭→F♯ as the wail. Stems are 8-measure loops (32 s) started on one `AudioContext` time. **The audio clock is master:** the Verse Director snaps its measure counter to `round((ctx.currentTime − t0) × 60)` at each downbeat (correction ≤ 2 f, spread over 60 f). Time dilation never moves the music clock: at the trigger the metronome layers stop and the stems crossfade to the Contemplation bed (Module 5 §5.2.4), the clock keeps counting silently, and the first verse after the restore starts on the next downbeat.

| Stem | Spatial | Phase I: The Steady Litany | Phase II: The Desecrated Meter | Burrow / Question |
|---|---|---|---|---|
| Oud drone | at the pit, HRTF, ref 6 m, rolloff 0.3 (≥ −6 dB across the arena): a compass for the ear | D2 73.42 Hz + A2 110 Hz, swell every 2 measures | adds E♭2 77.78 Hz; the 4.36 Hz beat is the "grind" | drone plus the C13 rumble bed |
| Cajón | head-locked | bass tone ~95 Hz on beats 1, 3; slap on 2, 4 (low-passed 2.0 kHz, clear of the 2.6 kHz ting): f0, 60, 120, 180 | unchanged straight quarters | bass tone only, −8 dB: a heartbeat |
| Nylon guitar | head-locked, narrow | sparse falseta in measures 2, 4 of each loop; silent ±6 f around any P1 cue | rasgueado 3+3+2, accents on eighths 1, 4, 7 = f0, f90, f180; muted ghost strum f210 | silent; one harmonic per measure |

In Phase II the first impact (f90) shares a guitar accent, the second (f210) lands on a ghost strum one eighth after the last accent. The cajón says 1-2-3-4, the guitar says 3+3+2, and neither is the clock; the chain is (§3.2.4). Execution's F♯ resolution belongs to Module 6. Ambience (`amb`): low wind, the arch whistles, a dry creak at each palm (ref 4 m).

#### 3.2.2 Positional Sound Cue table

Azimuth is relative to camera forward (+ right); stereo fallback pan = sin(az) × 0.85. Frames are T0-relative unless stated. P1 uses the `inverse` model, ref 3 m, rolloff 0.35 (loss at 30 m = 3 ÷ (3 + 0.35 × 27) = 0.241 = −12.4 dB); other priorities ref 2 m, rolloff 0.7. Phase II repeat events (VGL Echo Slam, DSR Twin Ridge, SB Twin Breach) re-fire C04 and C06–C08 at the second event; they add no cue IDs.

| ID | Cue | Attack | Frame | Azimuth / pan | Distance | Filter | Pri |
|---|---|---|---|---|---|---|---|
| C01 | True chain-click: link strike + 140 ms rattle; beat 1 double-taps | all (Phase II: §3.2.4 lattice) | f0, then every 60 f | at the bit, biased to SMS origin side | 3–8 m | HP 800 Hz | P1 |
| C02 | Bit ting 2.6 kHz | SMS | f36 (gleam f36–f48) | at the bit | 3–8 m | band 2.2–3.2 kHz | P1 |
| C03 | Furrow rasp, emitter rides the furrow head | PGC | f0–f60 | along the furrow | 14 → 3 m | LP 3 kHz | P1 |
| C04 | Seal stamp: 180 Hz thud + 1.2 kHz tick | PGC f60, VGL f100, SB f96 | as listed | at the locked point | 0–14 m | none | P1 |
| C05 | Gullet rush | PGC | f85–f120 | down the furrow axis, converging to 0° | 14 → 0 m | LP opens 0.8 → 8 kHz | P1 |
| C06 | Ember drone, glide D2 → D3 (73.4 → 146.8 Hz) | VGL | f48–f120 | at the eyes, elevation +23° to +36° | 4–7 m | LP 1.2 kHz | P1 |
| C07 | Chain scrape, 400 → 1,600 Hz exponential | DSR | f24–f60 | along the ridge, elevation −10° → −29° | 9 → 3 m | band 0.3–2 kHz | P1 |
| C08 | Sub-bass rumble 38 Hz | SB | f0–f96 | §3.2.3 | 12 → 0 m | grit LP 0.3 → 1.4 kHz | P1 |
| C09 | False click: dry, no rattle, pitch −12 % | SMS feint f40; PCL f0 | as listed | at the bit; PCL high ±55°, elevation +35° | 3–8 m | HP 800 Hz | P1 |
| C10 | Release creak, 8 f, 1.1 kHz | feints | stall release | at the bit | 3–8 m | band 0.9–1.3 kHz | P1 |
| C11 | Tail whoosh | TR | f0 → impact f12 | ±120° sweeping to 0° | 8 → 0.5 m | none | P1 |
| C12 | Impacts, geyser flutter, parry clash | all | Impact | at the strike; clash head-locked | 0.5–6 m | full band | P2 |
| C13 | Burrow bed: looped 38 Hz + 76 Hz + grit | Burrow | W0 → dilation trigger (Module 5 §5.1.3) | the W0 facing, where the funnel opens; centred by R48 | 9 → 2.2 m | grit LP 0.3 kHz | P4 |

C07 check: the DSR jump window f35–f52 maps to 400 × 4^((35−24)/36) = 611 Hz up to 400 × 4^((52−24)/36) = 1,176 Hz. Teaching line: "jump while the scrape climbs from bell to open string."

#### 3.2.3 The 38 Hz rumble: which way will it burst

38 Hz is below practical localisation (< ~80 Hz) and below laptop-speaker reproduction, so the cue has three layers: the 38 Hz sine (chest, subwoofer), a 76 Hz harmonic (−10 dB), and a 140–400 Hz "sand shear" grit (−6 dB) that carries direction. Frequency stays 38 Hz; level climbs −30 → −12 dBFS over f0–f96.

The emitter is the Sentinel's buried head. At f0 it sits on the **approach bearing**, the side the body will come from; it then travels under the sand to the tracked breach point, azimuth sweeping to the ring and elevation going −10° → −80°. At f54 (ring appears) it is ~6 m away; at f96 (stamp) it is under the boots and the sound collapses to centre. Learned rule: *it starts where it comes from and ends where you stand; when it is under you, leave.* **Twin Breach** puts one emitter at each ring centre, 3 m apart (Module 4 §3), the second with its 76 Hz layer detuned +25 cents so they do not cancel in mono. Redundancy: sand jitter at the emitter's ground position (f0–f54), gamepad dual-rumble weighted by pan, and the Bearing Wedge (§3.2.6).

#### 3.2.4 Chain-click rhythm: the parry clock

Phase I SMS: click f0, ting f36, click f60 = Impact. The parry window f50–f59 means pressing 166.7 to 16.7 ms before the second click; Perfect (f56–f59) is 66.7 to 16.7 ms before it. Untrained tappers lead a beat by roughly 20–60 ms (negative mean asynchrony), so *tapping on the click* lands in the Perfect band. With the Relic the window is 14 f (233 ms, f46–f59).

**Phase II lattice.** Clicks move to the upbeats: a 60 f grid offset by 30 f, while the cajón stays on the beat. For an SMS pair with impacts at verse f90 and f210 (T0 = impact − wind-up):

| Variant | Attack 1: T0 / false / creak / impact | Attack 2: T0 / false / creak / impact | Parry · Perfect, attack 1 |
|---|---|---|---|
| Plain | 30 / — / — / 90 | 150 / — / — / 210 | f80–89 · f86–89 |
| Feint 18 f | 12 / 52 / 70 / 90 | 132 / 172 / 190 / 210 | f80–89 · f86–89 |
| Feint 24 f (cycles 5–6) | 6 / 46 / 70 / 90 | 126 / 166 / 190 / 210 | f80–89 · f86–89 |

(Feint 18: false click T0+40, creak T0+58, impact T0+78. Feint 24: T0+40, T0+64, T0+84.) Attack 2 windows are +120 f. The true window never moves; only what precedes it changes. The creak sounds 20 f (333 ms) before impact, 10 f before the window opens: reacting to it (~10–12 f) lands inside the window but outside Perfect, which needs anticipation. A student who counts clicks in the original f50–f59 slot eats the 24 f whiff; the false click's missing rattle is the audible giveaway. Chastened SMS clicks at T0 and T0+90; Quickened at T0 and T0+48. PCL announces itself with a false click at T0; its feint timings are Module 4 §3's, and C10 fires at stall release.

#### 3.2.5 Web Audio implementation sketch

```ts
const ctx = new AudioContext({ latencyHint: 'interactive' });
const master = new DynamicsCompressorNode(ctx, { threshold: -6, ratio: 20, attack: 0.003 });
const bus: Record<string, GainNode> = {};
for (const n of ['cue','sfx','vox','amb','mus']) { bus[n] = new GainNode(ctx); bus[n].connect(master); }
master.connect(ctx.destination);
// mus insert: HPF 60 Hz -> peaking 2.6 kHz (automated to -8 dB) -> bus.mus
// cistern reverb send (IR 1.8 s, -20 dB) + 105 ms slap (36 m / 343 m/s, -18 dB): sfx/amb/mus only, never cue
function playCue(def, frameAbs, pos) {
  const when = audioT0 + frameAbs / 60 - (ctx.outputLatency || ctx.baseLatency) + settings.syncOffset;
  const p = new PannerNode(ctx, { panningModel: settings.output === 'headphones' ? 'HRTF' : 'equalpower',
    distanceModel: 'inverse', refDistance: def.ref, rolloffFactor: def.rolloff, maxDistance: 40,
    positionX: pos.x, positionY: pos.y, positionZ: pos.z });
  const s = new AudioBufferSourceNode(ctx, { buffer: def.buf });
  s.connect(p).connect(bus[def.bus]); s.start(Math.max(when, ctx.currentTime));
  if (def.pri === 1) duck(when, def.len);        // pre-scheduled; no live sidechain
}  // per sim frame: update listener position/forward/up from the camera; re-aim moving emitters
```

Attacks are authored, so every cue is queued at T0, up to 120 f (2.0 s) ahead, and shifted back by `outputLatency` so the heard click and the visual contact coincide. **Buses (LUFS-S):** `cue` −16, `sfx` −20, `vox` −22, `amb` −30, `mus` −24 (−22 in Phase II). Target **−18 LUFS integrated**, true peak ≤ −1 dBTP; the C01 click peaks at −12 dBFS at the listener, the level Module 1's whisper ratio is measured against. **Ducking** under any P1: `mus` −9 dB, `vox` −12, `amb` −6, `sfx` −3; pre-scheduled to begin 5 ms before the cue, attack 5 ms, hold 80 ms, release 250 ms (the envelope Module 1's masking budget assumes). **Voices:** 32 maximum, 8 reserved for P1; steal lowest priority, then oldest.

#### 3.2.6 Fallbacks and the Beat Ring

An **Audio output** row in the Controls Card's settings gear offers Headphones / Speakers / Mono (default Speakers). HRTF is for headphones; Speakers use equal-power panning; Mono drops panning and relies on the Bearing Wedge and haptics, and P1 cues use no phase-dependent processing, so a mono sum keeps their timing.

The **Beat Ring** «حَلْقَةُ الإِيقَاعِ» is on by default only when Anees sound is muted or the context is suspended. It is a 2 px gold ring that contracts from 3.0° to 0.4° over 60 f (Module 2 §2.3.8), following the **chain-click lattice**, not the cajón, so it syncopates in Phase II. At 1080p and 90° horizontal FOV, r = 960 · tan θ px with θ = 3.0° − 2.6° × t ÷ 60, so it lands on the 0.4° reticle (6.7 px) at the click: the window opens at t = 50 (θ = 0.83°, 14.0 px), the Perfect notch sits at t = 56 (θ = 0.57°, 9.6 px). Four pips below count cajón beats 1–4. In a feint stall the ring freezes dashed and resumes solid at release (the visual twin of C10); it hides at the question trigger (Module 5 §5.2.4). Shape, never colour alone, encodes the defence: horizontal arc halves for Parry, top and bottom ticks for Dash, a bottom bar for Jump. The **Bearing Wedge**, a 30° arc on the ring's rim, points at the active cue's azimuth and turns with the view.

#### 3.2.7 Mix priority: gameplay cues always win

| Class | Contents | Rule |
|---|---|---|
| P1 | C01–C11 | never ducked, culled, occluded or reverb-sent; max 3 at once, nearest time-to-impact wins |
| P2 | C12 | loses at most 3 dB to P1 |
| P3 | whispers (Module 1) | −12 dB under P1; onsets on the & eighths, in the click-free half-beat |
| P4 | arch-wind whistles (round-robin scale degrees), storm bed, Burrow bed C13 | −6 dB under P1; whistles and storm band-limited 150–1,800 Hz so they never cover 2.6 kHz or the click band |
| P5 | music | −9 dB under P1; high-passed at 60 Hz (everything below belongs to cues); notch at 2.6 kHz |

The concussion tinnitus (2.8 kHz, Module 5) sits 200 Hz above the ting and is cut 12 dB under any P1 cue. **Acceptance:** each P1 cue ≥ 10 dB above its local masker in an offline render; no P1 cancellation in a mono sum; ≤ 1 f click-to-contact error on three reference devices; SMS parried in Phase I with sound off and the Beat Ring on.

---

## Module 4 — First-Person "Steady Strikes" Combat Architecture

> ضَرَبَاتٌ ثَابِتَةٌ — عِمَارَةُ القِتَالِ بِعَيْنِ التَّائِبِ

Module 4 is the combat contract of the fight. The Sentinel is a teacher with a metronome: each attack carries one lesson, each lesson lands on the beat, and melee never touches the Penance bar (Pillar 2, *The Blade Opens the Door, the Mind Walks Through It*). Combat moves Vigor, Breath and Posture only; the quiz moves the Seals. Every control below is shown on the Controls Card of *The Penitent's Rite* before the first combat frame, and its Training Post rehearses a slow SMS, DSR and VGL.

**Conventions.** 1 f = 16.667 ms (timescale 1.0). Windows are inclusive `[first, last]`, counted from T0 (first Telegraph frame) unless marked "cycle f"; Impact is the first Active frame. Visual and audio rigs belong to Module 2 and Module 3; this module fixes only the timing they obey.

### 4.1 First-Person Defence Mechanics

Three literacies, each with one telegraph code (Pillar 3, *Read, Don't Guess*).

| Literacy | Input | Taught by | Code | Phase I window |
|---|---|---|---|---|
| Timed Guard / Parry | RMB tap (LT) | SMS (PCL in Phase II) | bronze-gold, horizontal, 2.6 kHz ting | press f50–f59; Perfect f56–f59 |
| Directional Strafe-Dodge | Q / E (LB / RB) | PGC, VGL, SB | crimson, vertical/ring, low brass drone | PGC f60–f118; VGL f100–f118; SB f96–f118 |
| Jump Clearance | Space (A), look down | DSR | ochre, ground ridge, chain scrape | press f35–f52 |

#### 4.1.1 Timed Guard and Parry

A press on frame P opens **10 parry-active frames, P+1 to P+10** (the 6-f raise plays inside them). A strike with Impact I is parried when P+1 ≤ I ≤ P+10, so the press window is **[I−10, I−1]**. For SMS (I = 60) that is **f50–f59: 10 f, 167 ms**. The **Perfect Parry** is the last 4 f, [I−4, I−1] = **f56–f59** (67 ms): the strike lands in the first four active frames.

- **Parry:** strike negated, Sentinel recoils, Posture +15, camera S1 Tick (0.4°/6 f), spark fan on the viewmodel.
- **Perfect Parry:** Posture +25, 6 f (100 ms) hit-stop, camera S2 Thud (1.2°/12 f).
- **Block** (Guard still held after P+10): damage ×0.3 rounded, 15 Breath, no Posture, no lockout. Breath below 15 means *Guard Break*: 30 f (500 ms) stagger, full damage.
- **Relic** widens the window to 14 f ([I−14, I−1] = f46–f59, 233 ms), Perfect unchanged. **Mercy** adds 4 f. Bonuses add, capped at 18 f (f42–f59, 300 ms); Chastened sets a floor of 14 f.

```
frame             50        60        70
                  |         |         |
SMS           ..............!#######        ! Impact f60, # Active f60-67
press f49        Paaaaaaaaaarrrrrrrrrrrrrrr   MISS by 1 f (active f50-59)
press f50         Paaaaaaaaaarrrrrrrrrrrrrr   PARRY: Impact is the LAST active frame
press f56               Paaaaaaaaaarrrrrrrr   PERFECT
press f59                  Paaaaaaaaaarrrrr   PERFECT: Impact is the FIRST active frame
press f60                   Paaaaaaaaaarrrr   MISS by 1 f (active f61-70)
```
*P press, a parry-active, r whiff lockout.*

**Reaction budget.** The ting fires at f36. At the design reaction time of 250 ms (15 f) a prompted press lands at f51: inside the window, 5 f short of Perfect. Reflex earns +15; only the pulse earns +25 (Pillar 1, *The Metronome Is the Teacher*).

**Parry Cone.** At the Impact frame the reticle must be within **±25°** of the striking part (SMS: leading mandible edge; PCL: chain head). That is a ±1.40 m gate at 3 m (3 × tan 25°) and ±0.93 m at 2 m. The cone is a world angle, so FOV changes its look, not its function: it spans the central 47 % of screen width at FOV 90° (tan 25° ÷ tan 45° = 0.466), 67 % at 70°, 33 % at 110°. A press outside it is a whiff; the usual cause is still looking at the floor after a Jump.

**Guard cannot carry a student.** Guard applies only to *edge* strikes (SMS 18 → 5, PCL 14 → 4). PGC, DSR and SB ignore it (the earth moves under the shield); VGL is unblockable. A pure turtle takes 5 + 5 + 22 + 5 + 15 + 30 = **82 Vigor per cycle**, reaches cycle 2 with 100 − 82 + 20 = 38 and falls at V5 (38 − 5 − 5 − 22 − 5 − 15 = −14).

#### 4.1.2 Directional Strafe-Dodge

Dash (Q/E): 2 f startup, **i-frames f2–f13 (12 f, 200 ms)**, 3.2 m over f2–f15 (0.229 m/f), 36 f (600 ms) total lockout, 20 Breath. The last two travel frames are *not* invulnerable. A dash is clean when every Active frame is either inside the i-frames or the player's centre is already outside the hit shape. Shapes are centre-tested: PGC lethal half-width **2.2 m** (furrow half-width 1.5 m + body radius 0.7 m), VGL ring 2.2 m, SB ring 2.4 m.

- **Latest press = Impact − 2**, because the i-frames begin at D+2 and must be live on the first Active frame.
- **Earliest press = the shape's lock frame**, so the shape is fixed on the dash's start position.
- In between, the player clears the shape before the i-frames lapse: outside at the end of travel frame k when (k−1) × 0.229 ≥ r, so k = 11 for r = 2.2 m and k = 12 for r = 2.4 m, both before D+13.

| Attack | Shape | Lock | Press window | Length |
|---|---|---|---|---|
| SMS | 140° arc (i-frames only: D+2 ≤ 60, D+13 ≥ 67) | none | f54–f58 | 5 f / 83 ms |
| PGC | line, lethal half-width 2.2 m | f60 | f60–f118 | 59 f / 983 ms |
| VGL | ring r 2.2 m | f100 | f100–f118 | 19 f / 317 ms |
| SB | ring r 2.4 m | f96 | f96–f118 | 23 f / 383 ms |

```
frame             100       110       120       130       140
                  |         |         |         |         |
VGL ring          L                   ##########           L lock f100, # Active f120-129
dash f100         Dsiiiiiiiiiiiitt                         earliest: clear of the ring by f111
dash f118                           Dsiiiiiiiiiiiitt       latest: i-frames f120-131 cover all Active
dash f119                            Dsiiiiiiiiiiiitt      TOO LATE: f120 exposed, 30 dmg
```
*D press, s startup, i i-frames, t vulnerable travel.*

PGC is also walkable: 60 f after the lock × 5.0 m/s ÷ 60 = 5.0 m ≥ 2.2 m. That grace is deliberate; in Phase II, 48 f gives 4.0 m. The Breach is not walkable late. A ring tracking at 3.0 m/s loses (5.0 − 3.0) ÷ 60 = 0.033 m/f to a runner. After the lock (f96), 24 f of running adds 24 × 0.083 = 2.0 m, 0.4 m short of 2.4 m. The deficit takes 0.4 ÷ 0.033 = 12 f of pre-lock running, so the run must begin by **f84** (96 − 12); after that only the dash saves the student.

**Deep sand.** The dash shrinks to 3.2 × 0.75 = 2.4 m: slack over the 2.2 m shapes falls from 1.0 m to 0.2 m, and the 2.4 m Breach ring has none. The Breach window fragments into f96–f105 and f114–f118 (15 of 23 f) around a dead gap f106–f113, where the i-frames lapse inside the ring (Module 3 owns the arena penalty).

#### 4.1.3 Jump Clearance

Feet are above 0.6 m from jump-frame 8 to 36 (bible: apex 1.1 m, air time 44 f, buffer 6 f); the DSR ridge is 0.55 m. A press at P covers absolute frames [P+8, P+36]. To cover every Active frame f60–f71 we need P+8 ≤ 60 and P+36 ≥ 71, so **P ∈ [35, 52]: 18 f, 300 ms**.

```
frame         40        50        60        70        80        90
              |         |         |         |         |         |
ridge                             RRRRRRRRRRRR                    R Active f60-71
jump f35      uuu^^^^^^^^^^^^^^^^^^^^^^^^^^^^^dddddddd            earliest: above 0.6 m f43-71
jump f52                  Juuuuuuu^^^^^^^^^^^^^^^^^^^^^^^^^^^^^dddd  latest: f60-88
jump f34      uu^^^^^^^^^^^^^^^^^^^^^^^^^^^^^dddddddd            TOO EARLY: f71 exposed
jump f53                   Juuuuuuu^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ddd TOO LATE: f60 exposed
```
*J press, u rising, ^ above 0.6 m, d falling.*

The crescent slump is visible from f24 only by looking down (free, pitch ±85°); the window opens 11 f (183 ms) later: *after the and of one (f30), before the two (f60)*. Twin Ridge is in 4.2.

#### 4.1.4 Input Buffering and Whiff Penalties

**Buffers.** Jump 6 f (100 ms, bible), which also fires on landing for Twin Ridge. Dash and Slash 4 f (67 ms), firing on the first free frame; the chain link window stays 8 f. Parry 2 f (33 ms), only across Slash or Dash recovery and **never across a whiff lockout**, which would erase the lesson.

| Failure | Cost |
|---|---|
| Parry whiff (early, late, outside cone) | 10 active + **24 f (400 ms)** lockout = 34 f (567 ms) with no Guard, Dash, Jump or Slash |
| Dead zone, SMS press f25–f49 | the lockout outlasts f59, the last legal press: full 18 damage. A press at f24 or earlier is recoverable (free at f59, re-press = Perfect) |
| Mistimed Dash | 20 Breath spent, 36 f lockout, damage wherever i-frames lapsed |
| Mistimed Jump | ridge hits: 15 plus −30 % move for 60 f; the 44-f arc cannot be cancelled |

#### 4.1.5 Teaching Order and Cycle 1

| Cycle 1 verse | Lesson | Scaffold |
|---|---|---|
| V1 SMS-L | Parry, left | **"Parry now" flash** |
| V2 SMS-R | Parry, mirrored cone | **"Parry now" flash** |
| V3 PGC | Strafe: the furrow stops sliding at f60 | low brass note at the lock; walkable |
| V4 SMS-L | Parry retention | none (the test) |
| V5 DSR | Jump, look down | crescent slump, chain scrape |
| V6 VGL | Dash by i-frames; Guard fails | ember eyes, ring |

The order is the bible's verse order, ranked by forgiveness: Parry is the safest and feeds the Posture engine; the strafe is walkable; the Jump needs the student to look down; the Dash needs i-frames and meets an unblockable 30. Failure is the lesson (Pillar 5): first exposure costs Vigor, not the attempt.

**The flash.** In V1 and V2 only, at the SMS ting (f36) a gold ring 3× reticle radius contracts onto the reticle by f50 (14 f), the reticle fills gold over f50–f59 (the normal window, not the Perfect), and the label *Parry now* / «صُدَّ الآنَ» holds f36–f66.

> صُدَّ الآنَ

It is suppressed in V4, in every later cycle, and on later attempts once a Parry has landed on this boss. Perfect is discovered, never prompted.

### 4.2 The Attack Table

Phase I figures at 60 FPS (f × 16.667 = ms); damage is to Vigor. A6 is Phase II only and keeps its canonical row. Camera presets: S1 0.4°/6 f, S2 1.2°/12 f, S3 3.0°/24 f, S4 4.5°/36 f + ±5° roll, S5 6.0°/45 f + 10° roll.

| Attack Name | Wind-up / Telegraph (frames/ms, audio cue, visual posture shift facing the camera) | Impact Hitbox & Camera Movement (camera tilt, directional shake, active damage frames) | Recovery Window (frames neck exposed) | Counterplay (Parriable / Dash-Dodge / Jump Required) |
|---|---|---|---|---|
| **A1 `SMS` Serrated Mandible Sweep**<br><span dir="rtl" lang="ar">كَنْسَةُ الفَكِّ المُسَنَّنِ</span> | **60 f / 1000 ms.** Chain-click f0, f60. Head drops to 1.7 m and cocks 35° toward the origin side (L/R); jaw hinge opens 20°; the mandible's flat turns square to the camera. Bronze gleam on the bridle bit f36–f48 (600–800 ms), 2.6 kHz **ting** at f36. | Arc 140°, 1.2–3.4 m from the player, height 0.4–2.0 m. **Active f60–f67 (8 f / 133 ms)**, 18 dmg (Guard 5). Camera S2 Thud as a 1.2° yaw kick along the sweep (L→R or R→L). | **54 f / 900 ms** (f68–f121) if hit, blocked or dodged; **90 f / 1500 ms** (f68–f157) if parried. | **Parriable:** f50–f59, Perfect f56–f59. Block ok. Dash ok by i-frames only: f54–f58. |
| **A2 `PGC` Piercing Gullet Charge**<br><span dir="rtl" lang="ar">انْقِضَاضُ الحَلْقِ الثَّاقِبِ</span> | **120 f / 2000 ms.** From ≈14 m the worm sinks; a 3.0 m crimson-edged furrow draws toward the player and **locks f60** (1000 ms) with a low brass stab; it surfaces f85 (1417 ms) and rushes 14 m over 35 f (583 ms), the 3.6 m gullet square to the camera, growing to fill the view. | Line, lethal half-width 2.2 m. Erupts at the lock point, **Active f120–f143 (24 f / 400 ms)**, 22 dmg, Guard ignored. Camera S3 Slam as a 3.0° pitch-up; near miss S1 Tick. | **72 f / 1200 ms** (f144–f215). Worm ends upright 1.2 m past the lock point; neck in reach. | **Dash-Dodge:** f60–f118 (or walk out). |
| **A3 `VGL` Vertical Guillotine Lunge**<br><span dir="rtl" lang="ar">هَوِيُّ المِقْصَلَةِ</span> | **120 f / 2000 ms.** Head rears to 4.6 m over f0–f60 and hangs over the camera, underjaw to the lens. **Ember eyes ignite f48** (800 ms) with a rising low brass drone; red 2.2 m ring appears f72 (1200 ms), follows the player, **locks f100** (1667 ms). | Slam f120, ring r 2.2 m, **Active f120–f129 (10 f / 167 ms)**, 30 dmg + 30 f (500 ms) knockdown; Guard and Parry fail ("the blade skids"). Camera S3 Slam, 3.0° pitch-down, eye height drops for the knockdown. | **96 f / 1600 ms** (f130–f225). Head lodged in the flagstones 3 m ahead; nape exposed. | **Dash-Dodge only:** f100–f118. |
| **A4 `DSR` Dune Scythe Ripple**<br><span dir="rtl" lang="ar">تَمَوُّجُ مِنْجَلِ الكَثِيبِ</span> | **60 f / 1000 ms.** The head dips below the dune line and the Sentinel leaves the eyeline. Crescent slump visible **from f24** (400 ms) by looking down; rising chain **scrape**. | Ridge 0.55 m high, 7 m arc, crosses the player **f60–f71 (12 f / 200 ms)**: 15 dmg + −30 % move for 60 f (1000 ms). Camera S2 Thud with ±1.2° roll; cleared, S1 Tick. | **72 f / 1200 ms** (f72–f143). | **Jump Required** (look down): press f35–f52. |
| **A5 `SB` Subterranean Breach**<br><span dir="rtl" lang="ar">الاِنْبِثَاقُ مِنَ الجَوْفِ</span> | **120 f / 2000 ms.** Last coil sinks; no head to read. **38 Hz rumble at f0** panned to the eruption azimuth. At f54 (900 ms) a 2.4 m dust-geyser ring with golden prayer paper forms under the player, tracks to f96 (1600 ms), locks. | Erupts f120, ring r 2.4 m, **Active f120–f127 (8 f / 133 ms)**, 20 dmg. Camera S4 Breach, pitch-up. | **60 f / 1000 ms** (f128–f187). | **Dash-Dodge:** f96–f118, or run out (start by f84). |
| **A6 `PCL` Penitent's Chain Lash** (Phase II only)<br><span dir="rtl" lang="ar">سَوْطُ السِّلْسِلَةِ</span> | **54 f / 900 ms.** Bridle chains hoist high-left or high-right; head turns 25° away so the chain head arcs at the lens. Tell: **false chain-click at f20** (333 ms). | Diagonal whip, **Active f54–f59 (6 f / 100 ms)**, 14 dmg (Guard 4). Camera S2 Thud, yaw and roll 1.2° toward the origin side. | **48 f / 800 ms** (f60–f107). | **Parriable:** f44–f53, Perfect f50–f53; cone ±25° on the chain head. |
| **P1 `TR` Tail Reprisal**<br><span dir="rtl" lang="ar">قِصَاصُ الذَّنَبِ</span> | **12 f / 200 ms** after the time snap (≤ 3 f / 50 ms). Coiled tail rises behind the head; sub-bass thud; 2.8 kHz tinnitus begins. | **Active 6 f / 100 ms**, 30 dmg (leaves ≥ 1 Vigor if the run still passes). Camera S5 Reprisal. 240 f (4 s) concussion: blur 6 px, double-vision 8 px. | none; Posture → 0 (Module 5) | **None (scripted).** |

#### Phase II variants and feints

A *trap zone* is the set of presses that leave the player locked out at Impact: [I−35, I−11], 25 f (417 ms) = 24 f lockout + 1 f.

| Variant | Delta | Timeline (f / ms) | Windows | Read it by |
|---|---|---|---|---|
| `SMS` Feint-18 | stall 18 f at f40 | ting f36; freeze f40–f57 (300 ms); resume f58; Impact **f78** (1300 ms); Active f78–f85; neck f86–f139 | true f68–f77, Perfect f74–f77; trap f43–f67, which contains the old f50–f59 | gleam stays lit, false click at f40; resume f58 + 15 f = f73, inside |
| `SMS` Feint-24 (cycles 5–6) | stall 24 f | freeze f40–f63 (400 ms); resume f64; Impact **f84** (1400 ms); neck f92–f145 | true f74–f83, Perfect f80–f83; trap f49–f73 | resume f64 + 15 = f79, inside |
| `PCL` Feint-18 / Feint-24 | stall at f40 | Impact **f72** (1200 ms) / **f78** (1300 ms); neck f78–f125 / f84–f131 | true f62–f71, Perfect f68–f71 / true f68–f77, Perfect f74–f77; trap f37–f61 / f43–f67 | resume f58 + 15 = f73 misses the 18-f window: read by the pulse alone (open item, knob in 4.7) |
| `PGC` | wind-up 96 f (1600 ms) | lock f48 (800 ms); rush f61–f96; Active f96–f119; neck f120–f191 | dash f48–f94 (47 f / 783 ms) | walk-out 4.0 m |
| `VGL` + **Echo Slam** | wind-up 96 f; lock f84 | Impact f96, Active f96–f105; Echo ring seeds on the landing zone at f96, locks f120; Echo Impact **f132** (+36 f / 600 ms), Active f132–f141; neck f142–f237 | dash 1 f84–f94 (11 f); dash 2 f120–f130 | lockout 36 f, so D2 = D1 + 36 ∈ [120, 130] for every legal D1; 40 Breath |
| `DSR` **Twin Ridge** | second ridge +42 f (700 ms) | Active f60–f71 and **f102–f113**; neck f114–f185 | jump 1 f35–f50 (16 f / 267 ms), jump 2 f77–f94 | landing P1 + 44 ∈ [79, 94] must re-jump by f94 (P2 + 8 ≤ 102), cutting jump 1 from f35–f52 |
| `SB` **Twin Breach** | two rings 3.0 m apart | both appear f54, track to f96, erupt f120 | dash f96–f118, **away** from the second ring | toward it ends 3.2 − 3.0 = 0.2 m past its centre: inside |

### 4.3 Posture Economy

Posture fills from Parry +15, Perfect +25, neck Slash +6, neck Thrust +14 and decays 4/s after 3 s idle: a gap of g frames costs max(0, g − 180) × 4 ÷ 60. **To fill 100:** 4 Perfect Parries, or 7 Parries (105), or 17 Slashes (16.7), or 8 Thrusts (7.1). Hits that fit in a neck window of W frames, chaining Slashes at 28 f (10 + 6 + 12) with the first hit at +10: floor((W − 11) ÷ 28) + 1. So W = 90 gives 3, W = 54 gives 2, W = 72 gives 3.

Tiers (Cycle 1, Phase I, Posture starts at 0, V1 at frame 0):

| Tier | Behaviour | Parries | Riposte hits | Result |
|---|---|---|---|---|
| Novice | Blocks SMS, one Slash after each, no heavy riposte | 0 | 3 | Posture peaks at 8; **Burrow at f1440 (24.0 s)** |
| Steady | Parries V1, V2, Perfect V4; two Slashes after each; two hits per heavy | 3 (1 Perfect) | 10 | **Break at f1098 (18.3 s)** |
| Adept | Perfect on every SMS; three Slashes; Thrust + Slash per heavy | 3 (3 Perfect) | 8 | **Break at f780 (13.0 s)** |

**Steady ledger.**

| Frame (s) | Event | Decay | Posture |
|---|---|---|---|
| 60, 78, 106 | Parry, 2 Slashes (V1) | none | 27.0 |
| 300, 318, 346 | Parry, 2 Slashes (V2) | −0.9 (gap 194 f, 14 f past grace) | 53.1 |
| 643, 671 | 2 Slashes after PGC | −7.8 (gap 297 f, 117 f past) | 57.3 |
| 780, 798, 826 | **Perfect** (+25), 2 Slashes (V4) | none (gap 109) | 94.3 |
| 1070 | Slash after DSR | −4.3 (gap 244 f, 64 f past) | 96.0 |
| 1098 (18.3 s) | Slash | none | 102 → **Break** |

Check: gains 55 + 60 = 115, decay 13.0, net 102. **Adept:** 43 after V1 (25 + 18), 86 after V2, 79.7 after decay (−6.3, gap 275 f), 99.7 after Thrust and Slash, then the Perfect on V4 at f780 overflows to 124.7: Break at 13.0 s.

**Carry-over.** A correct answer sets Posture to 45 and queues two Chastened SMS (4.6) at cycle f120 and f360. Adept: 45 + 25 + 18 = 88 at f194, then a Perfect at f360 gives 113: Break at **6.0 s**. Steady: 98.1 at f406, 94.3 after decay at f643, +6 = Break at **10.7 s**. Skill shortens each cycle, never the quiz count: one question per cycle.

### 4.4 Verse Schedule

#### Phase I cycle (The Steady Litany, «الوِرْدُ الثَّابِتُ»)

One cycle = 6 × 240 f = 1440 f = 24.000 s. Chain-clicks sound on every beat from T0 to Impact, so the last click is the strike.

| Verse | Attack | Side | Start (cycle f / s) | Impact (f / s, beat) | Neck open (f) | End |
|---|---|---|---|---|---|---|
| V1 | SMS | L | 0 / 0.0 | 60 / 1.0 (2) | 68–121 (to 157 if parried) | 239 |
| V2 | SMS | R | 240 / 4.0 | 300 / 5.0 (2) | 308–361 (to 397) | 479 |
| V3 | PGC | axial | 480 / 8.0 | 600 / 10.0 (3) | 624–695 | 719 |
| V4 | SMS | L | 720 / 12.0 | 780 / 13.0 (2) | 788–841 (to 877) | 959 |
| V5 | DSR | arc | 960 / 16.0 | 1020 / 17.0 (2) | 1032–1103 | 1199 |
| V6 | VGL | overhead | 1200 / 20.0 | 1320 / 22.0 (3) | 1330–1425 | 1439 |

Cycle 2+ may swap V3 and V5: DSR in V3 (start 480, Impact 540, neck 552–623) and PGC in V5 (start 960, Impact 1080, neck 1104–1175). An undefended student takes 18 + 18 + 22 + 18 + 15 = 91 by V5 and falls at VGL, f1320 (22.0 s).

```
f       0           60          120         180         240
grid    |     +     |     +     |     +     |     +     |      | beat, + eighth
cajon   X           X           X           X
chain   C           C                                           click f0, f60 = Impact
tell           Tggg                                             ting f36, gleam f36-48
window            pPP                                           parry f50-59, Perfect f56-59
active              ##                                          f60-67
neck                  nnnnnnnnnnn                               f68-121
parried                         ++++++++                        to f157
```
*One column = 5 f (83 ms).*

#### Phase II cycle (The Desecrated Meter, «الإِيقَاعُ المُدَنَّسُ»)

A measure holds two attacks, **Slot A** (Impact f90) and **Slot B** (Impact f210). The first Phase II cycle uses Feint-18, cycles 5–6 Feint-24. Frames are measure-local; "→" marks spill into the next measure.

| Slot | Attack | T0 | Tells | Impact | Active | Neck open |
|---|---|---|---|---|---|---|
| M1-A | SMS-L | 30 | ting 66 | 90 | 90–97 | 98–151 |
| M1-B | PCL-R | 156 | false click 176 | 210 | 210–215 | 216–257 (cut at M2 f17) |
| M2-A | PCL-L Feint-18 | 18 | false clicks 38, 58; stall 58–75 | 90 | 90–95 | 96–143 |
| M2-B | SMS-R | 150 | ting 186 | 210 | 210–217 | 218 → M3 f31 |
| M3-A | PCL-R | 36 | false click 56 | 90 | 90–95 | 96–131 (cut) |
| M3-B | SMS-L Feint-18 | 132 | ting 168; click 172, stall 172–189 | 210 | 210–217 | 218 → M4 f31 |
| M4 | rest, then PGC (or SB) | 114 | lock 162; rush 175–210 | 210 | 210–233 | 234 → M5 f65 |
| M5 | rest, then DSR Twin | 150 | ridge visible 174 | 210 / 252 | 210–221 / 252–263 | 264 → M6 f95 |
| M6 | rest, then VGL + Echo | 114 | lock 198 | 210 / 246 | 210–219 / 246–255 | 256 → M7 f111 |

Three rules make the grid feasible.

1. **Heavy rest.** PGC and VGL (96 f) and SB (120 f) would start at −6, −6 and −30 in Slot A (T0 = 90 − wind-up), and their recoveries (72, 96, 60 f) outrun the half-measure. Heavies therefore take Slot B and the next Slot A is a rest: the one place a measure holds a single attack. DSR in Slot A would hold its neck open to f173, leaving a Slot B at most 36 f of wind-up against a shortest 54 f (PCL). SB replaces PGC in M4 (T0 = 210 − 120 = 90, neck f218–f277) on alternate Phase II cycles.
2. **Closing Neck.** A recovery ends the frame before the next T0. Lost frames: 6 (M1-B), 12 (M3-A).
3. **Parry breathes.** A parried Slot A cancels Slot B and the Sentinel re-enters at the next downbeat. A parried SMS keeps its 90-f recoil.

```
f       0           60          120         180         240
grid    |     +     |     +     |     +     |     +     |
cajon   X           X           X           X
guitar  A                 A                 A                    3+3+2 accents f0, f90, f180
chain   C                 C                 C     C              true clicks f0, f90, f180, f210
A:PCL-F     T   x   xsss--!#nnnnnnnnnn                           T0 18, false clicks 38 and 58, stall to 75
A win                   pPP                                      true window f80-89, Perfect f86-89
B:SMS                                 T      t----!#nnnnn        T0 150, ting 186, Impact 210
B win                                           pPP              f200-209, Perfect f206-209
```

### 4.5 Phase Escalation at 50 % HP — "The Desecrated Meter"

**Trigger.** The third correct answer takes HP to 50 % (100 − 3 × 16.667) and fires `PhaseShift` after the Judgement restore (0.15 → 1.0 over 18 f). The shift is **180 f (3.0 s)** and ends on the first Phase II downbeat. The student keeps full control; the Sentinel does not attack.

| Shift frame | Event |
|---|---|
| 0–60 | Seal 3 shatters in golden dust; the cajón drops out; only the D2 oud drone holds |
| 60–120 | Dust storm builds at the perimeter; vignette ramps 0 → 0.55 |
| 120 | Cajón returns on the straight quarter |
| 150–180 | Guitar enters on the 3+3+2 tresillo; first chain ostinato; viewmodel wraps burn «اخْتَلَّ الإِيقَاعُ» then «أَصْغِ إِلَى السِّلْسِلَةِ» (*Listen to the chain*) |
| 180 | Phase II M1 downbeat |

> اخْتَلَّ الإِيقَاعُ
> أَصْغِ إِلَى السِّلْسِلَةِ

**Two clocks.** The cajón keeps the straight 60 BPM quarter; the chain now sounds the tresillo at f0, f90, f180 and f210. Impacts land on f90 and f210. Counting beats fails; listening to the chain works. The Beat Ring follows the chain, not the cajón.

**Delayed feints.** `SMS` and `PCL` can freeze at f40 for 18 f (24 f from cycle 5) with the gleam lit and a false click. A press in the old window whiffs into a 24-f lockout and full damage, and the trap zone is 25 f wide (4.2). The tell is the **resume**: the head moves again, the gleam pulses. Resume + 15 f lands inside the true window for SMS. The Perfect needs rhythm.

**Dust storm.** Edge sand and heat shimmer cut peripheral visibility to ~70 % of the horizontal screen radius (vignette 0.55). Clear half-angle = atan(0.7 × tan(FOV/2)): **35.0° at FOV 90°**, 45.0° at 110°, **26.1° at 70°**, so the ±25° Parry Cone stays clear at every legal FOV. Audio is not masked: the wind bed carries a −9 dB notch at 2.2–3.0 kHz, keeping the 2.6 kHz ting and the chain transient clean.

**Stays readable:** telegraph shapes (furrow, ring, ridge), the ting, the low brass, the 38 Hz rumble panned to azimuth, the chain, the Beat Ring, the beads, the Seals. **Lost:** lateral context. A PCL hoisted far to one side, the edge of the 7 m DSR arc and the second Twin Breach ring are first read by sound.

### 4.6 Chastened, Quickened and Mercy Rules

| Modifier | Trigger and span | Combat rules |
|---|---|---|
| **Chastened Rhythm** | correct answer; next 2 attacks | Forced `SMS` (V1 L, V2 R), no feints, **0 damage**. Wind-up **90 f / 1500 ms**; the tell stretches ×1.5 (ting f54, gleam f54–f72). Window ≥ 14 f: [Impact−14, Impact−1] = f76–f89, Perfect f86–f89. Phase I: T0 = f30, Impact f120 (beat 3). Phase II: T0 f0 → Impact f90, T0 f120 → Impact f210. Parry still yields Posture. A cancelled Slot B still spends the count. |
| **Quickened Penance** | wrong answer; next 3 attacks | Wind-ups ×0.8 rounded: SMS 48, DSR 48, PGC 96, VGL 96, SB 96, PCL 43. Locks and tells scale the same; feint stalls do not. **Impact stays on its beat; T0 slides later**, so the first click is a "rushed" click off the grid (SMS T0 = f12). Parry window stays 10 f: [38, 47], Perfect [44, 47]. Ting f29 is 9 f before the window opens, under the 15-f reaction time: Block or anticipate. Jump [23, 40] (18 f); VGL dash [80, 94]. Ends at the second wrong answer (Lost-Cause). |
| **Mercy Mode** | after 2 Falls; accept, decline or Settings | Sentinel damage ×0.5 (SMS 9, PGC 11, VGL 15, DSR 8, SB 10, PCL 7, TR 15), parry window +4 f (f46–f59), Quickened off. Posture, timer and the 5-of-6 ratio are untouched. |

**Falls.** Vigor 0 is *Penitent's Fall*: 2.5 s (150 f) sepia fade, respawn at Vigor 100 and Posture 0, cycle restarts at V1. Quickened clears; a pending Chastened is kept (the answer was earned). No try is consumed. Under the **Litany of Review** (after the second wrong answer) the Sentinel only burrows and deals no damage.

### 4.7 Tuning Knobs and Balance Targets

| Knob | Default | Range | Notes |
|---|---|---|---|
| Parry window / Perfect | 10 f / 4 f | 8–18 / 3–6 | bonuses only via Relic, Mercy, Chastened |
| Whiff lockout | 24 f | 18–30 | trap zone = lockout + 1 |
| Feint stall | 18 f (24 f cycles 5–6) | 12–30 | |
| PCL feint stall frame | f40 | f32–f40 | f32 makes PCL-F18 reactable |
| Ring tracking speed | 3.0 m/s | 2–4 | sets the SB run-out deadline (f84) |
| Dust vignette / clear radius | 0.55 / 70 % | 0.35–0.65 / 60–80 % | keep clear half-angle ≥ 25° at FOV 70° |
| Posture decay / grace | 4 per s / 180 f | 3–6 / 150–240 | |
| Carry-over after correct | 45 | 30–60 | shortens the next break |
| Chastened wind-up / Quickened factor | 90 f / ×0.8 | 75–105 / 0.7–0.9 | |
| Dash / Slash / Parry buffer | 4 / 4 / 2 f | 2–6 / 2–6 / 0–4 | Parry buffer never crosses a whiff |

**Balance targets** (playtest first, then telemetry):

- Median fight 6–9 min, with ≤ 24 s of combat before every question.
- V1 Parry success ≥ 60 % with the flash, V4 ≥ 45 % without; below 35 %, extend the flash to V4. Perfect share of attempts ≥ 15 % by cycle 3.
- Cycle 1 ends in Burrow 60–70 % of the time; from cycle 2, a Posture Break ends ≥ 85 % of cycles (the 45 carry-over).
- Median Vigor at the Burrow ≥ 55; Falls per attempt median 0, mean ≤ 0.7; Mercy offered in ≤ 15 % of attempts.
- The first feint traps ≥ 40 % of students, the third ≤ 20 %.
- Regression: an idle student falls at f1320 (22.0 s); a turtle falls in cycle 2 at V5; the Phase I damage sum stays ≥ 100.

The canonical telemetry events carry no combat counters, so these targets need a `combat_summary` payload on `boss_result` (integration appendix).

---

## Module 5 — Diegetic First-Person Educational Integration

The question is never a menu. It is a stone in the cistern, lit by the Sentinel's own glow, and the fight is the only road to it: the blade opens the door, the mind walks through it (Pillar 2). This module fixes when the door opens, what the student sees and presses, what an answer costs, and how the server stays the only judge. Frame data is in Module 4, the viewmodel in Module 2, the mix in Module 3, the Execution, relic and JSON hooks in Module 6, and the briefing that teaches the answer cross in Module 0 (The Penitent's Rite).

**Notation.** *R-frame*: a real 60 FPS frame (16.667 ms), never scaled. *W-frame*: a world-simulation frame; at timescale *s* one R-frame advances *s* W-frames (at 0.15 one W-frame costs 6.667 R = 111.1 ms). *S-frame*: an R-frame counted from the answer seal (S0). UI, input sampling, the incense clock and every network call run on R-time.

### 5.1 Trigger Moments

Two events open the same `QuestionActive` state: the **Posture Break** the student earns, and the **Subterranean Hover** the Sentinel grants when they have not. Both converge on one prelude (§5.1.4).

#### 5.1.1 The Cycle Rule: Exactly One Question per Cycle

```
 CYCLE n  (askedThisCycle = false)
 +----------------------------------------------------------------+
 | Verse1 > Verse2 > Verse3 > Verse4 > Verse5 > Verse6 > recovery |
 +--+----------------------------------------------------------+--+
    | Posture reaches 100 at ANY frame                         | Posture < 100
    v                                                          v
 PostureBreak (Penitent Contemplation)        Burrow (Subterranean Hover)
    +-----------------------------+------------------------------+
                                  v
                  QuestionActive  (askedThisCycle = true)
                                  v
              Judgement | Reprisal  ->  CYCLE n+1, Verse 1
```

1. A cycle has two exits and no third: Posture 100, or Verse 6 ending with Posture below 100. Each exit enters `QuestionActive` once and sets `askedThisCycle`, which clears when the next Verse 1 begins.
2. **A Break pre-empts a Burrow.** The Burrow is evaluated only after Verse 6's Recovery ends; a Break on that frame or earlier wins.
3. A Penitent's Fall during the verses restarts that cycle's verse counter (its question is still owed). A Fall caused by the Reprisal comes after the answer, so the respawn opens the next cycle. Mercy Mode, Scholar Mode and the relic never alter cycle structure.
4. Therefore *questions asked = cycles completed*: six cycles ask `boss_questions` 1 to 6 in served order, whatever the melee skill. A student who never lands a blow still reaches every question through the Hover.
5. Worst-case combat per cycle is 6 × 240 f = 1,440 f = 24.0 s. A no-fall worst case is 6 × (24.0 + 40.0 + 6.0) = 420 s = 7.0 min (8.0 min with the relic), inside the 6 to 9 minute target. Scholar Mode buys reading time and sits outside it by design.

#### 5.1.2 Posture Break: "Penitent Contemplation" / «تَأَمُّلُ التَّائِبِ»

| Frame | Event |
|---|---|
| W0 | Posture reaches 100 (the 3 f hit-stop, or 6 f on a Perfect Parry, plays first and is not counted). One bridle-bell toll. Cajón and chain-click stop; the music transport halts. |
| W0 to W6 | The head snaps up and back, mandible slack. Buffered combat inputs are discarded. |
| W6 = R0 | Dilation begins (§5.2.2). The penitent kneels: Module 2's Question-kneel lowers the eye from 1.65 to 1.05 m over the same 12 R. |
| W6 to W20 | The head falls to the flagstones 2.5 m ahead. At full dilation (R12) it is at W6 + 8.6 = W14.6; the remaining 5.4 W take 5.4 ÷ 0.15 = 36 R. |
| R48 (W20) | Contact. Flagstones crack; the S3 Slam (3.0° over 24 W) runs on the world clock and rolls out over 24 ÷ 0.15 = 160 R. The head rests 2.5 m ahead, jaw slack, soft neck bare. |

From W0 every Sentinel damage volume is disabled and queued follow-ups (Echo Slam, Twin Ridge, Twin Breach, a second feint) are cancelled; the only hazard until the answer resolves is the scripted Reprisal.

#### 5.1.3 Subterranean Hover / «التَّحْوِيمُ الجَوْفِيُّ»

| Frame | Event |
|---|---|
| W0 | Verse 6 Recovery ends with Posture below 100. Burrow begins. The sands mend **+20 Vigor**. Sub-bass 38 Hz rumble, panned to the funnel's azimuth. |
| W0 to W36 | The body arcs into the sand; S2 Thud at W24 as the mass passes under the flagstones. |
| W30 | A funnel nucleates 2.2 m ahead on the player's facing, so it is always in view. |
| W48 = R0 | Dilation and the kneel begin. The camera eases 8° down so the funnel opens under the tablet's lower edge. |
| W62 (R48) | Funnel complete: 4.0 m wide, sand wheeling at 15%. Under it the Sentinel's pale cataract eye turns 0.1 m below the lip. |

Check: W48 + 8.6 = W56.6 and the remaining 62 − 56.6 = 5.4 W take 36 R, so both triggers peak at R48. A Hover waits for an airborne player to land (at most 44 f). No damage source is live at W0.

#### 5.1.4 The Shared Prelude

| R-frame | Event |
|---|---|
| R0 to R12 | Timescale 1.0 → 0.15. Exposure falls 0.4 EV and saturation 20%; Module 2's decals fade over R0 to R18. |
| R12 to R42 | The stone tablet gathers from golden dust 2.2 m ahead (30 R). |
| R42 to R102 | The stem burns in, line by line. Line time = 60 ÷ lines, so it always finishes at R102 (maximum 6 lines, 10 R each). |
| R102 to R132 | Four answer stones rise in order top, right, bottom, left, starting 6 R apart and taking 12 R each (the last starts R120 and finishes R132). |
| **R132** | **Tablet Ready.** The incense lights, answer inputs are accepted, `question_presented` fires. |

132 R = 2,200 ms, and the prelude is free: the quiz clock starts at Tablet Ready. The world meanwhile advances (132 − 12) × 0.15 = 18.0 W.

### 5.2 Diegetic HUD and Time Dilation

#### 5.2.1 What the Student Sees

| Element | Placement and behaviour | Redundant channel |
|---|---|---|
| **Stone tablet** «اللَّوْحُ» | 1.64 × 0.96 m, 2.2 m ahead on the view axis, tilted back 8°, centred 0.15 m below the line of sight to the Sentinel's eye, so the frozen jaw fills the frame around it (the eye stays behind the stone until the seal). Golden ink `#e0a860` on an ichor-black `#14100d` inset cut into the tablet stone `#b9ae96` (9.0:1; ink straight on the stone would be 1.04:1), 2 px gold rim, Latin serif or Arabic Naskh at ≥ 28 px-equivalent (1080p). Header cartouche: «تَأَمَّلْ أَيُّهَا التَّائِبُ، قَبْلَ أَنْ يَنْفَدَ البَخُورُ.» | Mirrored to a hidden `aria-live` region (Appendix B.6). |
| **Four answer stones** | 0.32 m basalt stones in a cross: top A «أ», right B «ب», bottom C «ج», left D «د», offset 0.80 m vertically and 1.22 m horizontally from the tablet centre. Each shows its letter and choice text (auto-fit to 2 lines; if longer, letter only and the full text on the tablet). | Letter and position, never colour alone. |
| **Glowing forearm wraps** | Left wrap: gold glyphs in a diamond showing the key-cap map (W above, D right, S below, A left; Y/B/A/X on gamepad; hidden on touch). Right wrap: the alias row (arrows, 1 2 3 4). A pressed glyph flares white-gold. | Position matches the stones. |
| **Incense timer** | A 0.30 m stick on a brass dish at the tablet's lower left, burning 1:1 with the clock. Under 10 real s the ember turns crimson `#c4291c`, smoke thickens, the wraps pulse (≤ 2 Hz, Appendix B.2) and the clay tick (1.2 kHz, centred) speeds from one per 2.0 s to one per 1.0 s, then one per 0.5 s under 3 s. | Smoke, pulse and tick, never colour alone. |

**Fit rule.** The rig is authored at FOV 90 in Module 2's convention (90° horizontal at 16:9, vertical half-angle atan 9/16 = 29.4°) and scaled by tan(FOV ÷ 2) ÷ tan 45° across the 70 to 110 slider (0.70 to 1.43), so it always spans 1.92 m of the 2.475 m visible at 2.2 m (2 × 2.2 × 9 ÷ 16), about 78% of viewport height. **Gaze anchor.** The rig follows the view axis with a 0.25 s real-time lag; look stays live, clamped to ±30° yaw and ±20° pitch of the Sentinel's eye, so the student can study the frozen jaw and never loses a stone. No cursor appears; mouse buttons are inert.

#### 5.2.2 The 15% Timescale Curve

Drop (ease-in, 12 R = 200.0 ms): *s(i) = 1 − 0.85 × (i ÷ 12)²*. Restore (ease-out, 18 R = 300.0 ms): *s(j) = 0.15 + 0.85 × (1 − (1 − j ÷ 18)²)*.

| Drop i | 0 | 3 | 6 | 9 | 12 | | Restore j | 0 | 3 | 6 | 9 | 12 | 15 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| s | 1.000 | 0.947 | 0.788 | 0.522 | 0.150 | | s | 0.150 | 0.410 | 0.622 | 0.788 | 0.906 | 0.976 | 1.000 |

Mean scale on either curve is 1 − 0.85 ÷ 3 = 0.717, so the drop spends 12 × 0.717 = 8.6 W and the restore 18 × 0.717 = 12.9 W. The Tail Reprisal bypasses the restore (timescale 1.0 within 3 f).

#### 5.2.3 Window Arithmetic

| Condition | World-s | Derivation | Real s | R-frames | Ember turns red at |
|---|---|---|---|---|---|
| Base | 6.0 | 6.0 ÷ 0.15 | **40.0** | 2,400 | 25% left |
| Eye of the Buried Pilgrim | 7.5 | (6.0 + 1.5) ÷ 0.15 | **50.0** | 3,000 | 20% left |
| Scholar Mode ×2 | 12.0 | (6.0 × 2) ÷ 0.15 | **80.0** | 4,800 | 12.5% left |
| Scholar + relic | 15.0 | ((6.0 + 1.5) × 2) ÷ 0.15 | **100.0** | 6,000 | 10% left |

The relic (earned on the first defeat, active on replays; Module 6) adds 1.5 world-s = 1.5 ÷ 0.15 = 10.0 real s, and the red threshold is always 10 real s. The clock stops at the seal, pauses on Esc, and resumes after a 60 R grace in which presses are ignored. Expiry equals a wrong answer.

#### 5.2.4 What the World Does at 15%

* **Frozen close-up.** Chain links, ichor beads and prayer paper drift a few inches from the lens; sand pours like honey. The jaw or collapsing mass is in view, never moving enough to threaten.
* **Dust storm (Phase II) parts.** Vignette opacity eases 0.55 → 0.15 over the drop and returns over the restore.
* **Real time.** Tablet glow, incense, smoke, wraps and UI run on R-time. Module 1's whispers fade over the drop (12 f) and stay silent.

| Audio layer | At 15% |
|---|---|
| Cajón, chain-click | Stop at the trigger; the Beat Ring hides. The incense tick stays real-time and unfiltered, so it cuts through the low-pass. |
| Guitar, oud | Crossfade to a pulseless bed on D Phrygian dominant: oud drone D2/A2, one nylon note per 4 s, 38 Hz swell. |
| World SFX | Rate follows timescale to a floor of 0.4 (about −1.3 octaves), low-pass 12 kHz → 700 Hz, reverb RT60 3.2 s; HRTF positions unchanged. |

#### 5.2.5 Control Binding (No Mouse Pointer)

During `QuestionActive` movement is suspended (the penitent kneels), so WASD is free. The binding is **spatial**, not alphabetical, and identical in English and Arabic (the cross is not mirrored for RTL; only the letters change).

| Choice (`choiceIndex`) | Stone | Keyboard | Alias | Gamepad (Standard mapping index) | D-Pad | Touch |
|---|---|---|---|---|---|---|
| 0 | Top, A «أ» | **W** | ↑, 1 | **Y** / △ (button 3) | Up (12) | Tap stone, or flick up |
| 1 | Right, B «ب» | **D** | →, 2 | **B** / ○ (button 1) | Right (15) | Tap stone, or flick right |
| 2 | Bottom, C «ج» | **S** | ↓, 3 | **A** / ✕ (button 0) | Down (13) | Tap stone, or flick down |
| 3 | Left, D «د» | **A** | ←, 4 | **X** / □ (button 2) | Left (14) | Tap stone, or flick left |

* **Layout-independent.** Keys bind to `event.code`, so an Arabic keyboard layout works; the wraps print the layout's own key label when `getLayoutMap()` exists.
* **Fresh edge.** An answer counts only on a new press after Tablet Ready, so a key held at the trigger (a student still running on W) must be released first.
* **Sealing.** Keyboard and gamepad seal on press (optional Confirm to seal, Appendix B.5, adds a second press). Touch seals on release inside the stone; a flick needs ≥ 40 px within 12 R; a second finger is ignored. On touch the sticks hide and the stones enlarge to ≥ 96 px.

### 5.3 Gameplay Stakes

| | **Correct** | **Incorrect or time-out** |
|---|---|---|
| Animation | Judgement Strike «ضَرْبَةُ الحُكْمِ» | Tail Reprisal «قِصَاصُ الذَّنَبِ» |
| Time | Stays at 0.15 through the thrust; restore starts after contact | Snaps to 1.0 in ≤ 3 f |
| Penance | −1 Seal (HP −16.667%) | None |
| Posture | Set to **45** | Set to **0** |
| Player | Camera lunge 1.2 m, no damage | −30 Vigor, 240 f concussion |
| Next attacks | **Chastened Rhythm** «الإِيقَاعُ المُؤَدَّبُ», 2 attacks | **Quickened Penance** «الكَفَّارَةُ المُعَجَّلَةُ», 3 attacks |

#### 5.3.1 Correct: the Judgement Strike

The commit beat has torn the blade from the flagstones where the kneel planted it and drawn it back. At contact the tip meets the milky eye; hit-stop 6 R; S3 Slam; 800 golden-dust and 400 ichor particles (1,200 of the 4,000 budget).

| | Posture-Break variant | Hover variant |
|---|---|---|
| Target | Near eye of the head on the flagstones, 1.0 m above the stone | Pale eye rising in the funnel, 0.1 m below the lip, 2.2 m ahead |
| Camera over the 60 R travel (9 W ÷ 0.15) | +1.2 m forward, pitch −2° | +1.2 m forward, −0.45 m down (eye 1.05 → 0.60 m), pitch −8° → −35° |
| Blade | One-handed forward thrust | Two-handed plunging thrust to the cross-guard |
| Reach check (reach 1.5 m) | Eye 1.05 m; √(1.3² + 0.05²) = 1.30 m | Vertical 0.60 + 0.10 = 0.70 m; √(1.0² + 0.7²) = 1.22 m |
| Aftermath | Head tears free of the stone and withdraws | Funnel collapses inward; the Sentinel resurfaces |

Seal *n* then shatters (`seal_broken {n}`), Posture is set to 45, and **Chastened Rhythm** arms. The 3rd correct answer also triggers the `PhaseShift`; Chastened then plays in Phase II timing.

**Chastened Rhythm.** The next 2 attacks are forced `SMS`, wind-up **90 f**, damage 0, no feints, origin L then R. Phase I starts T0 on 1& (f30) so Impact lands on beat 3: 30 + 90 = 120. Phase II starts T0 at f0 and f120 so Impacts land on 2& (f90) and 4& (f210). The parry window is a floor of 14 f, not an addition: max(14, 10 + relic 4 + Mercy 4) gives 14 f with no bonus, with the relic alone or with Mercy alone, and 18 f with both.

#### 5.3.2 Incorrect or Time-Out: the Tail Reprisal and the Concussion

At S160 the timescale snaps and the tail erupts across the camera: 30 Vigor, a 240 f (4.0 s) concussion (6 px blur, 8 px double-vision offset, 2.8 kHz tinnitus fading over the last 60 R), Posture 0. The answer and explanation arrive only after the blur clears (§5.4.2).

**Quickened Penance.** The next 3 attacks use wind-up ×0.8 (rounded): SMS 60 → 48, DSR 60 → 48, PGC and VGL 120 → 96 (Phase II 96 → 77), SB 120 → 96, PCL 54 → 43. Impact frames and every actionable tell (gleam and ting, furrow lock, ember ring and lock, ridge, breach ring and lock) keep their distance from Impact; only the opening 12 to 24 f is cut (head lowering, furrow start, burrow rumble). The DSR ridge, visible from Impact − 36, appears at f12 of the 48 f wind-up and the jump window [Impact − 25, Impact − 8] still opens 11 f later (35 − 24 = 11). Decisions and the 10 f parry window are untouched; feint stalls are not scaled.

#### 5.3.3 The Lost-Cause Rule and the Litany of Review

After the **second** wrong or timed-out answer the best possible score is 4/6 (< 5 needed). The Lost-Cause is declared when the check result arrives. That Reprisal still plays but deals 0 damage and applies no Quickened. The fight becomes the **Litany of Review** «وِرْدُ المُرَاجَعَةِ»:

* The dust storm clears and the light turns pale. The Sentinel only burrows: no attacks, no falls.
* About every 10 s a Hover opens the next question with the identical tablet and window. Every answer is followed by its explanation, unpunished; a correct one also earns a golden-dust ripple.
* After the last question: "The Sentinel Endures" (Module 6), then `/submit`, and a try is lost.

Pillar 5: failure teaches, never traps.

#### 5.3.4 Mercy Interplay

Mercy Mode (offered after 2 Penitent's Falls, or in Settings) softens the sword, never the sum: Reprisal damage 30 → 15, Quickened off, parry window +4 f. Questions, window, Seals and the 5/6 rule are unchanged. A Fall cannot interrupt a question (no damage source is live); it clears any pending Chastened or Quickened counter. If a Reprisal takes Vigor to 0, the Fall plays and the explanation is written at the respawn point.

#### 5.3.5 The Sixth-Question Edge Cases

| Wrong before Q6 | Q6 result | Score | Outcome |
|---|---|---|---|
| 0 | Correct | 6/6 | Judgement Strike → Execution |
| 0 | Wrong | 5/6 | Reprisal plays, damage capped to leave ≥ 1 Vigor → Execution |
| 1 | Correct | 5/6 | Judgement Strike → Execution (the last Seal is cut by the Execution itself) |
| 1 | Wrong | 4/6 | Second wrong: Lost-Cause on this answer; no questions remain; explanation, then Endures |
| 2 | Any | ≤ 4/6 | Already in the Litany of Review; Q6 is asked as a review question |

A Q6 time-out is a wrong answer. With 5 correct the Penance bar still shows one Seal until the Execution.

### 5.4 Worked Example (Illustrative, Not a Seeded Question)

> **Illustrative only.** This question is written for this document in the style of the grade-4/5 Math and Science `boss_questions`. It is not one of the six seeded questions, and its `id` is fictitious.

| Field | Value |
|---|---|
| `id` | `9001` (illustrative) |
| Subject / difficulty | Math, grade 4, subtraction with regrouping |
| `text` | A market stall has 4,035 dates. It sells 1,278 of them. How many dates are left? |
| `textAr` | <span dir="rtl" lang="ar">يحتوي كشك في السوق على 4,035 تمرة، وباع منها 1,278 تمرة. كم تمرة بقيت؟</span> |
| `choices` (A to D) | A: 3,243 · B: 5,313 · C: **2,757** · D: 2,857 |
| `choicesAr` | Identical numerals (the platform keeps Western digits with commas in Arabic) |
| `correctIndex` | **2** (stone C, bottom: S / ↓ / 3 / gamepad A) |
| `explanation` | Subtract with regrouping: 4,035 − 1,278 = 2,757. Check by adding back: 2,757 + 1,278 = 4,035. |
| `explanationAr` | <span dir="rtl" lang="ar">نَطْرَحُ مَعَ إِعَادَةِ التَّجْمِيعِ: 4,035 − 1,278 = 2,757. وَلِلتَّحَقُّقِ نَجْمَعُ: 2,757 + 1,278 = 4,035.</span> |
| Distractor logic | A: smaller digit taken from larger in each column (no regrouping). B: added instead of subtracted. D: forgot to reduce the hundreds after lending (off by 100). |
| Timer | 40.0 real s (6.0 world-s); 50.0 s with the relic |

**UI layout at Tablet Ready (English; the Arabic tablet reverses text direction only, positions stay):**

```
+----------------------------------------------------------------------+
|     [ frozen jaw and bridle bit, upper frame, drifting at 15% ]       |
|                                                                      |
|                         +--------------+                             |
|                         | A      3,243 |   TOP     W  ^  1  Y        |
|                         +--------------+                             |
|  +--------------+  +----------------------+  +--------------+        |
|  | D      2,857 |  | A market stall has   |  | B      5,313 |        |
|  +--------------+  | 4,035 dates. It sells|  +--------------+        |
|  LEFT  A  <  4  X  | 1,278 of them. How   |  RIGHT  D  >  2  B       |
|                    | many dates are left? |                          |
|  incense [#####...]+----------------------+                          |
|  26 s left              +--------------+                             |
|                         | C      2,757 |   BOTTOM  S  v  3  A        |
|                         +--------------+                             |
|  L wrap: W D S A glow                    R wrap: ^ > v <  1 2 3 4    |
+----------------------------------------------------------------------+
```

#### 5.4.1 Success Timeline (Posture-Break Variant)

Scenario: cycle 2, Phase I. The student reads for 14.0 s and seals C (`latencyMs` 14,000; incense shows 26.0 s left). Timescale is 0.15 until S226.

| S-frame | Event |
|---|---|
| S0 | C seals: 6 R white flash, stone sinks 4 cm, <span dir="rtl" lang="ar">«خُتِمَ الجَوَابُ»</span>. Incense freezes. `POST /check {questionId, choiceIndex: 2}` leaves. Input locked. |
| S0 to S159 | **Commit beat** (0.4 world-s = 24 W ÷ 0.15 = 160 R = 2,666.7 ms). The right arm tears the Veiled Blade from the flagstones and draws it back; the other stones dim to 30%. A response arriving early is held. |
| S160 | Result applied: `isCorrect true`. C ignites gold; A, B, D crack and fall and the tablet unthreads into gold dust (S160 to S171), clearing the line to the eye. |
| S160 to S219 | Thrust travel, 9 W ÷ 0.15 = 60 R. Camera +1.2 m. |
| S220 | Contact with the eye. Hit-stop 6 R (S220 to S225). S3 Slam. Gold dust and ichor burst. |
| S226 | Restore begins (18 R). Seal *n* shatters; Posture = 45; `seal_broken {n}`. Eye height rises 1.05 → 1.65 m. |
| S244 | Timescale 1.0 (S226 + 18). Control returns. Sand-script explanation starts to write itself on the flagstones (look down). |
| S484 | S244 + 240: the music transport restarts. |
| S514 | Chastened SMS #1 T0 (S484 + 30). |
| S604 | Impact (S484 + 120; wind-up 604 − 514 = 90 f). Parry window **S590 to S603** (14 f); Perfect **S600 to S603**. Damage 0. |
| S754 / S844 | SMS #2: T0 / Impact (+240 f). Quickened and Chastened counters end after it. |

#### 5.4.2 Failure Timeline (Same Seal, Wrong Choice A: 3,243)

| S-frame | Event |
|---|---|
| S0 to S159 | Identical to success. The commit beat never reveals the result. |
| S160 | Result: `isCorrect false`. A cracks black (4 R). Timescale 0.15 → 1.0 over S160 to S162 (3 f). |
| S163 | T0 of the Tail Reprisal (timescale 1.0). The tail rises into the lower-left of the frame. |
| **S175** | Impact (T0 + 12). Active S175 to S180 (6 f). Vigor −30 (e.g. 80 → 50, three beads dim). Hit-stop 3 R. Posture = 0. S5 Reprisal (6.0° plus 10° roll) S175 to S219. Concussion starts. |
| S175 to S414 | Concussion, 240 f = 4.0 s. Player stagger until S219; control from S220. |
| S415 | Blur clear. The sand-script writes itself on the flagstones: first line <span dir="rtl" lang="ar">«الجَوَابُ الصَّحِيحُ: ج»</span> / "The answer was C: 2,757", then the explanation. |
| S775 | S415 + 360 f Reading Grace (6.0 s): music transport restarts. |
| S787 / S835 | First Quickened SMS: T0 (S775 + 12) / Impact (S775 + 60); wind-up 48 f. Parry window **S825 to S834** (10 f); Perfect **S831 to S834**. |

**Time-out variant.** At 2,400 R after Tablet Ready the last ember dies, the tablet text fades from the bottom, <span dir="rtl" lang="ar">«نَفِدَ البَخُورُ»</span> is carved in the stone, and `POST /check {choiceIndex: -1}` is sent. A 160 R "incense gutters" beat plays in place of S0 to S159, then S160 onward is identical to §5.4.2.

### 5.5 Server Integration, Pedagogy, Telemetry and Edge Cases

#### 5.5.1 Server Integration and Latency Hiding

1. **Prefetch.** The Controls Card calls `GET /api/map/boss/5` (Appendix A.3). Question text lives in memory, so the tablet never waits on the network.
2. **Check during the commit beat.** At the seal the client sends `POST /api/map/boss/5/check` through the same API helper as the 2D `BossArena` (CSRF header required). `/check` only grades and writes nothing, so retries are safe: up to **3 attempts** (1 + 2 retries), 1.5 s each, 250 ms backoff, 5.0 s worst case. Only network errors and 5xx are retried; a 4xx (403, 404, 429) is final and returns to the map (a 400 on a time-out is the fallback of item 5). The 2,666.7 ms beat hides every response under ~2.6 s and is identical for both results.
3. **Weighing hold.** If no result by S160, the sim holds on the full-draw pose (blade trembling, stone pulsing) while attempts continue to 5.0 s. Both resolution branches are pre-warmed at the prelude.
4. **"The Sands Are Silent."** After 5.0 s, or immediately if `navigator.onLine` is false at the beat's end, the overlay <span dir="rtl" lang="ar">«الرِّمَالُ صَامِتَةٌ»</span> / "The sands are silent" appears with **Retry** <span dir="rtl" lang="ar">«أَعِدِ المُحَاوَلَةَ»</span>. Retry is a press on the sealed stone. The clock stays stopped. Esc offers "Leave the cistern" (no try lost; only `/submit` records a loss).
5. **Time-out.** Needs the one additive backend change (Appendix A.4, change 1): `/check` accepts `choiceIndex -1` and returns `isCorrect false` with `correctIndex` and the explanations. Until it ships, a 400 triggers a fallback: Reprisal plays, and the explanation comes from `/submit`'s `results[]` on the end review screen.
6. **Final submit.** `/submit` leaves as the last question resolves (during the final strike or the Endures fade). It is built from sealed choices; time-outs are omitted, because the schema keeps `min(0)` and the server grades a missing answer wrong. Retries back off over a still frame, each preceded by `GET /api/map/boss/5`: a lower `triesLeft`, a `completed` progress, or a 429 with `lockedUntil` (the third loss landed) means the first call arrived, so results come from the held `/check` data and nothing is resent.

#### 5.5.2 Pedagogy

* **No combat while reading.** The question opens only when no damage source is live and movement is suspended. After a Judgement the first Chastened Impact is 360 f after the restore (S604 − S244). After a Reprisal the music restarts 600 f after the whip (240 + 360) and the first Impact lands 660 f after it (S835 − S175).
* **Reading support.** 40.0 s base, 50.0 s with the relic, ×2 Scholar. The stem burns in before the choices rise. Question plus choices are authored at ≤ 35 words, text size has 100/125/150% options (Appendix B.6), and the language can be switched from the Esc pause without a refetch.
* **Explanations after the blur, on the floor.** The sand-script appears on the flagstones in the chosen language for 12.0 s (720 R) or until the next question, read by looking down, a gesture the DSR has already taught.
* **Spaced retry.** After `/submit`, the existing results screen lists each missed question with its explanation. The 24 h lockout after three losses is a natural spacing interval; the same six questions return.
* **Known shortcuts.** A student can memorise "bottom"; v1 does not shuffle (server order is the contract), and a seeded stone → `choiceIndex` permutation can be added later. Because only `/submit` records a loss, a reload after some `/check` calls reveals which answers were wrong at no cost, as in the 2D arena; a server-side attempt marker is the later fix.

#### 5.5.3 Telemetry

| Event | When | Payload |
|---|---|---|
| `question_presented` | Tablet Ready (R132) | `questionId`, `trigger` (`posture_break` or `hover`), `cycle`, `phase` |
| `question_answered` | Result applied (S160) | `questionId`, `choiceIndex` (−1 on time-out), `latencyMs` (Tablet Ready → seal), `timedOut`, `correct` |
| `seal_broken` | S226 | `n` |
| `phase_shift` | After the 3rd Judgement | none |
| `player_fall`, `mercy_mode`, `boss_result` | As specified in the bible | `n`; `accepted`; `passed`, `correctCount`, `durationMs` |

Additive properties on `question_answered` (no new events): `checkAttempts`, `checkRttMs`, `scholar`, `relic`, `mercy`. Events batch through the optional endpoint of Appendix A.4 (change 3), flagged off until the privacy review.

#### 5.5.4 Edge Cases

| Case | Rule |
|---|---|
| Esc, tab hidden, Pointer Lock lost | Auto-pause; clock and world frozen; resume with a 60 R grace. |
| Airborne or mid-Dash at a Break | The ease-in waits for landing (≤ 44 f). |
| Hitbox or follow-up queued at a Break | Cleared (§5.1.2); an Echo Slam never lands after a Break. |
| Scholar or Mercy toggled mid-fight | Applies from the next question. |
| Device switch, rotate or resize | Wraps re-skin within 12 R; the tablet re-lays out; the clock continues. |
| Reload or tab closed mid-fight | Nothing was submitted, so no try is lost; the fight restarts at the Controls Card. |
| `prefers-reduced-motion` | Camera shake defaults to 25% (Appendix B.1). The Judgement camera travel shortens to 0.4 m while the target eases 0.8 m toward the camera, so the 1.30 m and 1.22 m reach checks hold. |

---

## Module 6 — First-Person Execution, Relic & Technical Schema

The fight ends where it began, behind the Penitent's eyes. This module scripts the Execution as a 17-second, frame-locked sequence that no input can fail, defines the relic it leaves behind, and publishes the whole fight as one JSON state machine the front end can load. It reuses the numbers of Modules 0, 4 and 5 and adds none to them. Frames are 60 FPS simulation frames (1 f = 16.667 ms). The Execution runs at timescale 1.0 throughout, so a cinematic frame is a real frame.

### 6.1 The Fatal Execution Cinematic

<div dir="rtl" lang="ar">الضَّرْبَةُ القَاضِيَةُ</div>

The camera never leaves the Penitent's head: no third-person cut, no HUD (the Seal echo fades by f29). The scripted camera is the base, and free look continues inside a leash of ±12° yaw and ±8° pitch (±6° and ±4° from f600, so the blade lands where the script says). The horizon stays level. Everything on screen is the student's own: two gauntlets, a linen-hilted blade, ten amber beads.

**Entry rules**

1. **Guard:** `answered == 6` and `/submit` returned `passed`. The submit is sent at the final question's result (S160), so the response normally arrives before this state begins.
2. **From a Judgement** the Execution starts when the 18 R restore ends (R84 of that state). **From a passing Reprisal** (5/6, wrong sixth answer) it waits for the 240 f concussion and the 360 R Reading Grace of Module 5, so the student can see and read before the scene takes their hands.
3. **Placement.** Frames f0 to f29 are a dip to black that relocates the Penitent to the **Execution Mark**: the Surfacing Anchor nearest the player's azimuth, the jaw chain loop 3.0 m ahead at 1.2 m, the head lowered to 1.7 m.
4. **Seals.** `sealsRemaining = 6 − correct`: 0 after a 6/6 run, 1 after 5/6. A Seal still hanging from the jaw chain is cut by the scene itself (f722).

#### 6.1.1 Segments

Every boundary is a beat. 120 + 180 + 120 + 180 + 120 + 120 + 180 = 1,020 f = 17 beats = four measures plus one beat; 1,020 × 16.667 = 17,000 ms.

| Seg | Name | Frames | Beats | Starts at (bar:beat) | Job |
|---|---|---|---|---|---|
| E1 | The Hush | 0–119 | 2 | 1:1 | Silence, relocation, the Sentinel listens |
| E2 | The Approach | 120–299 | 3 | 1:3 | Three footfalls to the chain |
| E3 | The Grapple | 300–419 | 2 | 2:2 | Left hand reaches and closes on the jaw chain |
| E4 | The Wrench | 420–599 | 3 | 2:4 | Three heaves bow the head; the plates part |
| E5 | The Drive | 600–719 | 2 | 3:3 | Right hand draws and drives; the held breath |
| E6 | The Burst | 720–839 | 2 | 4:1 | Prayer dust and ichor; the Sentinel crumbles |
| E7 | The Quiet | 840–1019 | 3 | 4:3 | The relic, the water, the hand-off |

```
f   0      120        300     420          600     720        840          1020
    |  E1   |    E2    |  E3   |     E4     |  E5   |    E6    |     E7     |
bar |   1   |    1  2  |   2   |  2   3     |  3    |   4      |  4    5    |
    ^W2     ^steps x3  ^click   ^heave x3    ^draw   ^BURST     ^bead,water  ^hand-off
    f30     120/180/240 f360    420/480/540   f660=contact (11.000 s)  f720 = 12.000 s
agency:  [pull prompt f390--------f599] [drive prompt f570----f659]
skip:    [available from f0 to f839 once executionSeen; target f840]
```

#### 6.1.2 Frame-by-frame script (60 FPS)

FOV deltas are relative to the player's FOV setting (Δ −10° means 80° at the default 90°). Heights are metres above the flagstones.

| Frames | Camera | Viewmodel | Sentinel | VFX | Audio |
|---|---|---|---|---|---|
| **0–59** | Dip to black: out f0–7, hold f8–13 (Mark reached, view levelled), in f14–29. Then locked: eye 1.65, pitch 0°, Δ0° | Low guard, blade point-down at the hip, left gauntlet open at the thigh | Yield pose: head 1.7, 3.0 m ahead, jaw slack, trunk breath held. Jaw chain loop at 1.2 (the last Seal hangs from it on a 5/6 pass) | Seal echo fades f0–29. Storm vignette 0.55 → 0 over f0–59. Sun begins its last descent, 4° → 0° by f720 | Transport restarts at f0 (bar 1): oud D2/A2 only, −8 dB. No cajón, no guitar. **W2** plays f30–209 (1&): centred, mono, −24 dBFS |
| **60–119** | Still; breath sway ±0.2° at 0.25 Hz | Left fingers flex at f90 (2&) | Head yaws 20° toward the Penitent over f60–119: the blind creature listens | Ribbon drips continue, one per ribbon per 20 f | W2 continues under the drone |
| **120–239** | Walk. Footfalls f120, f180, each 0.633 m; bob 0.012 m. Pitch → −2° then −4°; Δ → −2° | Procession gait; gauntlets counter-sway 0.012 m; blade swings point-down | Motionless. Jaw chain sways 0.04 m per footfall as the gap closes 3.00 → 2.37 → 1.73 m | 24-particle flagstone dust ring at each footfall | Dry footfalls on beats 3 and 4. W2 ends f209 |
| **240–299** | Third footfall f240; gap 1.10 m. Pitch −4°, Δ −2°, then still | Left forearm rises to chest height f270–299; fingers spread | Bridle bit rattles once at f240: it feels the step. Head tilts 3° toward the hand | None | Footfall on bar 2's downbeat; then the drone alone |
| **300–359** | Lean 0.5 m forward over f300–359 (eased); eye 1.65 → 1.55; pitch −8°; Δ −4°. Reach: 1.10 − 0.50 = 0.60 m ≤ 0.70 m arm | Left arm extends 0.70 m, fingers open toward the chain loop | First trunk swell (3 % over 60 f): it breathes for the first time | Ribbons near the hand lift 0.15 m toward it | No click: the tally is withheld. Drone only |
| **360–419** | **S1 Tick** at f360. Eye 1.55, pitch −8°, Δ −4° | **f360: the left fist closes on a link** (bar 2, beat 3). Knuckle lames flex; the engraved link-name catches the light | Jaw hinge groans f370; head tilts 6° toward the fist. A hanging Seal swings in the fist | Fine grit falls from the jaw; a ring of dust shakes off the chain | f360: first true chain-click (C01, with rattle) since the question, head-locked left. f370: brass groan on D2 |
| **420–479** | **Heave 1** f420–455, S1 at f456. Eye 1.55 → 1.50; pitch −8 → −13°; Δ −4 → −6° | Left fist 1.2 → 1.1; four links stream through the glove. Right hand holds the blade low behind the hip | Head 1.700 → 1.467 (36 f), then a 24 f quiver | Ribbon drips double | C01 at f420 with a swelling brass groan |
| **480–539** | **Heave 2** f480–515, **S2 Thud** at f516. Eye → 1.45; pitch → −18°; Δ → −8° | Fist 1.1 → 1.0 | Head 1.467 → 1.233. Collar plate C1 shifts; hairline cracks in the flagstone | Dust sifts from the seam | C01 at f480 (bar 3 downbeat). Cajón bass tone enters, every beat to f689 (−8 dB): a heartbeat |
| **540–599** | **Heave 3** f540–575, **S3 Slam** at f576. Eye → 1.40; pitch → −23°; Δ → −10°. Seam 0.70 m ahead, 0.30 m below the eye: atan(0.30 ÷ 0.70) = 23.2° | Fist 0.9, white-knuckled. Right hand rises to the hip at f590 | Head 1.233 → 1.000 (total drop 0.70), nose down 35°. f576: C1 rides over C2 and the plates part 0.18 m. f580: an amber pinpoint with a dark pupil shows behind the seam, awake | Plate-part dust sheet. The pinpoint is steady and soft: no bronze or crimson flare (reserved cues) | C01 f540. Plate grind f576–599. A soft glass tone, A5 880 Hz at −20 dBFS, from f580 |
| **600–659** | Pitch −23°; Δ → −14° by f660; leash tightens to ±6°/±4° | **Draw** f600–635; armed flash f630 (veil snaps taut, gold runs the blade); **launch f636**; tip at the seam f660. Left fist holds the head bowed | Held bowed. The pinpoint tracks the blade tip | Gold line along the blade; veil streams | Cajón and C01 on f600 and f660. Cloth whoosh at f636 |
| **660–689** | **f660 contact: hit-stop 6 f (f660–665), S3 Slam.** Eye → 1.38; pitch → −26° | f666–689: the blade seats to the cross-guard (24 f); veil whips taut | No recoil. The pinpoint dims like a lamp turned low (f660–689): the Pilgrim closes his eye | 8 ichor drops on blade and veil (soft-neck rule). A hairline of gold along the seam. No sparks | f660: tile crack plus C01, the last true click. Blade slides in f666–689 |
| **690–719** | Frozen: eye 1.38, pitch −26°, Δ −16° (the narrowest view of the scene); leash ±3°/±2°; no bob, no sway | Both hands set; cross-guard flush with the plate; left fist white | Everything stops. Ribbons hang straight | Seam light rises 25 → 60 % over 30 f, static | **Dropout at f690:** oud, cajón and chain mute. Only the 38 Hz sub rises −30 → −12 dBFS to f719 |
| **720–779** | **Bar 4 downbeat. S4 Breach** (4.5°, ±5° roll, 36 f). Δ −16 → +2 by f726, back to 0 by f779. Eye 1.38 → 1.40; pitch −24 → −20° | Gauntlets throw up 0.1 m. Left fist: the last Seal bursts at f722 (or the last link shears on a 6/6 run); scroll letters drift up. 12 ichor and 6 gold decals strike the visor | The seam opens 0.18 → 0.5 m; plates shear away; the eight ribbons unspool into dust | **Burst:** 1,800 particles (1,000 golden dust, 600 ichor, 200 screen droplets), one ramp: whiteout peak 0.55 over 12 f, decay 48 f. Never a strobe. `seal_broken` fires at f722 when a Seal remained | Bronze bowl on D3, dust hiss, ichor patter. **F♯2 (92.50 Hz) enters at f720:** the drone lifts to D major. Wax crack at f722 |
| **780–839** | Eye 1.40, pitch −20°, Δ0; leash relaxes to ±12°/±8° | f780: the left fist opens and the 6.0 m chain (24 links) runs through the palm. f792: a clear amber bead leaves the seam. f800: blade withdraws. **f804: the bead lands in the open left palm** (0.20 m drop; √(2 × 0.2 ÷ 9.8) = 0.202 s = 12.1 f) | Crumble: C1–C3 and R1–R9, 12 segments, one every 5 f from f780, turning to pale sand. The head settles on the flagstones; the teeth fall as broken zellij | Pale sand cascade; chains lose their gloss; ribbons fall as dull linen; the golden drips stop | 24 chain clicks f780–839, spacing 1 → about 4 f, the last on f839. The 38 Hz sub descends to silence. Bead tick f804 |
| **840–929** | Pitch −35° (palm) at f840 → −10° at f899; bead held 0.35 m from the lens; Δ −6°. Eye 1.45 → 1.55 | Left hand lifts the bead; right lowers the blade point-down; veil hangs slack | Gone from view: rings lie as pale sand, a low mound where the head was; the pit opens dark | Mihrab lamp key light rises, sun 0°. f899: one static star glint through the bead (12 f ramp). Water: first drip f840; wet joints and 12 springs open from f870 | Guitar D3 at f840, F♯3 at f900 over the D-major drone. Water drip f840; spring bubbling from f870 (3 HRTF emitters). `executionSeen` written at f840 |
| **930–1019** | Eye 1.65; pitch −10° → −32° over 89 f (0.25°/f) to look over the pit rim; Δ0 | f930: the bead is tied onto the rosary as the eleventh; it clicks on the cord at f990 | Still | Springs reach 0.6 m radius by f1019; the pit water has risen 0.38 m. All ichor decals gone by f960 (240 f lifetime from f720) | Guitar A3 at f960 (bar 5, beat 1); D major rings to f1019. Water murmur swells. No voices. Hand-off at f1020 |

**Arithmetic checks.** Three footfalls × 0.633 m = 1.90 m (3.00 → 1.10 m). Three heaves × 0.233 m = 0.70 m (1.700 → 1.000); each heave is 36 f of motion plus a 24 f quiver = 60 f, one beat. Draw 36 f, launch f636, travel 24 f, contact f660 = 11.000 s. The burst at f720 = 12.000 s = the downbeat of bar 4. The shake ladder climbs S1, S1, S2, S3, S3, S4; S5 stays reserved for `TR`. Reduced-motion players get shake 0 and halved FOV deltas (App. B.2).

#### 6.1.3 Agency prompts (optional, cannot be failed)

Both prompts are stitched glyphs on the forearm wraps (Pillar 4), never HUD.

| Prompt | Shown | Input | If used | If ignored |
|---|---|---|---|---|
| **Pull** — "Hold Guard to pull" / <span dir="rtl" lang="ar">اضغط مطوّلًا على الاحتراس للسحب</span> | f390–599 on the left wrap; pulses on f420, f480, f540 | Hold Guard (RMB, LT, medium button) on a heave's first frame +1 | That heave plays its strained variant: arm tremor, 0.5° roll at 8 Hz, pad rumble 0.3 for 36 f, a brighter click | Auto variant. Head heights at f456, f516, f576 are identical |
| **Drive** — "Press Slash to drive" / <span dir="rtl" lang="ar">اضغط الضربة للطعن</span> | f570–659 on the right wrap | Press Slash (LMB, RT, big button) at any time in the window | Committed variant: brighter armed flash, a second pad pulse, seam light +30 % | The thrust launches at f636 and lands at f660 anyway |

There is no wrong time inside a window, no failure state and no damage source; Vigor is frozen. The prompts change which animation variant plays, never a frame number. Esc pauses the scene (timescale 0) and resumes with a one-click, 60 f count-in. Hold-free route: the Toggle Guard binding works for Pull, and "Cinematic prompts: Off" auto-completes both. Telemetry is additive on `boss_result.execution`: `{viewed, skipped, pullHeaves 0–3, drove}`.

#### 6.1.4 Skip rule

- **Locked on the first viewing.** The skip exists only once `executionSeen` is set (`localStorage` `anees.boss5.execSeen.<userId>`, written at f840 inside try/catch). If storage is unavailable the skip stays off; the scene is only 17 s.
- **Input:** hold Space (A, or the small touch button) for **120 f = 2.000 s**; the prompt appears after f30 as a 60 %-opacity lower-third with a filling ring. Hold-free alternative: press twice within 2000 ms.
- **Target f840, not the end.** A completed hold fades out 12 f, holds black 6 f, fades in 12 f at the Quiet. Every effect and telemetry event with f ≤ 840 runs in order without rendering, so a skip cannot lose a Seal or a flag. The last 3.0 s (the bead, the water) always plays; after f839 the prompt hides.

#### 6.1.5 Aftermath: the cistern fills

The dry cistern was the debt, and the water is the receipt. From f780 the pit floor (6.0 m down) gains water at a constant 0.095 m/s (0.0015833 m/f). By f1019 it has risen only 239 × 0.0015833 = 0.38 m, so the proof on screen is the glint and the **twelve springs that open where the Sentinel surfaced** (the 12 Surfacing Anchors, r = 7.0 m). The full rise from −6.0 to −0.3 m takes 5.7 ÷ 0.0015833 = 3,600 f = 60 s, and the canvas keeps running under the results screen. Replays are framed as the cistern remembering (the title of Codex entry 1): same scene, no relic card.

#### 6.1.6 Hand-off to the results screen

At f1020 the machine halts and the DOM takes over with a 24 f fade over the live canvas.

1. **If `/submit` has not answered by f900**, the scene holds the f899 pose (camera still, water still rising) and retries with backoff, as in Appendix A.3; the hand-off waits for `submit.ready`.
2. **Relic card** (first clear only: `relicsGranted` is non-empty): see 6.2.
3. **Results screen** (the existing component): `passed`, `correctCount` of `total`, `xpEarned` (**300 XP on the first defeat, 0 on replays**), the `results[]` review with each missed question's explanation, `battle`, then `leveledUp` and `newPlayerLevel`. Buttons: Return to the map; Replay (free practice).

New strings (`boss.*`, `frontend/src/lib/i18n.ts`):

| Key | English | Arabic |
|---|---|---|
| `boss.execPull` | Hold {parry} to pull | <span dir="rtl" lang="ar">اضغط مطوّلًا على {parry} للسحب</span> |
| `boss.execDrive` | Press {slash} to drive | <span dir="rtl" lang="ar">اضغط {slash} للطعن</span> |
| `boss.execSkip` | Hold {jump} to skip, or press it twice | <span dir="rtl" lang="ar">اضغط مطوّلًا على {jump} للتخطّي، أو اضغطه مرتين</span> |

### 6.2 The Relic: Eye of the Buried Pilgrim

<div dir="rtl" lang="ar">عَيْنُ الحَاجِّ الدَّفِينِ</div>

**Form.** A bead of clear amber the size of a date stone, ringed in corroded brass with verdigris, a dark pupil-shaped flaw at its heart: the lead bead of a pilgrim's rosary. Equipped, it is the **eleventh bead** of the wrist rosary, 1.4× the diameter of the ten Vigor beads, counting nothing. No flesh and no remains (bible §5): the "eye" is an amber bead with a flaw that looks back.

```
+--------------------------------------------------------------+
| (o)  EYE OF THE BURIED PILGRIM                               |
|      Relic · always on while equipped                        |
|                                                              |
|   Your parry lasts 0.07 s longer.                            |
|   Every question gives you 10 more seconds.                  |
|   It never shows an answer and never skips a question.       |
|                                                              |
|   "He poured out his water for the thirsty..."               |
|   [ Equipped ]                                   [ Continue ]|
+--------------------------------------------------------------+
```

**Flavour text** (invented; no scripture, no divine name on the object):

> He poured out his water for the thirsty, and the dune closed over him together with those who sold theirs. The brass took his body and the chain took his name; one clear bead of his rosary stayed awake behind the colossus's collar, the only eye in that dark that saw. It was never its place to forgive, only to keep watch. Carry it, penitent: the blow will come a little slower, and the hour before the answer will wait a little longer.
>
> <div dir="rtl" lang="ar">سَكَبَ الحَاجُّ مَاءَهُ لِلعِطَاشِ، فَأَطْبَقَ الكَثِيبُ عَلَيْهِ مَعَ الَّذِينَ بَاعُوا مَاءَهُمْ.</div>
> <div dir="rtl" lang="ar">أَخَذَ النُّحَاسُ جَسَدَهُ، وَأَخَذَتِ السِّلْسِلَةُ اسْمَهُ، وَبَقِيَتْ حَبَّةٌ صَافِيَةٌ مِنْ سُبْحَتِهِ سَاهِرَةً خَلْفَ طَوْقِ الوَحْشِ، وَهِيَ العَيْنُ الوَحِيدَةُ الَّتِي أَبْصَرَتْ فِي العَتْمَةِ.</div>
> <div dir="rtl" lang="ar">لَيْسَ لَهَا أَنْ تَغْفِرَ، وَإِنَّمَا لَهَا أَنْ تَسْهَرَ.</div>
> <div dir="rtl" lang="ar">فَاحْمِلْهَا أَيُّهَا التَّائِبُ، يَبْطُؤْ عَلَيْكَ الضَّرْبُ قَلِيلًا، وَيَطُلْ أَمَامَكَ الوَقْتُ قَبْلَ الجَوَابِ.</div>

Engraved on the brass ring (invented): <span dir="rtl" lang="ar">سَقَى فَدُفِنَ، وَبَقِيَتْ عَيْنُهُ تَسْهَرُ</span> — *He gave water and was buried; his eye stays awake.* This is the Pilgrim of Module 1's hook table; forgiveness is left unclaimed, as in Codex entry 1.

#### 6.2.1 Mechanical benefits

| Benefit | Base | With the Eye | Derivation |
|---|---|---|---|
| Parry window | 10 f (166.7 ms) | **14 f (233.3 ms)** | Press in `[Impact−14, Impact−1]`; `SMS` Phase I: f46–f59 |
| Perfect Parry | 4 f (66.7 ms) | 4 f | Unchanged: `[Impact−4, Impact−1]` |
| Question window | 6.0 world-s = 40.0 s | **7.5 world-s = 50.0 s** | (6.0 + 1.5) ÷ 0.15; the bonus is 1.5 ÷ 0.15 = 10.0 real s |
| With Scholar Mode | 80 s | 100 s | (6.0 + 1.5) × 2 ÷ 0.15 |
| With Mercy Mode | 14 f (Mercy alone: 10 + 4) | 18 f | 10 + 4 + 4 (additive, capped at 18; Module 4 §4.1.1) |

In Chastened Rhythm the window is already a 14 f floor, so the Eye adds nothing there by design (Module 5 §3.1). Student-facing copy speaks in seconds: 4 f = 66.7 ms ≈ 0.07 s.

#### 6.2.2 Educational perks

1. **Time to think.** +10.0 real s per question. For a 35-word question (26.3 s of reading at 80 words/min) decision time rises from 40 − 26.3 = 13.7 s to 50 − 26.3 = 23.7 s.
2. **Notched incense.** The stick shows a notch every 10 real s (five at 50 s) so students can pace themselves; it reveals nothing about the answer.
3. **Review margin.** The results screen shows "Answered in 14 s" beside each question, from `latencyMs`, for reflection on speed versus accuracy. Client-side only.

#### 6.2.3 What it never does

It never reveals, highlights or eliminates an answer; never skips, removes or reorders a question; never changes the Seal count, the 5-of-6 pass rule, grading, XP or `/check`; never touches the Perfect window, damage, Posture or Vigor; never extends time during a Reprisal; and never applies inside the Training Post, whose windows are exact by acceptance test (Module 0, AC4).

#### 6.2.4 Acquisition and persistence

- **Drop.** The bead falls in the Execution at f792–804 and ties onto the rosary at f930–989.
- **Grant.** Server-side and account-wide: on a `passed` `/submit` the backend runs `INSERT OR IGNORE INTO user_relics` (`relic_key 'eye_of_the_buried_pilgrim'`, `source_level 5`) and returns `relicsGranted` (non-empty only the first time). `GET /api/map/boss/5` returns `relics: string[]`, so every later visit applies it. A 2D-fallback victory also grants it; existing level-5 clears are backfilled (Appendix A.4).
- **Equip state** is a per-device preference (`localStorage`, try/catch), default on; ownership is the server's.

#### 6.2.5 Equip UI

Relics sit in the gear panel of the Controls Card and of its paused mode, one row each: bead icon, name (EN/AR), the two benefit lines, and a toggle (Tab/Enter, D-Pad/A, tap ≥ 48 px). The row is hidden until owned, and the status strip gains the chip "Eye · on". A change applies from the next question or attack, never mid-window. `question_answered` already carries `relic`.

| Key | English | Arabic |
|---|---|---|
| `boss.relicName` | Eye of the Buried Pilgrim | <span dir="rtl" lang="ar">عَيْنُ الحَاجِّ الدَّفِينِ</span> |
| `boss.relicParry` | Your parry lasts 0.07 s longer. | <span dir="rtl" lang="ar">يطول زمن صدّك 0.07 ثانية.</span> |
| `boss.relicTime` | Every question gives you 10 more seconds. | <span dir="rtl" lang="ar">يمنحك كل سؤال 10 ثوانٍ إضافية.</span> |
| `boss.relicNever` | It never shows an answer or skips a question. | <span dir="rtl" lang="ar">لا تكشف جوابًا ولا تُسقِط سؤالًا.</span> |
| `boss.relicEquip` | Equipped · Not equipped | <span dir="rtl" lang="ar">مُجهَّز · غير مُجهَّز</span> |

#### 6.2.6 Balance notes

- **Graded fight untouched.** The Eye exists only after a pass, so it never affects a scored level-5 attempt. It supports free-practice replays (0 XP, no lockout) and future `fight3d` bosses.
- **Perfect rarer for random presses.** A uniformly random press in the window is Perfect 4/10 = 40 % of the time without the Eye and 4/14 = 28.6 % with it. Report the Perfect-share KPI separately for relic-on cohorts (Appendix C.3).
- **Phase II trap stays a trap.** Module 4's trap zone for a window W is [I−W−25, I−W−1], and the old premature slot must stay inside it. Feint-18 `SMS` (I = 78): W = 10, 14, 18 give f43–f67, f39–f63 and f35–f59, each containing the old slot f50–f59; at W = 19 the zone would end at f58 and a press at f59 would parry. Feint-18 `PCL` (I = 72), old slot f44–f53: the W = 18 zone is f29–f53. Both end exactly on the slot's last frame, so 18 f is the ceiling, as Module 4 caps it; the 24 f feints have room to spare.
- **Not an accommodation.** It is earned; Scholar Mode and Mercy Mode remain the accessibility routes (Appendix B.5).

### 6.3 Engine State Machine (JSON Payload)

The fight is data. One JSON file (`state-machine.json`, validated with `JSON.parse`) carries every attack's frame data (as tabulated in Module 4), Module 5's question rules and this module's Execution. The engine is a table-driven FSM with 14 states, global transitions, and a Verse Director that supplies the next attack (Phase II slot pairing comes from Module 4 §4.4; a Recovery ends on the frame before the next T0, the Closing Neck rule).

**Conventions.** Keys ending in `F` are simulation frames at timescale 1.0; `R` are real 60 FPS frames. Guards are pure expressions over `ctx` (dotted identifiers, numbers, strings, comparison, `&& || !`), parsed by a small evaluator; no calls, no `eval`. Transitions are tried in ascending `priority`; targets starting with `@` leave the machine (lockout panel, 2D fallback, results). The three API calls live under `api`; the nine telemetry events under `telemetry`.

| From | To | Guard (plain words) |
|---|---|---|
| ControlsBriefing | Idle | Enter pressed; lock, pad or touch ready |
| ControlsBriefing | @lockoutPanel / @boss2dFallback | 429 on `GET`; WebGL missing |
| Idle | Telegraph | Verse Director reports the next T0 |
| Idle | Burrow | Litany of Review and the next burrow is due |
| Telegraph | ActiveStrike | frame ≥ Impact |
| ActiveStrike | Recovery | Active frames done |
| Recovery | Telegraph | Phase II and the next T0 is reached (Closing Neck: the neck window closes) |
| Recovery | Idle | Recovery done |
| Recovery | Burrow | Recovery done after Verse 6, Posture < 100, no question yet this cycle |
| Idle, Telegraph, ActiveStrike, Recovery | PostureBreak | Posture ≥ 100 and no question yet this cycle |
| PostureBreak | QuestionActive | 6 f done; grounded (waits ≤ 44 f) |
| Burrow | QuestionActive | 48 f done; grounded (waits ≤ 44 f) |
| QuestionActive | Judgement / Reprisal | commit beat done; `isCorrect` / not |
| Judgement | PhaseShift | 3rd correct answer, Phase I |
| Judgement, Reprisal | Execution | 6 answered, `submit.passed` |
| Judgement, Reprisal | Endures | 6 answered, not passed |
| Judgement, Reprisal, PhaseShift, PlayerFall | Idle | otherwise |
| Idle, Telegraph, ActiveStrike, Recovery, Reprisal | PlayerFall | Vigor ≤ 0 (priority 0) |

`Endures` is 360 f (6.0 s): the light turns pale, the head withdraws unhurried, the sand closes over the pit, then the results screen leads with the explanations; no violence, no relic card. `PlayerFall` is 150 f: 90 f sepia fade, respawn at r = 8.0 m, azimuth 180°, then fade-in; it never calls `/submit`.

```json
{
  "schema": "anees.boss.fsm/1.0",
  "meta": {
    "id": "sandworm-sentinel",
    "levelNumber": 5,
    "artKey": "sandworm",
    "mechanic": "standard",
    "zone": "Desert Oasis",
    "name": { "en": "Sandworm Sentinel", "ar": "حارس دودة الرمال" },
    "mechanicName": { "en": "Steady Strikes", "ar": "ضربات ثابتة" },
    "phases": {
      "1": { "en": "The Steady Litany", "ar": "الوِرْدُ الثَّابِتُ" },
      "2": { "en": "The Desecrated Meter", "ar": "الإِيقَاعُ المُدَنَّسُ" }
    },
    "units": "Keys ending in F are simulation frames at 60 FPS and timescale 1.0. Keys ending in R are real 60 FPS frames and are never scaled. Ms and Sec are milliseconds and seconds. Angles are degrees, distances metres.",
    "guardLanguage": "Guards are pure expressions over ctx: dotted identifiers, numbers, quoted strings, comparison, && || !, parentheses. No calls, no assignment, no eval.",
    "fallback": "2D BossArena when WebGL is absent or the lazy chunk fails"
  },

  "time": {
    "fps": 60,
    "frameMs": 16.667,
    "bpm": 60,
    "beatF": 60,
    "eighthF": 30,
    "measureF": 240,
    "beatPositionsF": { "1": 0, "1&": 30, "2": 60, "2&": 90, "3": 120, "3&": 150, "4": 180, "4&": 210 },
    "timescale": {
      "normal": 1.0,
      "question": 0.15,
      "easeInR": 12,
      "easeOutR": 18,
      "easeIn": "s(i) = 1 - 0.85 * (i / 12)^2",
      "easeOut": "s(j) = 0.15 + 0.85 * (1 - (1 - j / 18)^2)",
      "reprisalSnapF": 3,
      "realTimeSystems": ["ui", "inputSampling", "questionTimer", "network", "audioClock"],
      "hitStopFreezes": ["simulation", "viewmodel"],
      "hitStopDoesNotFreeze": ["cameraShake"]
    }
  },

  "controls": {
    "move": { "kbm": "W A S D", "pad": "Left stick", "touch": "Left virtual stick" },
    "look": { "kbm": "Mouse (Pointer Lock)", "pad": "Right stick", "touch": "Drag right half" },
    "slashThrust": { "kbm": "LMB (hold = Thrust)", "pad": "RT", "touch": "Big button (hold = Thrust)" },
    "guardParry": { "kbm": "RMB (tap = Parry)", "pad": "LT", "touch": "Medium button" },
    "dash": { "kbm": "Q left / E right", "pad": "LB / RB", "touch": "Two arrow buttons" },
    "jump": { "kbm": "Space", "pad": "A", "touch": "Small button" },
    "pause": { "kbm": "Esc", "pad": "Start", "touch": "Menu button" },
    "answer": { "kbm": "W top, D right, S bottom, A left; or arrows; or 1-4", "pad": "Y top, B right, A bottom, X left (D-Pad mirrors)", "touch": "Tap a stone or flick from centre" }
  },

  "constants": {
    "player": {
      "eyeHeightM": 1.65,
      "walkMps": 5.0,
      "sandWalkMps": 3.75,
      "sandDashDistanceMult": 0.75,
      "pitchLimitDeg": 85,
      "fovBaseDeg": 90,
      "fovRangeDeg": [70, 110],
      "slash": { "startupF": 10, "activeF": 6, "recoveryF": 12, "chainMax": 3, "linkWindowF": 8 },
      "thrust": { "holdF": 30, "startupF": 16, "activeF": 6, "recoveryF": 20 },
      "guard": { "raiseF": 6, "damageMult": 0.3, "breathCost": 15, "guardBreakStaggerF": 30, "roundedDamage": true, "appliesTo": ["SMS", "PCL"], "ignoredBy": ["PGC", "DSR", "SB", "VGL", "TR"] },
      "parry": {
        "windowF": 10,
        "perfectF": 4,
        "pressFormula": "[impactF - windowF, impactF - 1]",
        "perfectFormula": "[impactF - perfectF, impactF - 1]",
        "whiffRecoveryF": 24,
        "coneDeg": 25,
        "posture": 15,
        "posturePerfect": 25,
        "hitStopLandedF": 3,
        "hitStopPerfectF": 6,
        "maxWindowF": 18
      },
      "dash": { "startupF": 2, "iFramesF": [2, 13], "travelF": 14, "travelM": 3.2, "lockoutF": 36, "breathCost": 20 },
      "jump": { "airF": 44, "aboveThresholdM": 0.6, "aboveFramesF": [8, 36], "apexM": 1.1, "bufferF": 6 },
      "inputBufferF": { "jump": 6, "dash": 4, "slash": 4, "parry": 2, "parryNeverAcrossWhiffLockout": true }
    },
    "sentinel": {
      "bodyRadiusM": 1.6,
      "rearedEyeHeightM": 4.6,
      "headLoweredHeightM": 1.7,
      "gulletDiameterM": 3.6,
      "lengthM": 38,
      "softNeckBandM": [0.9, 1.6],
      "blind": true
    },
    "arena": {
      "pitRadiusM": 3.0,
      "pitDepthM": 6.0,
      "flagstoneRadiusM": [3.0, 11.0],
      "deepSandRadiusM": [11.0, 16.0],
      "spawn": { "radiusM": 8.0, "azimuthDeg": 180, "facing": "N" },
      "surfacingAnchors": { "count": 12, "radiusM": 7.0 }
    },
    "server": {
      "questions": 6,
      "passRatio": 0.7,
      "passCorrectOfTotal": 5,
      "maxTries": 3,
      "lockoutHours": 24,
      "xpFirstDefeat": 300,
      "xpReplay": 0
    }
  },

  "meters": {
    "vigor": { "max": 100, "beads": 10, "perBead": 10, "display": "left-wrist tasbih rosary", "burrowMend": 20, "cap": 100, "consumables": false },
    "breath": { "max": 100, "regenPerSec": 25, "regenDelaySec": 0.5, "dashCost": 20, "guardHitCost": 15, "parryCost": 0, "jumpCost": 0 },
    "posture": {
      "min": 0,
      "max": 100,
      "decayPerSec": 4,
      "decayDelaySec": 3,
      "breakAt": 100,
      "afterCorrect": 45,
      "afterWrong": 0,
      "sources": { "parry": 15, "perfectParry": 25, "neckSlash": 6, "neckThrust": 14, "otherPart": 1 }
    },
    "penance": {
      "seals": 6,
      "hpPercentFormula": "100 - correctAnswers * 16.667",
      "phaseTwoAtCorrect": 3,
      "changedBy": "Judgement only",
      "meleeEffect": "cosmetic cracks on the current Seal"
    }
  },

  "cameraShake": {
    "model": "rotation = peakDeg * slider * exp(-3 * t / durationF) * noise(rateHz); overlapping presets take the stronger, never the sum; slider 0-100 percent",
    "presets": {
      "S1": { "name": "Tick", "peakDeg": 0.4, "durationF": 6, "rollDeg": 0, "rateHz": 28, "axis": "even" },
      "S2": { "name": "Thud", "peakDeg": 1.2, "durationF": 12, "rollDeg": 0, "rateHz": 22, "axis": "yaw70" },
      "S3": { "name": "Slam", "peakDeg": 3.0, "durationF": 24, "rollDeg": 0, "rateHz": 16, "axis": "pitch80" },
      "S4": { "name": "Breach", "peakDeg": 4.5, "durationF": 36, "rollDeg": 5, "rateHz": 12, "axis": "pitch70" },
      "S5": { "name": "Reprisal", "peakDeg": 6.0, "durationF": 45, "rollDeg": 10, "rateHz": 9, "axis": "roll+pitch" }
    },
    "tierRule": "A strike that does not land at full damage (dodged, guarded, parried) plays one preset lower than its hit preset; Perfect Parry plays S2 as a reward. TR and hit-stop are never tiered.",
    "zeroPercent": "hit-stop, sparks, audio and viewmodel recoil still play"
  },

  "hitResolution": {
    "hitTest": "Every Active frame. The first frame on which the player capsule overlaps an attack volume resolves the strike. A strike resolves at most once per Active window.",
    "order": [
      { "outcome": "clear", "when": "geometry check passes: PGC lateral >= 2.2 m from line centre, SB and VGL player outside ring radius, DSR feet above 0.6 m on every Active frame" },
      { "outcome": "dodged", "when": "player.dashIFramesActive" },
      { "outcome": "perfectParry", "when": "attack.parriable && player.parryPressedIn[impact-4, impact-1] && reticleWithinConeDeg <= 25" },
      { "outcome": "parried", "when": "attack.parriable && player.parryPressedIn[impact-windowF, impact-1] && reticleWithinConeDeg <= 25" },
      { "outcome": "blocked", "when": "player.guardHeld && attack.guardable; damage = round(full * 0.3); Breath -15; Guard Break if Breath < 15" },
      { "outcome": "hit", "when": "otherwise; full damage" }
    ],
    "onParried": { "sentinelRecoils": true, "postureGain": 15, "hitStopF": 3, "recoveryUses": "recoveryParriedF where defined" },
    "onPerfectParry": { "postureGain": 25, "hitStopF": 6 },
    "onWhiffedParry": { "playerLockoutF": 24 }
  },

  "attacks": {
    "SMS": {
      "id": "A1",
      "name": { "en": "Serrated Mandible Sweep", "ar": "كَنْسَةُ الفَكِّ المُسَنَّنِ" },
      "counters": { "primary": "parry", "alsoSafe": ["block", "dash"] },
      "parriable": true,
      "guardable": true,
      "hitbox": { "shape": "arc", "arcDeg": 140, "reachM": [1.2, 3.4], "heightM": [0.4, 2.0], "originSides": ["L", "R"], "headCockDeg": 35 },
      "damage": { "full": 18, "guarded": 5 },
      "phase1": {
        "windUpF": 60,
        "impactF": 60,
        "activeF": 8,
        "recoveryF": 54,
        "recoveryParriedF": 90,
        "parry": { "pressF": [50, 59], "perfectF": [56, 59] },
        "dashPressF": [54, 58],
        "cues": [
          { "anchor": "T0", "offsetF": 0, "audio": "C01", "note": "chain-click" },
          { "anchor": "impact", "offsetF": -24, "untilOffsetF": -12, "visual": "bridleBitGleam", "audio": "C02", "note": "2.6 kHz ting, head lowered to 1.7 m, jaw open 20 degrees" },
          { "anchor": "impact", "offsetF": 0, "audio": "C01", "note": "second click is the impact" }
        ],
        "shake": { "hit": "S2", "guard": "S1", "parry": "S1", "perfect": "S2", "dodge": "S1" }
      },
      "phase2": {
        "recoveryF": 54,
        "recoveryParriedF": 90,
        "plain": { "windUpF": 60, "impactF": 60, "parry": { "pressF": [50, 59], "perfectF": [56, 59] } },
        "feint": {
          "stallStartF": 40,
          "stallF": 18,
          "stallFCycles5to6": 24,
          "impactF": 78,
          "impactFCycles5to6": 84,
          "falseClickF": 40,
          "falseClickAudio": "C09",
          "creakF": 58,
          "creakFCycles5to6": 64,
          "creakAudio": "C10",
          "parry": { "pressF": [68, 77], "perfectF": [74, 77] },
          "parryCycles5to6": { "pressF": [74, 83], "perfectF": [80, 83] },
          "trapSlotF": [50, 59],
          "trapOutcome": "whiff, 24 f player lockout, full damage"
        }
      }
    },

    "PGC": {
      "id": "A2",
      "name": { "en": "Piercing Gullet Charge", "ar": "انْقِضَاضُ الحَلْقِ الثَّاقِبِ" },
      "counters": { "primary": "dash", "alsoSafe": [] },
      "parriable": false,
      "guardable": false,
      "hitbox": { "shape": "line", "widthM": 3.0, "startDistanceM": 14, "lethalHalfWidthM": 2.2, "endsUprightBeyondLockM": 1.2 },
      "damage": { "full": 22 },
      "phase1": {
        "windUpF": 120,
        "impactF": 120,
        "activeF": 24,
        "recoveryF": 72,
        "furrowLockF": 60,
        "surfaceF": 85,
        "dashPressF": [60, 118],
        "rush": { "fromF": 85, "toF": 120, "frames": 35, "metresPerF": 0.4 },
        "cues": [
          { "anchor": "T0", "offsetF": 0, "untilOffsetF": 60, "audio": "C03", "visual": "furrowDraws" },
          { "anchor": "T0", "offsetF": 60, "audio": "C04", "visual": "furrowEdgesFlashCrimson", "note": "lock; brass drone rises to impact" },
          { "anchor": "T0", "offsetF": 85, "untilOffsetF": 120, "audio": "C05", "visual": "gulletRush" }
        ],
        "shake": { "hit": "S3", "guard": "S2", "dodge": "S2" }
      },
      "phase2": {
        "windUpF": 96,
        "impactF": 96,
        "activeF": 24,
        "recoveryF": 72,
        "furrowLockF": 48,
        "surfaceF": 61,
        "dashPressF": [48, 94],
        "rush": { "fromF": 61, "toF": 96, "frames": 35, "metresPerF": 0.4 },
        "furrowFlashes": 2
      }
    },

    "VGL": {
      "id": "A3",
      "name": { "en": "Vertical Guillotine Lunge", "ar": "هَوِيُّ المِقْصَلَةِ" },
      "counters": { "primary": "dash", "alsoSafe": [] },
      "parriable": false,
      "guardable": false,
      "unblockable": true,
      "hitbox": { "shape": "ring", "radiusM": 2.2, "rearedEyeHeightM": 4.6, "lodgedHeadAheadM": 3.0 },
      "damage": { "full": 30, "knockdownF": 30 },
      "phase1": {
        "windUpF": 120,
        "impactF": 120,
        "activeF": 10,
        "recoveryF": 96,
        "rearF": [0, 60],
        "embersFromF": 48,
        "ringAppearsF": 72,
        "ringLockF": 100,
        "dashPressF": [100, 118],
        "cues": [
          { "anchor": "T0", "offsetF": 48, "untilOffsetF": 120, "audio": "C06", "visual": "crimsonEmbersFromBothEyes" },
          { "anchor": "T0", "offsetF": 72, "visual": "redRingAppearsAndFollows" },
          { "anchor": "T0", "offsetF": 100, "audio": "C04", "visual": "ringLocks" }
        ],
        "shake": { "hit": "S3", "dodge": "S2" }
      },
      "phase2": {
        "windUpF": 96,
        "impactF": 96,
        "activeF": 10,
        "recoveryF": 96,
        "embersFromF": 24,
        "ringAppearsF": 48,
        "ringLockF": 84,
        "dashPressF": { "first": [84, 94], "echo": [120, 130] },
        "echoSlam": { "delayF": 36, "impactF": 132, "activeF": 10, "damage": 30, "radiusM": 2.2, "zone": "dodge landing zone", "ringOutlineFromF": 96, "ringLockF": 120, "breathForTwoDashes": 40 },
        "recoveryStartsAfter": "echoSlam active"
      }
    },

    "DSR": {
      "id": "A4",
      "name": { "en": "Dune Scythe Ripple", "ar": "تَمَوُّجُ مِنْجَلِ الكَثِيبِ" },
      "counters": { "primary": "jump", "alsoSafe": [] },
      "parriable": false,
      "guardable": false,
      "hitbox": { "shape": "ridge", "heightM": 0.55, "arcWidthM": 7, "clearsWhenFeetAboveM": 0.6 },
      "damage": { "full": 15, "sandDrag": { "moveMult": 0.7, "durationF": 60 } },
      "phase1": {
        "windUpF": 60,
        "impactF": 60,
        "activeF": 12,
        "activeFramesF": [60, 71],
        "recoveryF": 72,
        "ridgeVisibleF": 24,
        "jumpPressF": [35, 52],
        "jumpDerivation": "P + 8 <= 60 and P + 36 >= 71",
        "cues": [
          { "anchor": "T0", "offsetF": 24, "untilOffsetF": 60, "audio": "C07", "visual": "crescentSlumpAndOchreCrest" }
        ],
        "shake": { "hit": "S2", "dodge": "S1" }
      },
      "phase2": {
        "twinRidge": {
          "ridge1ActiveF": [60, 71],
          "ridge2OffsetF": 42,
          "ridge2ActiveF": [102, 113],
          "ridge2JumpPressF": [77, 94],
          "inputBufferF": 6,
          "scrapeRepeat": "minor third higher"
        },
        "windUpF": 60,
        "recoveryF": 72
      }
    },

    "SB": {
      "id": "A5",
      "name": { "en": "Subterranean Breach", "ar": "الاِنْبِثَاقُ مِنَ الجَوْفِ" },
      "counters": { "primary": "dash", "alsoSafe": ["runOutOfRing"] },
      "parriable": false,
      "guardable": false,
      "hitbox": { "shape": "ring", "radiusM": 2.4 },
      "damage": { "full": 20 },
      "phase1": {
        "windUpF": 120,
        "impactF": 120,
        "activeF": 8,
        "recoveryF": 60,
        "rumbleF": 0,
        "ringAppearsF": 54,
        "ringLockF": 96,
        "dashPressF": [96, 118],
        "runOutLatestStartF": 84,
        "cues": [
          { "anchor": "T0", "offsetF": 0, "untilOffsetF": 96, "audio": "C08", "note": "38 Hz sub-bass panned to the eruption azimuth" },
          { "anchor": "T0", "offsetF": 54, "visual": "dustGeyserRingWithGoldenPaper" },
          { "anchor": "T0", "offsetF": 96, "audio": "C04", "visual": "ringLocks" }
        ],
        "shake": { "hit": "S4", "dodge": "S3" }
      },
      "phase2": {
        "windUpF": 120,
        "activeF": 8,
        "recoveryF": 60,
        "twinBreach": { "rings": 2, "separationM": 3.0, "bothLockF": 96 }
      }
    },

    "PCL": {
      "id": "A6",
      "name": { "en": "Penitent's Chain Lash", "ar": "سَوْطُ السِّلْسِلَةِ" },
      "counters": { "primary": "parry", "alsoSafe": [] },
      "parriable": true,
      "guardable": true,
      "hitbox": { "shape": "chainHead", "coneDeg": 25, "origin": ["highLeft", "highRight"] },
      "damage": { "full": 14, "guarded": 4 },
      "phase1": null,
      "phase2": {
        "windUpF": 54,
        "impactF": 54,
        "activeF": 6,
        "recoveryF": 48,
        "parry": { "pressF": [44, 53], "perfectF": [50, 53] },
        "cues": [
          { "anchor": "T0", "offsetF": 20, "audio": "C09", "note": "false click announces the lash (Module 4 f20)" },
          { "anchor": "impact", "offsetF": -24, "untilOffsetF": -12, "visual": "gleamOnChainHead" }
        ],
        "feint": {
          "stallStartF": 40,
          "stallF": 18,
          "stallFCycles5to6": 24,
          "impactF": 72,
          "impactFCycles5to6": 78,
          "parry": { "pressF": [62, 71], "perfectF": [68, 71] },
          "parryCycles5to6": { "pressF": [68, 77], "perfectF": [74, 77] },
          "trapSlotF": [44, 53]
        },
        "shake": { "hit": "S2", "guard": "S1", "parry": "S1", "perfect": "S2" }
      }
    },

    "TR": {
      "id": "P1",
      "name": { "en": "Tail Reprisal", "ar": "قِصَاصُ الذَّنَبِ" },
      "counters": { "primary": "none", "scripted": true },
      "parriable": false,
      "guardable": false,
      "unblockable": true,
      "damage": { "full": 30, "mercy": 15, "lostCause": 0, "finalPassingCap": "leave at least 1 Vigor" },
      "phase1": { "windUpF": 12, "activeF": 6, "afterTimescaleSnap": true },
      "phase2": { "windUpF": 12, "activeF": 6, "afterTimescaleSnap": true },
      "concussion": { "durationF": 240, "blurPx": 6, "doubleVisionPx": 8, "tinnitusHz": 2800, "tinnitusFadeLastR": 60 },
      "shake": { "hit": "S5", "tiered": false },
      "hitStopF": 3
    }
  },

  "litany": {
    "cyclesPerFight": 6,
    "questionsPerCycle": 1,
    "versesPerCycle": 6,
    "verseF": 240,
    "phase1": {
      "order": ["SMS-L", "SMS-R", "PGC", "SMS-L", "DSR", "VGL"],
      "cycle2PlusMaySwapVerses": [3, 5],
      "t0AtVerseStartF": 0,
      "impactsOnBeat": true
    },
    "phase2": {
      "impactFramesInVerse": [90, 210],
      "guitarAccentsF": [0, 90, 180],
      "chainClickLattice": "30 f offset from the beat grid",
      "slots": { "A": { "impactF": 90 }, "B": { "impactF": 210 } },
      "heavyAttacks": ["PGC", "VGL", "SB", "DSR"],
      "heavySlot": "B",
      "restBeforeHeavy": "the Slot A before a heavy is a rest, because T0 = Impact - wind-up would fall before the measure (PGC and VGL -6, SB -30)",
      "closingNeck": "a Recovery ends on the frame before the next T0, so the neck window is cut, never overlapped",
      "parryCancelsSlotB": true,
      "attackPairing": "Module 4 section 4.4 Phase II cycle table, loaded by the Verse Director"
    },
    "cycleRule": "Exactly one question per cycle: Posture Break, or Burrow after Verse 6 if no Break occurred. A Break pre-empts a Burrow."
  },

  "question": {
    "worldTimescale": 0.15,
    "windowWorldSec": 6.0,
    "relicBonusWorldSec": 1.5,
    "scholarMult": 2,
    "clockFormulaRealFrames": "round((windowWorldSec + relicBonusWorldSec * relicEquipped) * scholarMult * 400)",
    "table": [
      { "mode": "base", "worldSec": 6.0, "realSec": 40.0, "realFrames": 2400 },
      { "mode": "relic", "worldSec": 7.5, "realSec": 50.0, "realFrames": 3000 },
      { "mode": "scholar", "worldSec": 12.0, "realSec": 80.0, "realFrames": 4800 },
      { "mode": "scholar+relic", "worldSec": 15.0, "realSec": 100.0, "realFrames": 6000 }
    ],
    "emberRedAtRealSec": 10,
    "tick": { "hz1200": true, "intervalSecAbove10": 2.0, "intervalSecBelow10": 1.0, "intervalSecBelow3": 0.5 },
    "prelude": { "totalR": 132, "tabletGatherR": [12, 42], "stemBurnR": [42, 102], "stonesRiseR": [102, 132], "clockStartsAt": "Tablet Ready (R132)" },
    "commitBeat": { "worldSec": 0.4, "realFrames": 160 },
    "answerMap": {
      "0": { "stone": "top", "letter": { "en": "A", "ar": "أ" }, "kbm": ["KeyW", "ArrowUp", "Digit1"], "pad": ["button3", "button12"] },
      "1": { "stone": "right", "letter": { "en": "B", "ar": "ب" }, "kbm": ["KeyD", "ArrowRight", "Digit2"], "pad": ["button1", "button15"] },
      "2": { "stone": "bottom", "letter": { "en": "C", "ar": "ج" }, "kbm": ["KeyS", "ArrowDown", "Digit3"], "pad": ["button0", "button13"] },
      "3": { "stone": "left", "letter": { "en": "D", "ar": "د" }, "kbm": ["KeyA", "ArrowLeft", "Digit4"], "pad": ["button2", "button14"] }
    },
    "inputRules": { "freshEdgeOnly": true, "simultaneousAnswersIgnored": true, "sealOnPress": true, "touchSealOnRelease": true, "mouseButtonsInert": true },
    "gazeLeash": { "yawDeg": 30, "pitchDeg": 20 },
    "expiry": "equals a wrong answer; /check is sent with choiceIndex -1",
    "pause": { "clockPaused": true, "resumeGraceR": 60 },
    "explanation": { "shownOn": "flagstones as sand-script", "afterBlurClears": true, "stayR": 720, "wordCap": 25 }
  },

  "modifiers": {
    "chastened": {
      "arms": "Judgement",
      "attacks": 2,
      "forceAttack": "SMS",
      "originSequence": ["L", "R"],
      "windUpF": 90,
      "parryWindowFloorF": 14,
      "damage": 0,
      "feints": false,
      "phase1T0F": 30,
      "phase2T0F": [0, 120],
      "breatherAfterRestoreF": 240,
      "effectiveParryWindowF": { "none": 14, "relic": 14, "relicAndMercy": 18 }
    },
    "quickened": {
      "arms": "Reprisal",
      "attacks": 3,
      "windUpMult": 0.8,
      "rounding": "nearest",
      "windUpF": { "SMS": 48, "PGC": 96, "VGL": 96, "DSR": 48, "SB": 96, "PCL": 43, "PGC_II": 77, "VGL_II": 77 },
      "cutsLeadInOnly": true,
      "feintStallScaled": false,
      "parryWindowF": 10,
      "readingGraceF": 360,
      "firstAttackT0AfterGraceF": 12,
      "disabledBy": ["mercy", "lostCause"]
    },
    "mercy": {
      "offeredAfterFalls": 2,
      "alsoInSettings": true,
      "damageMult": 0.5,
      "parryWindowBonusF": 4,
      "quickened": false,
      "unchanged": ["questionText", "questionWindow", "sealCount", "passRule"]
    },
    "scholar": { "questionTimeMult": 2, "appliesFrom": "next question" },
    "lostCause": {
      "triggeredBy": "second wrong or timed-out answer (best possible 4/6)",
      "name": { "en": "Litany of Review", "ar": "وِرْدُ المُرَاجَعَةِ" },
      "damage": false,
      "falls": false,
      "postureFrozen": true,
      "sentinelOnlyBurrows": true,
      "burrowEveryF": 600,
      "explanationsFor": "every remaining question",
      "endsIn": "Endures"
    }
  },

  "relic": {
    "key": "eye_of_the_buried_pilgrim",
    "name": { "en": "Eye of the Buried Pilgrim", "ar": "عَيْنُ الحَاجِّ الدَّفِينِ" },
    "grant": { "when": "/submit passed on an uncleared boss", "server": "INSERT OR IGNORE INTO user_relics", "response": "relicsGranted[]", "statusField": "GET /api/map/boss/5 relics[]" },
    "modifiers": {
      "parryWindowBonusF": 4,
      "perfectParryBonusF": 0,
      "questionWindowBonusWorldSec": 1.5,
      "incenseNotchEveryRealSec": 10,
      "reviewShowsLatency": true
    },
    "derived": {
      "parryWindowF": 14,
      "parryWindowMs": 233.3,
      "perfectParryF": 4,
      "perfectParryMs": 66.7,
      "questionWindowWorldSec": 7.5,
      "questionWindowRealSec": 50.0,
      "questionWindowRealFrames": 3000,
      "bonusRealSec": 10.0,
      "withMercyParryWindowF": 18,
      "withScholarQuestionRealSec": 100.0
    },
    "stacking": { "parry": "additive with Mercy: 10 + 4 + 4 = 18, capped at 18 (Module 4 section 4.1.1)", "time": "bonus added before the Scholar multiplier" },
    "suppressedIn": ["trainingPost"],
    "appliesFrom": "next question or attack after equipping",
    "neverModifies": ["answerReveal", "questionCount", "questionOrder", "sealCount", "passRule", "grading", "xp", "damage", "posture", "perfectParryWindow", "chastenedFloor"]
  },

  "api": {
    "headers": "same CSRF-bearing helper as the 2D BossArena",
    "bossStatus": {
      "method": "GET",
      "path": "/api/map/boss/5",
      "calledBy": "ControlsBriefing.enter",
      "uses": ["questions[6] in served order", "battle.triesLeft", "battle.maxTries", "battle.lockedUntil", "relics[] (additive)"],
      "errors": { "429": "lockout panel with countdown, no 3D", "403": "locked", "comingSoon": "map message" }
    },
    "check": {
      "method": "POST",
      "path": "/api/map/boss/5/check",
      "calledBy": "QuestionActive.Sealed.enter and QuestionActive.Expired.enter",
      "body": { "questionId": "number", "choiceIndex": "-1..3 (-1 = no answer, needs the additive backend change)" },
      "response": ["isCorrect", "correctIndex", "explanation", "explanationAr"],
      "attempts": 3,
      "attemptTimeoutMs": 1500,
      "backoffMs": 250,
      "worstCaseMs": 5000,
      "idempotent": true,
      "onFailure": "QuestionActive.Silent with Retry; clock stays stopped",
      "olderBackend400": "play Reprisal anyway; take the explanation from submit results[]"
    },
    "submit": {
      "method": "POST",
      "path": "/api/map/boss/5/submit",
      "calledBy": "Judgement or Reprisal that resolves the final question, or the end of the Litany of Review",
      "body": { "answers": "sealed answers only, built by the 2D BossArena helper; time-outs omitted" },
      "response": ["passed", "correctCount", "total", "xpEarned", "results[]", "battle", "relicsGranted[] (additive)", "leveledUp", "newPlayerLevel"],
      "retry": "never blind: re-read bossStatus and re-send only if triesLeft is unchanged; payload mirrored in sessionStorage per attempt",
      "429": "end the fight and return to the map",
      "serverWins": "server correctCount overrides the client tally"
    }
  },

  "telemetry": {
    "events": {
      "boss_briefing_shown": { "payload": ["visit", "device", "triesLeft", "lang"], "firedBy": "ControlsBriefing.enter" },
      "boss_briefing_confirmed": { "payload": ["device", "trainingCompleted"], "firedBy": "ControlsBriefing.exit" },
      "question_presented": { "payload": ["questionId", "trigger", "cycle", "phase"], "firedBy": "QuestionActive.Open.enter" },
      "question_answered": { "payload": ["questionId", "choiceIndex", "latencyMs", "timedOut", "correct"], "additive": ["checkAttempts", "checkRttMs", "scholar", "relic", "mercy"], "firedBy": "Judgement.enter or Reprisal.enter" },
      "seal_broken": { "payload": ["n"], "additive": ["source"], "firedBy": "Judgement R66, or Execution f722 when one Seal remains" },
      "phase_shift": { "payload": [], "firedBy": "PhaseShift.enter" },
      "player_fall": { "payload": ["n"], "firedBy": "PlayerFall.enter" },
      "mercy_mode": { "payload": ["accepted"], "firedBy": "mercy offer or Settings" },
      "boss_result": { "payload": ["passed", "correctCount", "durationMs"], "additive": ["execution", "combatSummary"], "firedBy": "submit response applied" }
    },
    "executionAdditive": { "viewed": "boolean", "skipped": "boolean", "pullHeaves": "0-3", "drove": "boolean" },
    "durationMsDefinition": "unpaused real milliseconds from boss_briefing_confirmed to the /submit request",
    "transport": "batched, flushed with keepalive fetch on pagehide; feature-flagged off until the privacy review"
  },

  "neckWindow": {
    "exposedFrom": "Recovery.enter",
    "hiddenAt": "Recovery.exit",
    "closingNeck": "In Phase II the next T0 ends the Recovery, so the window closes on the frame before it (Module 4 section 4.4); a parried Slot A cancels Slot B and the Sentinel re-enters at the next downbeat",
    "postureOnHit": { "slash": 6, "thrust": 14, "elsewhere": 1 },
    "visual": "soft neck pulses golden once per 60 f while exposed"
  },

  "pause": {
    "triggers": ["Esc", "Start", "Menu", "pointerLockLost", "tabHidden"],
    "timescale": 0,
    "audioFadeTo": 0.25,
    "audioFadeF": 12,
    "resumeGuardF": 90,
    "countInF": { "combat": 180, "question": 60, "execution": 60 },
    "ui": "Controls Card in paused mode"
  },

  "globalTransitions": [
    { "from": ["Idle", "Telegraph", "ActiveStrike", "Recovery", "Reprisal"], "to": "PlayerFall", "guard": "ctx.player.vigor <= 0", "priority": 0 },
    { "from": ["Idle", "Telegraph", "ActiveStrike", "Recovery"], "to": "PostureBreak", "guard": "ctx.sentinel.posture >= 100 && !ctx.cycle.askedThisCycle && !ctx.score.lostCause", "priority": 1 }
  ],

  "initialState": "ControlsBriefing",

  "states": {
    "ControlsBriefing": {
      "kind": "gate",
      "timescale": 0,
      "simTicks": 0,
      "input": "ui",
      "sentinel": "dormant",
      "rules": { "cards": 3, "dwellMsPerCard": 3000, "dwellF": 180, "trainingSkipHoldMs": 2000, "pointerLockTimeoutF": 30, "enterButton": { "en": "Enter the Cistern", "ar": "ادخل الجُبّ" } },
      "enter": [
        { "api": "bossStatus" },
        { "emit": "boss_briefing_shown", "payload": { "visit": "ctx.briefing.visit", "device": "ctx.device", "triesLeft": "ctx.battle.triesLeft", "lang": "ctx.lang" } }
      ],
      "exit": [
        { "emit": "boss_briefing_confirmed", "payload": { "device": "ctx.device", "trainingCompleted": "ctx.briefing.trainingCompleted" } },
        { "dissolveOverlayF": 18 }
      ],
      "audio": [],
      "vfx": [{ "dormantHead": "half-buried, no animation" }],
      "edu": ["rehearse Parry, Dash, Jump on the Training Post", "practice question never calls /check"],
      "transitions": [
        { "to": "@lockoutPanel", "guard": "ctx.api.bossStatus.status == 429", "priority": 0 },
        { "to": "@boss2dFallback", "guard": "!ctx.webgl.ok", "priority": 0 },
        { "to": "Idle", "guard": "ctx.briefing.confirmed && (ctx.pointerLock.ok || ctx.pointerLock.cursorSteer || ctx.device != 'kbm')", "priority": 1 }
      ]
    },

    "Idle": {
      "kind": "wait",
      "timescale": 1.0,
      "input": "combat",
      "holdBeforeFirstVerseF": { "attemptStart": 240, "afterJudgement": 240, "afterPhaseShift": 60, "afterReprisalFromBlurClear": 360 },
      "enter": [
        { "if": "ctx.attempt.firstIdle", "do": [{ "vfx": "nameplateBurnsIntoFlagstones", "frames": 90 }, { "audio": "W1", "atF": 30, "fadeOutAtTelegraphF": 12 }] },
        { "if": "ctx.verse.index == 0", "do": [{ "clear": "cycle.askedThisCycle" }] }
      ],
      "exit": [],
      "audio": [{ "stems": "phase stems; cajon on quarter notes, chain-click on the lattice" }],
      "vfx": [{ "breath": "trunk swell 3 percent over f0-f120, dust exhale at f120" }, { "beatRing": "contracts 3.0 to 0.4 degrees per 60 f" }],
      "edu": [],
      "transitions": [
        { "to": "Telegraph", "guard": "ctx.verse.nextT0Reached && !ctx.score.lostCause", "priority": 2 },
        { "to": "Burrow", "guard": "ctx.score.lostCause && ctx.review.burrowDue && ctx.score.answered < 6", "priority": 2 },
        { "to": "Endures", "guard": "ctx.score.lostCause && ctx.score.answered == 6", "priority": 3 }
      ]
    },

    "Telegraph": {
      "kind": "attack",
      "timescale": 1.0,
      "input": "combat",
      "durationF": "attack.windUpF, plus the feint stall when the variant has one",
      "enter": [
        { "set": "attack", "from": "VerseDirector.next" },
        { "scheduleCues": "attack.cues, anchored to T0 or to Impact; Quickened and Chastened keep each cue's distance from Impact" },
        { "if": "ctx.verse.attackInVerse == 1", "do": [{ "increment": "verse.index" }] }
      ],
      "exit": [],
      "audio": ["C01 chain-click at T0 and Impact", "attack-specific cue per attacks[*].cues"],
      "vfx": ["attack-specific tell: bronze gleam (Parry), crimson (Dash), ochre ridge (Jump), geyser ring (Breach)", "Parry-now flash on cycle 1 verses V1 and V2 only (ting f36 to f66), suppressed once a Parry has landed on this boss"],
      "camera": "tremor ramps only (S1-capped), no hit shake",
      "edu": [],
      "transitions": [
        { "to": "PostureBreak", "guard": "ctx.sentinel.posture >= 100 && !ctx.cycle.askedThisCycle && !ctx.score.lostCause", "priority": 1, "note": "a Break cancels the pending strike" },
        { "to": "ActiveStrike", "guard": "ctx.state.frame >= ctx.attack.impactF", "priority": 2 }
      ]
    },

    "ActiveStrike": {
      "kind": "attack",
      "timescale": 1.0,
      "input": "combat",
      "durationF": "attack.activeF; multi-hit attacks (VGL Echo Slam, DSR Twin Ridge) span first Active start to last Active end",
      "enter": [
        { "resolve": "hitResolution" },
        { "shakeBy": "attack.shake[outcome]" },
        { "hitStopF": "3 on a landed hit or parry, 6 on a Perfect Parry" }
      ],
      "exit": [],
      "audio": ["C12 impact, geyser flutter or parry clash"],
      "vfx": ["sparks on parry (40-60), sand or ichor splatter per Module 2 section 1.3"],
      "edu": [],
      "transitions": [
        { "to": "PostureBreak", "guard": "ctx.sentinel.posture >= 100 && !ctx.cycle.askedThisCycle && !ctx.score.lostCause", "priority": 1 },
        { "to": "Recovery", "guard": "ctx.state.frame >= ctx.attack.activeEndF", "priority": 2 }
      ]
    },

    "Recovery": {
      "kind": "attack",
      "timescale": 1.0,
      "input": "combat",
      "durationF": "attack.recoveryF, or recoveryParriedF when the outcome was parried",
      "enter": [{ "set": "sentinel.neckExposed", "value": true }],
      "exit": [{ "set": "sentinel.neckExposed", "value": false }],
      "audio": ["chain-click continues on the lattice"],
      "vfx": ["soft neck pulses golden once per 60 f", "ichor streak on neck hits, sparks on other parts"],
      "edu": [],
      "transitions": [
        { "to": "PostureBreak", "guard": "ctx.sentinel.posture >= 100 && !ctx.cycle.askedThisCycle && !ctx.score.lostCause", "priority": 1 },
        { "to": "Burrow", "guard": "ctx.state.frame >= ctx.attack.recoveryDurationF && ctx.verse.index == 6 && ctx.verse.isLastAttack && ctx.sentinel.posture < 100 && !ctx.cycle.askedThisCycle", "priority": 2 },
        { "to": "Telegraph", "guard": "ctx.sentinel.phase == 2 && ctx.verse.nextT0Reached", "priority": 3, "note": "Closing Neck: the Recovery ends here and the neck window closes" },
        { "to": "Idle", "guard": "ctx.state.frame >= ctx.attack.recoveryDurationF", "priority": 4 }
      ]
    },

    "PostureBreak": {
      "kind": "questionTrigger",
      "name": { "en": "Penitent Contemplation", "ar": "تَأَمُّلُ التَّائِبِ" },
      "timescale": 1.0,
      "durationF": 6,
      "input": "none",
      "enter": [
        { "hitStop": "plays first and is not counted" },
        { "set": "question.trigger", "value": "posture_break" },
        { "discard": "buffered combat input" }
      ],
      "exit": [],
      "audio": ["one bridle-bell toll", "stop cajon and chain-click; halt the music transport"],
      "vfx": ["head snaps up and back, mandible slack"],
      "camera": { "shake": "none until the crash" },
      "edu": [],
      "transitions": [
        { "to": "QuestionActive", "guard": "ctx.state.frame >= 6 && (!ctx.player.airborne || ctx.state.waitedF >= 44)", "priority": 1, "note": "ease-in waits for landing, at most 44 f; dash velocity is damped over the 12 R drop" }
      ]
    },

    "Burrow": {
      "kind": "questionTrigger",
      "name": { "en": "Subterranean Hover", "ar": "التَّحْوِيمُ الجَوْفِيُّ" },
      "timescale": 1.0,
      "durationF": 48,
      "input": "combat",
      "enter": [
        { "heal": "vigor", "amount": 20, "cap": 100, "unless": "ctx.score.lostCause" },
        { "set": "question.trigger", "value": "hover" },
        { "funnel": { "spawnF": 30, "aheadM": 2.2, "widthM": 4.0, "lookPitchBiasDeg": -8 } }
      ],
      "exit": [{ "fadeWhispers": 12 }],
      "audio": ["C08 38 Hz rumble panned to the funnel azimuth", "W1 at f30 and W2 at f270 on the orbit clock; hard-faded when QuestionActive begins"],
      "vfx": ["body arcs into the sand; S2 Thud at f24 as the mass passes under the flagstones", "amber beads flare at the mend"],
      "camera": { "shake": "S2 at f24" },
      "edu": [],
      "transitions": [
        { "to": "QuestionActive", "guard": "ctx.state.frame >= 48 && (!ctx.player.airborne || ctx.state.waitedF >= 44)", "priority": 1 }
      ]
    },

    "QuestionActive": {
      "kind": "question",
      "timescale": "0.15 after the 12 R ease-in",
      "movement": "suspended",
      "damageSourcesLive": false,
      "input": "answerCross",
      "enter": [
        { "set": "cycle.askedThisCycle", "value": true },
        { "timescaleCurve": "easeIn", "frames": 12 },
        { "camera": { "eyeHeightM": [1.65, 1.35], "overR": 30 } },
        { "grade": { "exposureEv": -0.4, "saturation": -0.2, "overR": 12 } },
        { "fadeDecalsR": 18 },
        { "fadeVignette": { "from": 0.55, "to": 0.15, "ifPhase": 2 } },
        { "hide": "beatRing" }
      ],
      "exit": [],
      "substates": {
        "Prelude": {
          "durationR": 132,
          "steps": [
            { "fromR": 12, "toR": 42, "ev": "tablet gathers from golden dust 2.2 m ahead" },
            { "fromR": 42, "toR": 102, "ev": "stem burns in line by line; line time = 60 / lines" },
            { "fromR": 102, "toR": 132, "ev": "answer stones rise top, right, bottom, left; 6 R apart, 12 R each" }
          ],
          "next": "Open"
        },
        "Open": {
          "enter": [{ "emit": "question_presented", "payload": { "questionId": "ctx.question.id", "trigger": "ctx.question.trigger", "cycle": "ctx.cycle.index", "phase": "ctx.sentinel.phase" } }, { "lightIncense": true }],
          "clockR": "question.clockFormulaRealFrames",
          "inputs": "question.answerMap",
          "next": { "pressed": "Sealed", "clockExpired": "Expired" }
        },
        "Sealed": {
          "durationR": 160,
          "enter": [{ "stopClock": true }, { "lockInput": true }, { "api": "check", "choiceIndex": "ctx.question.sealedIndex" }, { "viewmodel": "right arm draws the Veiled Blade back; other stones dim to 30 percent" }],
          "weighingHold": "if no result at R160, hold the full-draw pose while attempts continue to 5.0 s",
          "silentOverlay": { "en": "The sands are silent", "ar": "الرِّمَالُ صَامِتَةٌ", "retry": "press on the sealed stone; Esc offers Leave the cistern with no try lost" }
        },
        "Expired": {
          "durationR": 160,
          "enter": [{ "ev": "incense gutters; tablet text fades from the bottom" }, { "api": "check", "choiceIndex": -1 }]
        }
      },
      "audio": ["music crossfades to the pulseless Contemplation bed on D Phrygian dominant", "world SFX rate follows timescale to a floor of 0.4, low-pass 12 kHz to 700 Hz", "incense tick real-time, 1.2 kHz, centred"],
      "vfx": ["frozen close-up debris at 15 percent speed", "stone tablet, answer cross, forearm key-cap glyphs, incense timer"],
      "camera": { "kneelEyeHeightM": 1.35 },
      "edu": ["question_presented at Tablet Ready", "latencyMs measured from Tablet Ready to the seal", "aria-live mirror of the question text, no answers leaked"],
      "transitions": [
        { "to": "Judgement", "guard": "ctx.question.result.ready && ctx.question.result.isCorrect && ctx.state.commitDone", "priority": 1 },
        { "to": "Reprisal", "guard": "ctx.question.result.ready && !ctx.question.result.isCorrect && ctx.state.commitDone", "priority": 1 }
      ]
    },

    "Judgement": {
      "kind": "resolution",
      "name": { "en": "Judgement Strike", "ar": "ضَرْبَةُ الحُكْمِ" },
      "timescale": "stays 0.15 through the thrust; restore begins at R66",
      "durationR": 84,
      "origin": "R0 = S160, the frame the correct result is applied",
      "enter": [
        { "emit": "question_answered", "payload": { "questionId": "ctx.question.id", "choiceIndex": "ctx.question.sealedIndex", "latencyMs": "ctx.question.latencyMs", "timedOut": false, "correct": true } },
        { "increment": "score.answered" },
        { "increment": "score.correct" },
        { "if": "ctx.score.answered == ctx.score.total", "do": [{ "api": "submit" }] }
      ],
      "reviewVariant": { "when": "ctx.score.lostCause", "plays": "soft golden-dust ripple only; no Seal change, no Posture change, no Chastened; the timescale restore still runs R0-R18" },
      "timelineR": [
        { "r": 0, "ev": "chosen stone ignites gold; the other three crack and fall (R0-R11)" },
        { "r": 0, "toR": 59, "ev": "thrust travel, 9 W / 0.15 = 60 R; camera lunges 1.2 m" },
        { "r": 60, "ev": "contact with the eye; hit-stop 6 R; shake S3; 800 golden dust and 400 ichor particles" },
        { "r": 66, "ev": "restore begins (18 R); Seal n shatters", "emit": "seal_broken", "payload": { "n": "ctx.score.correct", "source": "judgement" } },
        { "r": 66, "ev": "Posture set to 45; Chastened Rhythm armed for 2 attacks" },
        { "r": 84, "ev": "timescale 1.0; the explanation is not shown on a correct answer" }
      ],
      "variants": {
        "postureBreak": { "target": "near eye of the head on the flagstones, 1.0 m above stone", "camera": { "forwardM": 1.2, "pitchDeg": -8 }, "blade": "one-handed forward thrust" },
        "hover": { "target": "pale eye in the funnel, 0.1 m below the lip", "camera": { "forwardM": 1.2, "eyeHeightM": [1.35, 0.9], "pitchDeg": [0, -62] }, "blade": "two-handed plunging thrust" }
      },
      "audio": ["golden chime tail", "Phase II stems fade in at music restart when entering PhaseShift"],
      "vfx": ["black ichor and golden dust splash; sun elevation drops 3 degrees per broken Seal"],
      "edu": ["seal_broken", "explanation withheld; the student was right"],
      "transitions": [
        { "to": "PhaseShift", "guard": "ctx.state.done && ctx.score.correct == 3 && ctx.sentinel.phase == 1 && !ctx.score.lostCause", "priority": 1 },
        { "to": "Execution", "guard": "ctx.state.done && ctx.score.answered == 6 && ctx.submit.ready && ctx.submit.passed", "priority": 2 },
        { "to": "Endures", "guard": "ctx.state.done && ctx.score.answered == 6 && ctx.submit.ready && !ctx.submit.passed", "priority": 2 },
        { "to": "Idle", "guard": "ctx.state.done && ctx.score.answered < 6", "priority": 3 }
      ]
    },

    "Reprisal": {
      "kind": "resolution",
      "name": { "en": "Tail Reprisal", "ar": "قِصَاصُ الذَّنَبِ" },
      "timescale": "snaps to 1.0 within 3 f",
      "durationF": 60,
      "origin": "f0 = S160, the frame the wrong or time-out result is applied",
      "enter": [
        { "emit": "question_answered", "payload": { "questionId": "ctx.question.id", "choiceIndex": "ctx.question.sealedIndex", "latencyMs": "ctx.question.latencyMs", "timedOut": "ctx.question.timedOut", "correct": false } },
        { "increment": "score.answered" },
        { "increment": "score.wrong" },
        { "if": "ctx.score.wrong >= 2", "do": [{ "set": "score.lostCause", "value": true }] },
        { "if": "ctx.score.answered == ctx.score.total", "do": [{ "api": "submit" }] }
      ],
      "reviewVariant": { "when": "ctx.score.lostCause", "plays": "the tail still plays as the consequence of the answer but with damage 0 and no Quickened; in later review questions a wrong answer shows only the explanation, with no tail" },
      "timelineF": [
        { "f": 0, "ev": "timescale 0.15 to 1.0 over 3 f; the chosen stone cracks black" },
        { "f": 3, "ev": "TR T0; tail rises into the lower-left of the frame" },
        { "f": 15, "toF": 20, "ev": "TR Active; Vigor loss; hit-stop 3; Posture set to 0; shake S5 (45 f); concussion begins" },
        { "f": 60, "ev": "control returns (stagger ends)" },
        { "f": 255, "ev": "blur clears; correct answer and explanation write themselves on the flagstones" }
      ],
      "damage": { "base": 30, "mercy": 15, "lostCause": 0, "finalPassingRun": "cap so Vigor stays at least 1" },
      "afterEffects": { "quickenedAttacks": 3, "unless": ["mercy", "lostCause"], "concussion": "attacks.TR.concussion" },
      "audio": ["C11 tail whoosh", "2.8 kHz tinnitus for 240 f, cut 12 dB under any P1 cue"],
      "vfx": ["heavy splatter", "6 px blur, 8 px double-vision offset for 240 f; heat distortion suppressed"],
      "camera": { "shake": "S5, never tiered down" },
      "edu": ["explanation delivered only after the blur clears", "Lost-Cause declared when the second check result arrives"],
      "transitions": [
        { "to": "Execution", "guard": "ctx.state.done && ctx.score.answered == 6 && ctx.submit.ready && ctx.submit.passed", "priority": 1, "note": "Execution waits for the concussion and the 360 R Reading Grace" },
        { "to": "Endures", "guard": "ctx.state.done && ctx.score.answered == 6 && ctx.submit.ready && !ctx.submit.passed", "priority": 1 },
        { "to": "Idle", "guard": "ctx.state.done && ctx.score.answered < 6", "priority": 2 }
      ]
    },

    "PhaseShift": {
      "kind": "cinematic",
      "timescale": 1.0,
      "durationF": 180,
      "damageSourcesLive": false,
      "enter": [
        { "emit": "phase_shift" },
        { "set": "sentinel.phase", "value": 2 },
        { "set": "arena.dustStorm", "value": "builds 0 to full over 180 f" }
      ],
      "exit": [],
      "audio": ["Phase II stems restart at the 240 f breather mark", "storm bed band-limited 150-1800 Hz"],
      "vfx": ["three collar plates shear off and fall", "ribbon drips double", "storm vignette opacity 0.55, peripheral visibility about 70 percent"],
      "camera": { "shake": "S2 as each plate falls" },
      "edu": ["phase_shift"],
      "transitions": [
        { "to": "Idle", "guard": "ctx.state.frame >= 180", "priority": 1 }
      ]
    },

    "Execution": {
      "kind": "cinematic",
      "name": { "en": "The Fatal Execution", "ar": "الضَّرْبَةُ القَاضِيَةُ" },
      "timescale": 1.0,
      "durationF": 1020,
      "durationMs": 17000,
      "damageSourcesLive": false,
      "failable": false,
      "entry": {
        "requires": "ctx.score.answered == 6 && ctx.submit.passed",
        "from": { "Judgement": "starts at the end of the restore (R84)", "Reprisal": "waits for the 240 f concussion plus the 360 R Reading Grace" },
        "sealsRemaining": "6 - ctx.score.correct",
        "anchor": "nearest Surfacing Anchor to the player's azimuth; jaw chain loop 3.0 m ahead at 1.2 m height; head at 1.7 m"
      },
      "camera": { "base": "scripted track, FOV deltas relative to the player's FOV setting", "lookLeashDeg": { "yaw": 12, "pitch": 8 }, "lookLeashStrikeDeg": { "yaw": 6, "pitch": 4 }, "reducedMotion": "shake 0, FOV deltas halved, roll off" },
      "segments": [
        { "id": "E1", "name": "The Hush", "fromF": 0, "toF": 119, "beats": 2 },
        { "id": "E2", "name": "The Approach", "fromF": 120, "toF": 299, "beats": 3 },
        { "id": "E3", "name": "The Grapple", "fromF": 300, "toF": 419, "beats": 2 },
        { "id": "E4", "name": "The Wrench", "fromF": 420, "toF": 599, "beats": 3 },
        { "id": "E5", "name": "The Drive", "fromF": 600, "toF": 719, "beats": 2 },
        { "id": "E6", "name": "The Burst", "fromF": 720, "toF": 839, "beats": 2 },
        { "id": "E7", "name": "The Quiet", "fromF": 840, "toF": 1019, "beats": 3 }
      ],
      "cameraTrack": [
        { "f": 0, "eyeM": 1.65, "pitchDeg": 0, "fovDeltaDeg": 0 },
        { "f": 120, "eyeM": 1.65, "pitchDeg": -2, "fovDeltaDeg": 0 },
        { "f": 240, "eyeM": 1.65, "pitchDeg": -4, "fovDeltaDeg": -2 },
        { "f": 360, "eyeM": 1.55, "pitchDeg": -8, "fovDeltaDeg": -4, "leanForwardM": 0.5 },
        { "f": 456, "eyeM": 1.50, "pitchDeg": -13, "fovDeltaDeg": -6 },
        { "f": 516, "eyeM": 1.45, "pitchDeg": -18, "fovDeltaDeg": -8 },
        { "f": 576, "eyeM": 1.40, "pitchDeg": -23, "fovDeltaDeg": -10 },
        { "f": 660, "eyeM": 1.40, "pitchDeg": -23, "fovDeltaDeg": -14 },
        { "f": 719, "eyeM": 1.38, "pitchDeg": -26, "fovDeltaDeg": -16 },
        { "f": 726, "eyeM": 1.38, "pitchDeg": -24, "fovDeltaDeg": 2 },
        { "f": 780, "eyeM": 1.40, "pitchDeg": -20, "fovDeltaDeg": 0 },
        { "f": 840, "eyeM": 1.45, "pitchDeg": -35, "fovDeltaDeg": 0 },
        { "f": 899, "eyeM": 1.55, "pitchDeg": -10, "fovDeltaDeg": -6 },
        { "f": 930, "eyeM": 1.65, "pitchDeg": -10, "fovDeltaDeg": 0 },
        { "f": 1019, "eyeM": 1.65, "pitchDeg": -32, "fovDeltaDeg": 0 }
      ],
      "shakeEvents": [
        { "f": 360, "preset": "S1" }, { "f": 456, "preset": "S1" }, { "f": 516, "preset": "S2" },
        { "f": 576, "preset": "S3" }, { "f": 660, "preset": "S3" }, { "f": 720, "preset": "S4" }
      ],
      "hitStops": [{ "f": 660, "frames": 6 }],
      "agency": {
        "failable": false,
        "pull": {
          "prompt": { "en": "Hold Guard to pull", "ar": "اضغط مطوّلًا على الاحتراس للسحب", "showFromF": 390, "untilF": 599, "glyphOn": "left forearm wrap" },
          "heaves": [{ "startF": 420, "endF": 455 }, { "startF": 480, "endF": 515 }, { "startF": 540, "endF": 575 }],
          "rule": "A heave plays its strained variant when Guard is held on its start frame +1; otherwise the auto variant. Both reach the same head pose.",
          "strainedAdds": ["arm tremor", "camera roll 0.5 degrees at 8 Hz", "pad rumble 0.3 for 36 f", "a brighter chain-click"],
          "telemetry": "execution.pullHeaves"
        },
        "drive": {
          "prompt": { "en": "Press Slash to drive", "ar": "اضغط الضربة للطعن", "showFromF": 570, "untilF": 659, "glyphOn": "right forearm wrap" },
          "rule": "Any Slash press in f570-f659 sets driveCommitted. The thrust launches at f636 and lands at f660 regardless.",
          "committedAdds": ["brighter armed flash", "second pad pulse", "seam light +30 percent"],
          "telemetry": "execution.drove"
        },
        "noInput": "auto-completes with the base variants at identical frames"
      },
      "skip": {
        "allowedWhen": "ctx.flags.executionSeen",
        "flag": "localStorage anees.boss5.execSeen.<userId>, written at f840, wrapped in try/catch; unavailable storage means no skip",
        "input": { "kbm": "hold Space", "pad": "hold A", "touch": "hold the small button" },
        "holdF": 120,
        "holdFreeAlternative": "press twice within 2000 ms",
        "promptAppearsAfterF": 30,
        "availableFromF": 0,
        "availableUntilF": 839,
        "targetF": 840,
        "transition": { "fadeOutF": 12, "blackHoldF": 6, "fadeInF": 12 },
        "fastForward": "run every effect and telemetry event with f <= 840 in order without rendering, then pose the world as at f840"
      },
      "effects": [
        { "f": 0, "ev": "hideSealEcho", "overF": 30 },
        { "f": 0, "ev": "relocateToMark", "dipF": { "fadeOut": 8, "hold": 6, "fadeIn": 16 } },
        { "f": 722, "ev": "sealBreak", "if": "ctx.execution.sealsRemaining == 1", "emit": "seal_broken", "payload": { "n": 6, "source": "execution" } },
        { "f": 804, "ev": "relicInPalm", "set": "ctx.relic.cardPending", "value": "ctx.submit.relicsGranted.length > 0" },
        { "f": 840, "ev": "writeExecutionSeenFlag" }
      ],
      "timeline": {
        "viewmodel": [
          { "f": 0, "clip": "lowGuardIdle" },
          { "f": 90, "clip": "leftFingersFlex" },
          { "f": 120, "clip": "processionGait", "footfallsF": [120, 180, 240] },
          { "f": 270, "clip": "leftForearmRaise" },
          { "f": 300, "clip": "leftReach", "extensionM": 0.7 },
          { "f": 360, "clip": "leftGrip" },
          { "f": 420, "clip": "leftHeave", "beats": 3, "fistHeightM": [1.2, 0.9] },
          { "f": 600, "clip": "rightDraw" },
          { "f": 630, "clip": "armedFlash" },
          { "f": 636, "clip": "rightThrust", "travelF": 24 },
          { "f": 666, "clip": "bladeSeat", "frames": 24 },
          { "f": 720, "clip": "braceAndSealBurst" },
          { "f": 780, "clip": "leftOpenChainRuns" },
          { "f": 800, "clip": "bladeWithdraw" },
          { "f": 804, "clip": "beadInPalm" },
          { "f": 840, "clip": "beadRaise" },
          { "f": 930, "clip": "beadToRosary" },
          { "f": 990, "clip": "beadOnCord" }
        ],
        "sentinel": [
          { "f": 0, "clip": "yieldPose", "headHeightM": 1.7, "distanceM": 3.0 },
          { "f": 60, "clip": "headTurn", "yawDeg": 20 },
          { "f": 240, "clip": "bitRattle" },
          { "f": 300, "clip": "firstBreath" },
          { "f": 360, "clip": "jawGroan" },
          { "f": 420, "clip": "wrench", "headHeightsM": [1.7, 1.467, 1.233, 1.0], "heaveF": 36, "holdF": 24, "noseDownDeg": 35 },
          { "f": 576, "clip": "platesPart", "gapM": 0.18 },
          { "f": 580, "clip": "pilgrimGlint" },
          { "f": 660, "clip": "glintDims", "untilF": 689 },
          { "f": 690, "clip": "stillness" },
          { "f": 720, "clip": "seamOpens", "gapM": [0.18, 0.5] },
          { "f": 780, "clip": "crumble", "segments": 12, "everyF": 5, "untilF": 839 }
        ],
        "vfx": [
          { "f": 0, "ev": "stormCollapse", "vignette": [0.55, 0], "overF": 60 },
          { "f": 0, "ev": "sunDescent", "elevationDeg": [4, 0], "untilF": 720 },
          { "f": 660, "ev": "ichorDrops", "count": 8 },
          { "f": 690, "ev": "seamLightRamp", "opacity": [0.25, 0.6], "untilF": 719 },
          { "f": 720, "ev": "burst", "particles": { "goldenDust": 1000, "ichor": 600, "screenDroplets": 200 }, "whiteout": { "peakOpacity": 0.55, "rampF": 12, "decayF": 48 }, "visorDecals": { "ichor": 12, "goldFlecks": 6 }, "singleRampNoStrobe": true },
          { "f": 780, "ev": "chitinToPaleSand" },
          { "f": 840, "ev": "firstDrip" },
          { "f": 870, "ev": "springsOpen", "count": 12, "anchorRadiusM": 7.0, "radiusM": [0, 0.6], "untilF": 1019 },
          { "f": 899, "ev": "beadStarGlint", "rampF": 12 },
          { "f": 960, "ev": "allIchorDecalsGone" }
        ],
        "audio": [
          { "f": 0, "cue": "musicRestart", "stems": ["oud D2 and A2"], "gainDb": -8, "note": "bar 1; no cajon, no guitar" },
          { "f": 30, "cue": "W2", "durationF": 180, "mono": true, "pannerBypass": true, "dbfs": -24, "fadeF": 12 },
          { "f": 120, "cue": "footfall", "everyF": 60, "count": 3 },
          { "f": 360, "cue": "C01", "note": "first true chain-click since the question; head-locked left" },
          { "f": 370, "cue": "brassGroan", "hz": 73.4 },
          { "f": 420, "cue": "C01", "everyF": 60, "count": 3 },
          { "f": 480, "cue": "cajonBassTone", "everyF": 60, "untilF": 689, "gainDb": -8 },
          { "f": 576, "cue": "plateGrind", "untilF": 599 },
          { "f": 580, "cue": "pilgrimTone", "hz": 880, "dbfs": -20, "untilF": 689 },
          { "f": 636, "cue": "clothWhoosh" },
          { "f": 660, "cue": "bladeIn", "layers": ["tileCrack", "C01"] },
          { "f": 690, "cue": "dropout", "mutes": ["oud", "cajon", "chain"], "keeps": ["sub38Hz"], "sub38RiseDbfs": [-30, -12], "untilF": 719 },
          { "f": 720, "cue": "burst", "layers": ["bronzeBowlD3", "dustHiss", "ichorPatter"] },
          { "f": 720, "cue": "oudF#2", "hz": 92.5, "note": "drone lifts to D major: D2 73.42, F#2 92.50, A2 110.00" },
          { "f": 722, "cue": "waxCrack", "khz": 1.8 },
          { "f": 780, "cue": "chainRun", "clicks": 24, "lastF": 839, "spacingF": [1, 4] },
          { "f": 780, "cue": "sub38Descend", "untilF": 839 },
          { "f": 804, "cue": "beadTick" },
          { "f": 840, "cue": "guitarNote", "notes": [{ "f": 840, "hz": 146.83 }, { "f": 900, "hz": 185.0 }, { "f": 960, "hz": 220.0 }] },
          { "f": 840, "cue": "waterDrip" },
          { "f": 870, "cue": "springs", "emitters": 3 },
          { "f": 990, "cue": "beadOnCordClick" },
          { "f": 1019, "cue": "holdChord" }
        ]
      },
      "aftermath": {
        "water": {
          "pitFloorYM": -6.0,
          "startF": 780,
          "riseMetresPerSec": 0.095,
          "riseMetresPerF": 0.0015833,
          "yAtF1019M": -5.62,
          "brimYM": -0.3,
          "fullAfterF": 3600,
          "continuesUnderResultsScreen": true,
          "audio": "3 HRTF emitters: pit, left springs, right springs"
        },
        "replays": "framed as the cistern remembering (Codex 1); same cinematic, no relic card"
      },
      "handoff": {
        "atF": 1020,
        "submitDeadlineF": 900,
        "ifSubmitMissing": "hold the f899 pose; retry with backoff over a still frame",
        "sequence": ["relicCard when relicsGranted is non-empty", "resultsScreen"],
        "resultsFields": ["passed", "correctCount", "total", "xpEarned", "results[]", "battle", "leveledUp", "newPlayerLevel"],
        "xp": { "firstDefeat": 300, "replay": 0 },
        "fadeInF": 24,
        "canvasKeepsRunning": true
      },
      "edu": ["seal_broken when one Seal remains", "boss_result with the execution additive block", "results[] lists each missed question with its explanation"],
      "transitions": [
        { "to": "@relicCardThenResults", "guard": "ctx.state.frame >= 1020 && ctx.submit.ready", "priority": 1 }
      ]
    },

    "Endures": {
      "kind": "cinematic",
      "name": { "en": "The Sentinel Endures", "ar": "الحَارِسُ البَاقِي" },
      "timescale": 1.0,
      "durationF": 360,
      "damageSourcesLive": false,
      "enter": [{ "if": "ctx.submit.pending", "do": [{ "holdStillFrame": true }] }],
      "timelineF": [
        { "f": 0, "ev": "light turns pale; the storm clears; HUD stays hidden" },
        { "f": 60, "ev": "the head withdraws into the sand, unhurried" },
        { "f": 180, "ev": "sand closes over the pit; ribbons weep gold" },
        { "f": 300, "ev": "stillness; the lamp at the Mihrab Arch burns steady" },
        { "f": 360, "ev": "hand-off to the results screen: missed questions with explanations, tries left, lockout countdown if any" }
      ],
      "audio": ["oud drone D2 and A2 only", "no whisper, no tinnitus, no cajon"],
      "vfx": ["no violence, no shaming copy"],
      "edu": ["boss_result", "results[] explanations lead the screen", "no relic card"],
      "transitions": [
        { "to": "@resultsScreen", "guard": "ctx.state.frame >= 360 && ctx.submit.ready", "priority": 1 }
      ]
    },

    "PlayerFall": {
      "kind": "recovery",
      "name": { "en": "Penitent's Fall", "ar": "سَقْطَةُ التَّائِبِ" },
      "timescale": 1.0,
      "durationF": 150,
      "consumesTry": false,
      "enter": [
        { "increment": "player.falls" },
        { "emit": "player_fall", "payload": { "n": "ctx.player.falls" } },
        { "sepiaFadeOutF": 90 }
      ],
      "timelineF": [
        { "f": 90, "ev": "respawn at the south flagstones, radius 8.0 m, azimuth 180 degrees, facing north" },
        { "f": 90, "ev": "Vigor 100, Breath 100, Posture 0; verse counter restarts; pending Chastened and Quickened cleared; answered questions stay final" },
        { "f": 90, "toF": 149, "ev": "sepia fades in" }
      ],
      "exit": [{ "if": "ctx.player.falls == 2 && !ctx.mercy.offered", "do": [{ "offer": "mercyMode" }, { "emit": "mercy_mode", "payload": { "accepted": "ctx.mercy.accepted" } }] }],
      "audio": ["music low-passed during the fade"],
      "vfx": ["all decals cleared instantly"],
      "edu": ["a pending explanation from a fatal Reprisal is written at the respawn point"],
      "transitions": [
        { "to": "Idle", "guard": "ctx.state.frame >= 150 && !ctx.mercy.offerOpen", "priority": 1 }
      ]
    }
  }
}
```

#### Front-end implementation notes

- **Fixed-step loop.** One `requestAnimationFrame` accumulator: `acc += realDt × timescale`; while `acc ≥ 1/60`, run `sim.step()`, at most 5 catch-up steps, `realDt` clamped to 100 ms after tab switches. Hit-stop skips `sim.step()` for 3 or 6 iterations but not the shake clock, which advances on `realDt × timescale` (so S3 rolls out over 160 R at 0.15). UI, input sampling, the incense clock and network use real time; the audio clock is master (Module 3 §2.1). Input events carry `event.timeStamp` and are resolved to a simulation frame, so a 30 FPS display cannot quantise the 4 f Perfect window.
- **Timescale.** One value, `ts`, driven by the curves in `time.timescale` (12 R ease-in, 18 R restore, 3 f snap on Reprisal). Everything else, the Execution included, holds it at 1.0.
- **Transition evaluation.** After each `sim.step()`: gather `globalTransitions` (filtered by `from`) and the current state's `transitions`, sort by `priority`, fire the first true guard; run `exit`, then `enter`; reset `ctx.state.frame` (W-frames) and `ctx.state.frameR` (real frames). At most 3 chained zero-frame transitions per step. Guards never mutate; mutation lives in `enter`, `exit` and `timeline` hooks, which keeps replays exact.
- **Event bus.** A small typed emitter with channels `fsm`, `audio`, `vfx`, `camera`, `ui`, `telemetry`, `api`. Systems subscribe; none calls another. `/check` and `/submit` return promises whose results are written to `ctx` only at the authored frame (S160, f900), so latency never moves a frame.
- **Data and tests.** Import the JSON statically. Unit tests recompute every derived value from raw constants (parry windows, `question.table`, `relic.derived`, Quickened wind-ups, the 1,020 f segment sum) and run the window bot against each `attacks[*].phaseN.parry`; the Execution `skip` runs `timeline` with `render=false` to f840.

---

## Appendix A — Anees Integration Notes

The fight is a new presentation layer over the existing boss pipeline. Grading, XP and tries logic are not replaced.

### A.1 Roster entry and routing

`BOSS_ROSTER` (`frontend/src/lib/boss-config.ts`) keeps its level-5 entry unchanged; `BossConfig` gains one optional field:

```ts
fight3d?: 'sandworm-sentinel'; // absent = today's 2D BossArena
```

`MapPage.tsx` already opens a boss as a modal (`bossModalLevel` renders `<BossArena/>`). That slot becomes a switch: `use3d = !!config.fight3d && canUseWebGL() && !fightFlat`, with `fightFlat` local state set by the fallbacks in A.2. The 3D branch sits inside the existing `AvatarBoundary` with `<BossArena/>` as its fallback. Nothing else on the page changes.

### A.2 Lazy-loading and fallback

- `const BossFight3D = lazy(() => import('../boss3d/SandwormFight'))`, the `AdventureMap3D` pattern; three and react-three-fiber stay in the map's vendor chunk.
- The Rite (Module 0) is the loading screen; prefetch starts on boss-node hover. A 14 MB payload (C.1) at 10 Mbit/s takes 14 × 8 ÷ 10 = 11.2 s, while three cards at ≥ 3 s each hold the student for ≥ 9 s plus the first-visit Training Post, so the download normally ends during the briefing. **Enter the Cistern** stays disabled until it does.
- Fall back to the 2D `BossArena` when `canUseWebGL()` is false, the chunk fails to load, a 5 s frame probe during the briefing shows a median above 20 ms (50 FPS) at DPR 0.75 and LOD 50 %, or the student picks **Play the flat arena**, which is also the accessible route for students who cannot play real-time combat. The existing `isLowPower()` (≤ 4 cores or a narrow screen) only picks the starting LOD; as a gate it would reject laptops the probe passes.
- WebGL context lost mid-fight: pause, wait 10 s for `webglcontextrestored`, else end the attempt without `/submit`. No try is spent and the map offers the flat arena, as `AdventureMap3D` does through `onContextLost`.
- Input is timestamped on arrival and resolved to a simulation frame, so a 30 FPS display cannot quantise the 4 f Perfect window.

### A.3 Server-contract mapping

| Fight event | API call | How the response is used |
|---|---|---|
| Briefing opens | `GET /api/map/boss/5` | `questions[6]` held in order (cycle *n* asks question *n*); `battle.triesLeft` fills "Tries left: n of 3". 429 + `lockedUntil` shows Module 0's lockout panel and loads no 3D (export `lockOf` and `BattleWait` from `BossArena.tsx`; reuse `useCountdown` from `lib/battle.ts`). 403 = locked; `comingSoon` = the map's "forging" message. |
| Answer sealed (commit beat) | `POST /check {questionId, choiceIndex 0..3}` | `isCorrect` selects `Judgement` or `Reprisal`; `correctIndex` and `explanation(Ar)` wait until control returns, then appear as sand-script. Retry ×2, then "The sands are silent" with the timer paused. |
| Timer reaches 0 | `POST /check {questionId, choiceIndex: -1}` | Needs change 1 below; same flow as a wrong answer. On a 400 from an older backend, play `Reprisal` anyway and take the explanation from `/submit`. |
| Last question resolved | `POST /submit {answers[]}` | Sent during the final strike to hide latency. `answers[]` holds sealed answers only (`gradeAnswers` grades a missing one as `-1`). `passed` selects `Execution` or `Endures`; `results[]` and `xpEarned` fill the ledger; the server's `correctCount` overrides the client tally; `refreshUser()` follows, as in the 2D arena. A failed submit retries over a still frame; the payload is mirrored in `sessionStorage`. |
| Question presented, Litany of Review, fall, pause, Mercy, tab closed | `/check` only for review explanations | Telemetry otherwise; no try is spent. The client never holds a correct index. |

### A.4 Small additive backend changes

1. **`/check` accepts `-1`.** In `backend/src/routes/map.ts`, `bossCheckSchema` changes `choiceIndex: z.number().min(0).max(3)` to `.min(-1)`. `isCorrect = choiceIndex === question.correct_index` is already false for `-1`, and the explanation still returns. `bossSubmitSchema` keeps `min(0)`; omission already means unanswered.
2. **Relic persistence.** No relic storage exists (`inventory_json` belongs to Craft saves). Add `user_relics` (below) to `backend/src/db/schema.sql` as `CREATE TABLE IF NOT EXISTS`, as `battle_status` was. In `/submit`, when `passed`, run `INSERT OR IGNORE INTO user_relics …`; if `changes === 1` return `relicsGranted: ['eye_of_the_buried_pilgrim']`, else `[]`. `GET /boss/5` gains `relics: string[]` so replays apply the buffs. An idempotent backfill in `db.ts` grants the relic to users whose level-5 progress is already `completed`.
3. **Optional telemetry.** `POST /api/telemetry/boss {attemptId, events[{t, name, props}]}` behind the same `requireAuth` and `requireCsrfHeader` as the boss routes; batched, rate-limited, flushed with `fetch(…, {keepalive: true})` on `pagehide` (`sendBeacon` cannot send the CSRF header). It accepts the nine canonical events (`boss_briefing_shown` … `boss_result`), no free text, no PII beyond the session user, and stays flagged off until the privacy review (C.5).

| Column (`user_relics`) | Type | Note |
|---|---|---|
| `user_id` | INTEGER, FK `users(id)` ON DELETE CASCADE | part of PK |
| `relic_key` | TEXT | `'eye_of_the_buried_pilgrim'`; part of PK |
| `source_level` | INTEGER | `5` |
| `earned_at` | TEXT DEFAULT `datetime('now')` | |

The 2D `BossArena` ignores relics, but its victory still grants the relic server-side, so fallback players lose nothing.

### A.5 What stays untouched

`GET /boss/:n` and `/check` response shapes; the `/submit` request schema and response; `gradeAnswers`; `BOSS_PASS_RATIO` 0.7; `BOSS_DEFEAT_XP_BONUS` 300; `battle_status`, `recordBattleLoss` and the 24 h window; `boss_questions` and its seed; the `BOSS_ROSTER` values; the 2D `BossArena`. Correct answers still never leave the server before an answer arrives.

### A.6 Tries, lockout and XP

- Only a failed `/submit` on an uncleared boss calls `recordBattleLoss`; falls, pauses and abandoned attempts never do. A Litany of Review ends in `/submit`, so it costs one try; the third loss starts the 24 h lock and the next `GET` returns 429.
- The Endures screen shows `battle.triesLeft`, the countdown if locked, and the explanation of every missed question.
- First clear: 300 XP, then `leveledUp` / `newPlayerLevel` after the relic card. Replays of a cleared boss award 0 XP, are never locked (`waitingForBattle` returns false once `completed`) and never record a loss: free practice, with the relic active.

## Appendix B — Accessibility, Wellbeing and Content Notes

### B.1 Motion comfort

Base FOV is 90° (slider 70–110); camera shake 0–100 %; invert-Y; a head-bob toggle, off by default (the viewmodel sways instead). The Rite asks once, "Does a moving view make you dizzy?"; Yes sets shake 40 %, FOV 100 and a dash comfort-vignette. `prefers-reduced-motion` defaults shake to 25 % and swaps heat-shimmer refraction for a static vignette, so the Phase II visibility rule is unchanged. Presets scale linearly with the slider: at 50 %, `S1` 0.2°, `S2` 0.6°, `S3` 1.5°, `S4` 2.25° + ±2.5° roll, `S5` 3.0° + 5° roll; at 0 % all are 0.

At 0 % the hit-stop (3 f; 6 f on a Perfect Parry), audio and sparks remain, so feedback survives. The arch line holds a stable horizon during shake.

### B.2 Photosensitivity

No more than 3 flashes in any 1 s (WCAG 2.3.1); nothing pulses faster than 2 Hz, the eighth-note grid (30 f = 500 ms), which also bounds Beat Ring ticks in Phase II; sparks last ≤ 3 f; the Judgement golden burst is one ramp, never a strobe; crimson ember particles emit continuously and never blink. At Beta, every cinematic and the ten densest combat seconds go through a flash analysis; the 2.8 kHz tinnitus passes through the limiter and the volume setting.

### B.3 Playing with the sound off

Each audio cue has a visual twin and a caption. The **Beat Ring** pulses on the reticle with the metronome and ticks with each chain-click; the 2.6 kHz ting has its bronze gleam; the sub-bass rumble gets an edge wedge pointing to the eruption azimuth; the `SB` dust ring appears at f54, 66 f (1100 ms) before the f120 eruption. **In Phase II the Beat Ring follows the chain-click, false click included**, so a silent player holds the same information as a hearing one; the true tell remains the head resuming motion. Captions carry both whispered lines of Module 1 (EN/AR) with a direction arrow; a mono mode replaces HRTF panning with the edge wedge.

### B.4 Colour-blind-safe telegraphs

Hue is never the only channel. Against the sand ground `#c17a3a`, ember crimson `#c4291c` measures 1.7:1 and golden dust `#e0a860` 1.6:1, and crimson, ochre and sand collapse together under red-green deficiency. Every telegraph therefore carries a 2 px+ ichor-black (`#14100d`) rim or sits on a dark surface (crimson on ichor 3.3:1, golden dust on ichor 9.0:1).

| Defence | Colour | Shape | Motion | Sound |
|---|---|---|---|---|
| Parry (`SMS`, `PCL`) | bronze gleam | star glint on the bridle bit | horizontal | 2.6 kHz ting |
| Dash (`PGC`, `VGL`) | crimson | ring with radial ticks (`VGL`), furrow line (`PGC`) | vertical | low brass drone |
| Jump (`DSR`) | ochre | crescent slump | ground ridge | chain scrape |
| Breach (`SB`) | dust and gold paper | geyser ring | rising dust | 38 Hz rumble |

QA runs protanopia, deuteranopia, tritanopia and greyscale filters on every attack at Alpha. A **Telegraph Outline** option adds a chitin-white outline.

### B.5 Motor options

Full rebinding; **Toggle Guard** (each press raises the guard, so the 10 f parry window still opens on the press); a separate **Thrust** binding for players who cannot hold; one-handed layouts; touch buttons ≥ 48 px. Optional **Confirm to seal**: the first press highlights a stone, a second seals it, costing about a second of the 40 s. Scholar Mode (×2) and Mercy Mode are reachable from the Rite and Settings without penalty.

### B.6 Reading support, RTL and the screen-reader mirror

- The tablet text sits on an **ichor-black inset** cut into the stone: golden ink `#e0a860` on tablet stone `#b9ae96` measures 1.04:1, but on `#14100d` 9.0:1. Text-size slider 100–150 %; a dyslexia-friendly Latin face option. The burn-in is cosmetic: the whole question is legible within 3 real seconds.
- Authoring cap: question plus choices ≤ 35 words. At a deliberately slow 80 words/min that is 35 ÷ 80 × 60 = 26.3 s of reading, leaving about 14 s to decide.
- RTL: the Controls Card, tablet and result screens mirror; physical geometry does not (answer cross, WASD cap labels, left-wrist beads). Numbers and operators inside Arabic sentences render left-to-right in isolates, so "4,527 − 1,234" never reverses.
- The canvas is invisible to assistive technology, so a visually hidden `aria-live="polite"` region outside it mirrors the question during `QuestionActive` only, filled from the same `questions[]` data (no answers leak):

```
EN: Question {n} of 6. {text}. Choice A: {a}. Choice B: {b}. Choice C: {c}. Choice D: {d}. Press 1 to 4 to answer.
```

<span dir="rtl" lang="ar">السُّؤَالُ {n} مِنْ 6. {text}. الخِيَارُ أ: {a}. الخِيَارُ ب: {b}. الخِيَارُ ج: {c}. الخِيَارُ د: {d}. اضْغَطْ 1 إِلَى 4 لِلْإِجَابَةِ.</span>

Time is announced at 10 s and 5 s remaining (real). Real-time melee is not screen-reader playable; the flat arena is the supported route.

### B.7 Session length and wellbeing

One fight is 6–9 minutes plus the briefing, inside one lesson slot, with natural rests after each of the six resolutions; Esc pauses at any time. After 20 cumulative in-fight minutes the between-attempt screen suggests a rest and never interrupts a fight. The Endures screen leads with what was learned and what comes next, never shaming. The lockout panel offers the Training Post (Module 0).

### B.8 Content rating and cultural care

Target self-rating: PEGI 7 / ESRB E10+ equivalent (stylised fantasy violence; black ichor, golden dust, no red blood, no human remains). The only unavoidable hit is the `TR` the student causes, and every attack opens with a telegraph of at least 54 f (900 ms) at base timing. Cultural care: all inscriptions are invented text and no Qur'anic verse appears; the kneel is a generic penitent's kneel, not the postures of ṣalāh; no adhan or recitation audio; no divine names on tiles, scrolls or weapons; gullet tilework is geometric only; Arabic is always correctly shaped; the Veiled Blade is a plain sword; guilt resolves into release (the relic), never eternal damnation. Native Arabic and Gulf cultural reviewers sign off at Beta, and the flamenco-Gulf score is composed or reviewed with musicians from both traditions.

## Appendix C — Production Plan

### C.1 Asset list and budgets

| Group | Assets | Budget |
|---|---|---|
| Sentinel | one rigged model, bridle chains, prayer ribbons; about 33 clips (every attack incl. feints and Echo Slam; crash, Burrow, phase shift, Endures, Execution) | ≤ 45k triangles; ≤ 12 draw calls |
| Viewmodel | gauntlets, linen wraps, Veiled Blade, 10-bead rosary; about 28 clips (guard, slashes, thrust, parry, dashes, jump, kneel, Judgement thrusts, fall) | ≤ 5,500 triangles; ≤ 6 draw calls (Module 2) |
| Arena | cistern floor, deep-sand ring, arches, palms, pillars, stairs (kit per Module 3), Training Post, tablet, answer stones, incense, relic | whole scene ≤ 150 draw calls |
| Textures | five atlases (Sentinel, arena, viewmodel at 256², VFX, UI/tablet), hand-painted 128–256 px tiles, nearest filtering | ≤ 2048² each; 5 × 16 MiB = 80 MiB GPU worst case (RGBA, no mipmaps) |
| VFX and audio | sparks, visor splats, geysers, ember eyes, vortex, storm mask, shimmer, dilation grade; guitar, cajón and oud stems per phase, true and false chain clicks, ting, drone, scrape, 38 Hz rumble, whispers, tinnitus (Opus) | ≤ 4,000 instanced particles; HRTF panner |
| UI and tools | Rite cards (EN/AR), key-cap glyph sets; frame-data overlay, hitbox viewer, latency probe, input-replay recorder (the fixed step makes replays exact), parry-window bot | — |

Payload target 14 MB compressed: models 3 + textures 2 + audio 7 + code 0.5 + other 1.5 = 14.

### C.2 Milestones

Week 1 starts Monday 2026-11-02. Design lock is this document.

| Milestone | Weeks | Content | Exit gate |
|---|---|---|---|
| M1 Greybox | 1–3 | Fixed-step sim, input timestamping, `SMS` with Beat Ring, Rite shell | Window bot passes: parry succeeds only for presses in `[Impact−10, Impact−1]`; 60 FPS on the reference laptop |
| M2 Vertical slice | 4–8 | Cycle 1: `SMS`, `PGC`, `VGL`, Posture, live `/check`, Judgement and Reprisal, blockout arena | One full cycle playable by 5 internal testers |
| M3 Alpha | 9–12 | All seven attacks, Phase II, six questions, Execution, relic and backend changes, a11y, EN/AR, fallback | Start-to-finish fight; playtest n = 12 |
| M4 Beta | 13–15 | Final art and mix, telemetry, tuning, flash analysis, cultural review | Two rounds, n = 30; KPIs below in range |
| M5 Release | 16 | Bug bar, performance, rollout flag | Zero crashes or softlocks; budgets met |

### C.3 KPIs and tuning targets

Per-question accuracy *p* sets the pass rate: P(≥ 5 of 6) = 6p⁵(1−p) + p⁶. A 70–80 % first-attempt pass rate therefore needs *p* of 0.82–0.86:

| *p* | 0.70 | 0.80 | 0.82 | 0.86 | 0.90 |
|---|---|---|---|---|---|
| Pass | 42.0 % | 65.5 % | 70.4 % | 80.0 % | 88.6 % |

A run fails exactly when its 2nd answer is wrong, so the fail rate equals the Litany of Review rate: 20–30 % of first fights turn into review.

| KPI | Definition | Target | Alarm | Source |
|---|---|---|---|---|
| First-attempt parry success | cycle-1 `SMS` impacts ending parried ÷ all cycle-1 `SMS` impacts | ≥ 50 % (≥ 70 % by cycle 3) | < 30 % | replay log |
| Perfect share | Perfect ÷ successful parries, first attempts (no relic) | ≥ 45 % from cycle 4 (uniform presses give 4/10 = 40 %) | < 35 % | replay log |
| Time to first Posture Break | real s from the first downbeat, cycle 1 | median 16–22 s (floor 13 s) | > 22 s | replay log |
| Break rate | cycles ended by Posture Break, not Burrow | ≥ 50 % cycle 1; ≥ 65 % later | < 30 % | `question_presented.trigger` |
| Question latency | `question_presented` to `question_answered` | median ≤ 20 s; p90 ≤ 34 s | median > 28 s | `latencyMs` |
| Time-outs | `timedOut` ÷ questions | ≤ 5 % | > 8 % | `question_answered` |
| Pass rate (grade 4–5, first attempt) | `boss_result.passed`; median `durationMs` | 70–80 %; fight 6–9 min | < 60 % or > 88 %; > 11 min | `boss_result` |
| Falls and Mercy | `player_fall` per attempt; Mercy accepted ÷ offered | falls median ≤ 1; Mercy ≤ 20 % | ≥ 3 falls in > 10 % of attempts; Mercy > 35 % | `player_fall`, `mercy_mode` |
| Performance | reference school laptop | median ≥ 58 FPS, 1 % low ≥ 45 FPS | median < 50 FPS | probe |

**Why 13 s is the floor for the first break.** A Perfect-parried `SMS` gives 25 Posture, and a 3-slash chain (3 × 28 f = 84 f) fits its 90 f recovery for 3 × 6 = 18 more: 43 per verse, 86 after verse 2 (last hit f374). The `PGC` verse offers no parry; Posture decays from f554 (374 + 180), losing 80 ÷ 60 × 4 = 5.3 by the first neck hit at f634, and a full 3-hit chain ends at 98.7. The verse-4 `SMS` Impact at f780 crosses 100: 780 f = 13.0 s. The median target runs from 16 s (end of verse 4) to 22 s; the cycle's hard limit is 24 s.

Frustration signals: 2+ falls or 3+ pauses in one cycle; leaving within 10 s of a Tail Reprisal; 6+ whiffed parries in one verse (mashing); quitting from the Rite right after an Endures screen. Two events beyond the nine in A.4, `parry_whiff` and `pause_opened`, are proposed to log them.

Playtests cover grades 4–6 on keyboard, gamepad and touch, Arabic-first and English-first, with a third of players new to action games; sessions are observed, logged and followed by an exit interview. The Training Post's calibration offset (Module 0, ±100 ms) shifts audio scheduling only, never the hit windows. The Quick-Reference values ship as defaults. Knobs to test first: feint stall 18 vs 24 f (Phase II parry whiffs), Posture carry-over 45 (break rate), Quickened ×0.8 (falls after a wrong answer), Scholar default (time-outs).

### C.4 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unfair parries on slow displays or Bluetooth pads | Timestamped input, calibration, 10 f window, Mercy +4 f |
| Integrated-GPU frame drops | Budgets in C.1, adaptive DPR 0.75–1.0, LOD 50 %, one full-screen quad for the storm, flat-arena fallback |
| Payload too heavy for school networks | 14 MB budget, prefetch on hover, the Rite as loading screen, flat-arena fallback |
| 40 s too short for reading | 35-word cap, Scholar Mode, time-out KPI |
| Pointer Lock blocked on managed devices | The Rite's Enter click is the gesture; click-to-relock; Cursor-Steer (Module 0 §0.5), the drag-look fallback |
| Pass rate below 60 % | Check *p* first (content), then Mercy thresholds, then Chastened length |
| Cultural misstep | B.8 rules, reviewer sign-off at M4 |
| `-1` change not deployed | Graceful degradation in A.3 |

### C.5 Open questions

1. **Relic and Mercy stacking.** Default proposal: additive, 10 + 4 + 4 = 18 f (300 ms); needs ratification.
2. **Abandonment.** Closing the tab spends no try, as in the 2D arena today. Default: accept; the alternative is a `POST /boss/5/begin` that records a start.
3. **Answer scouting.** `/check` returns `correctIndex`, so a student could probe it; the 2D arena has the same property. Confirm whether to rate-limit.
4. **Relic backfill** for existing level-5 clears. Default: yes (A.4).
5. **Third time tier** (×3, teacher-set) for documented accommodations. Default: no, review after Beta.
6. **Telemetry privacy.** Retention, consent and school data policy need sign-off before the flag turns on.
7. **Assets.** Whispers by a native classical-Arabic voice actor, not synthesis; gamepad glyph family detected from the device id, neutral otherwise.
