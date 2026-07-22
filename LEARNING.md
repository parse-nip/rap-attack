# Learning checklist — Mouth Ranked pivot

Track understanding as you go. Check items only when you can explain them in your own words.

## 1. The problem

- [ ] Why FL-style DAW + sample packs was the wrong fit for this lobby game
- [ ] What “remake with only your voice” means for players
- [ ] Why we generate a reference clip instead of using a real commercial song

## 2. The solution

- [ ] `Challenge` vs old `Pack` — what fields matter and why
- [ ] How voice `clips` + `lanes` replace sequencer tracks
- [ ] Why submit validates `mustRoles` (record + at least one step)
- [ ] How `AcapellaEngine` plays the reference vs the remake
- [ ] Lobby phases still: lobby → cookup → voting → results (what changed inside cookup)

## 3. Broader context

- [ ] What this changes for players (skill: mouth sound design, not FL muscle memory)
- [ ] Payload / size limits on voice base64 — why they exist
- [ ] Heat’s new meaning (more required roles, not weirder samples)

## Quiz prompts (answer before peeking at code)

1. If heat is 5, which roles must the player cover?
2. What happens if someone records melody but leaves all melody steps off?
3. Where does the “song clip” audio actually come from at runtime?
