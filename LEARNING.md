# Beat Ranked — understanding checklist

Track what you should be able to explain before calling the session done.

## 1. The problem

- [ ] What is a beat battle / FL Studio Ranked-style lobby?
- [ ] Why do shared samples + a timer create pressure and fairness?
- [ ] Why can’t a naive “everyone uploads a WAV” design scale well on the edge?
- [ ] What branches of design exist: native FL plugin vs web DAW vs Discord-only voting?

## 2. The solution

- [ ] How Durable Objects coordinate one lobby (WebSockets + alarms for phase timers)
- [ ] Why packs are **seeded synths** instead of shipping large sample files
- [ ] Why voting re-renders **project JSON** with the same pack instead of transferring audio
- [ ] What a **cook card** is (must-use elements + starter groove) and why it exists
- [ ] What the full DAW views do (sequencer / piano roll / mixer / pads)
- [ ] Step velocity, pitch, gate length, and why they matter for a “full” editor
- [ ] Track FX sends (reverb/delay/pan) vs master bus

## 3. Broader context

- [ ] What deploying to `beats.popped.dev` on Workers means (assets + DO + custom domain)
- [ ] What this changes for players (zero install, share a link)
- [ ] Limits of an in-browser DAW vs full FL Studio (and why that’s OK for battles)

## Quick self-check prompts

1. If two players get the same seed, do they hear the same kick? Why?
2. What wakes the lobby DO when the cook timer hits zero?
3. Why is the submission a `Project` object, not a file?
