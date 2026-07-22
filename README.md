# Mouth Ranked

Multiplayer **a cappella remake battle** in the browser. Everyone gets the same short song clip, remakes it with **only their voice** (beatbox, hum, sing), then votes blind.

**Live:** [beats.popped.dev](https://beats.popped.dev) (Cloudflare Workers).

## Stack

- **React + Vite** frontend
- **Cloudflare Workers** + **Durable Objects** (Hibernatable WebSockets + alarms)
- **Web Audio API** — seeded reference clip + voice-lane sequencer + WAV export

## Local dev

```bash
npm install
npm run dev
```

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

`wrangler.json` binds custom domain `beats.popped.dev`.

## How to play

1. Create or join a lobby (5-character code)
2. Host sets heat / genre / timers; everyone readies
3. Cook: play the challenge clip, record voice layers for drums/bass/melody (and more at higher heat), place them on the step grid
4. Submit → vote blind → winner gets a W

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite + Worker |
| `npm run build` | Production build |
| `npm run deploy` | Deploy Worker + assets |
| `npm run check` | Typecheck + dry-run deploy |
