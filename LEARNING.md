# Learning checklist — sampler timeline

## 1. The problem

- [ ] Why “one full take per role” was the wrong read of the idea
- [ ] What one-shot + stamp means vs looping a long recording

## 2. The solution

- [ ] `VoiceClip` = the recorded sound (once)
- [ ] `Placement` = a copy of that sound at a step
- [ ] Why “Stamp every beat” rewrites placements for the selected clip
- [ ] How must-roles check both: recorded *and* stamped

## 3. Broader context

- [ ] Why short max record time (~0.9s) matters for this model
- [ ] What “Copy bar 1 → all” is doing under the hood

## Quiz

1. You record a kick once and stamp it on steps 0, 4, 8, 12. How many `VoiceClip`s and how many `Placement`s?
2. If you re-record a second kick as “drums 2”, does that replace the first pad or add another?
3. Why can’t you stamp a bass sound on the drums timeline row?
