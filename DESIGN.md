# Beat Ranked DAW — FL-informed design decisions

Research basis: Image-Line Channel Rack / Piano Roll / Playlist / Mixer manuals,
Pat/Song transport behavior, Graph Editor step automation.

## What FL Studio actually centers on

1. **Patterns** — a pattern is the note/step data visible in the Channel Rack + Piano Roll.
2. **Channel Rack** — one row per sound: mute, pan, volume, channel button, step LEDs.
3. **Graph Editor** — per-step Velocity / Pan / Pitch under the selected channel.
4. **Pat vs Song** — Pat loops the current pattern; Song plays Playlist arrangement.
5. **Playlist** — place pattern clips to build the full beat.
6. **Mixer** — faders + insert FX (EQ / dynamics / space), not “one filter slider forever.”
7. **Browser** — pick/preview the pack sounds (our constrained sample set).

## Educated includes (this pass)

| Feature | Why |
|--------|-----|
| Pattern bank (8) + selector | Core FL workflow; battles need variations (drop / fill) |
| Pat / Song transport | Without this, playlist is fake |
| Channel Rack LED grid + knobs | The look + drum workflow people mean by “FL” |
| Graph editor (vel/pan/pitch) | Separates “is the step on?” from “how hard/where” |
| Mini Playlist (pattern clips) | Arrangement under time pressure |
| Browser panel | Sample audition without hunting rows |
| Mixer inserts: 3-band EQ + compress + send FX | Real mix moves voters notice |
| Piano roll with velocity lane + note length | Melodic cooks need FL-like note editing |

## Educated excludes (for now)

- VST hosting / Patcher / Edison — not viable in a fair browser battle
- 999 patterns, audio clips, automation clip objects — overkill for 3-minute rounds
- Full piano-roll stamp chords library — keep stamp to scale tones only
- Hardware MIDI learn — optional later

## Fairness rule

Everyone still gets the same seeded pack. Patterns/playlist/mixer are arrangement
and processing — not new sounds.
