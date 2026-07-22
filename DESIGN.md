# Mouth Ranked — design

## Game

A cappella remake battle: hear a seeded song clip, remake it with **mouth one-shots** you stamp on a timeline, vote blind.

## Sampler workflow (the point)

1. **Record one short sound** (~0.9s) — one kick, one hum, one note.
2. It lands in your **mouth kit** (tagged drums / bass / melody / …).
3. **Select that pad**, then tap the timeline to **copy** it wherever you want.
4. Helpers: stamp every beat / 8ths / fill / copy bar 1 across the loop.

Not: record a full loop per role. Not: FL Channel Rack.

## Data

- `VoiceClip` — one recorded one-shot (+ role)
- `Placement` — `{ clipId, step, pitch, gain }` — a copy on the timeline
- Challenge `mustRoles` → need ≥1 clip of that role **and** ≥1 placement using it

## Why

Matches “I make one drum sound then copy it a bunch on the timeline.” Payload stays small (few shorts + many placements).
