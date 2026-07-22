# Mouth Ranked — design

## Pivot

FL Studio–style DAW and sample packs were too heavy. The game is now an **a cappella remake battle**:

1. Everyone hears the same **challenge song clip** (seeded synth reference — not a licensed commercial track).
2. Players remake it using **only short recordings of their own voice** (drums / bass / melody / harmony / fx).
3. Voice clips sit on a simple **16-step grid** per role.
4. Submit → blind vote → standings.

## Why this shape

- **One clear verb:** listen → record mouth layers → arrange → submit.
- **No sample browser / mixer complexity** — the mic *is* the instrument.
- **Copyright-safe:** reference is generated from seed + genre + heat, not ripped audio.
- **Heat still matters:** higher heat requires more voice roles (harmony, fx).

## Data model

- `Challenge` — genre, bpm, key, vibe, `mustRoles`
- `Project` — `clips[]` (base64 voice) + `lanes[]` (role, steps, gain, pitch)
- Lobby DO still owns phases: `lobby` → `cookup` → `voting` → `results`

## UX budget

First cookup screen: challenge title + play song + play remake + voice lanes. No cards in the hero, no FL chrome.
