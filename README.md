# Beat Ranked

Multiplayer **beat battle** for the browser — shared sound packs, a strict cook timer, an in-browser sequencer/DAW, and anonymous voting. Inspired by FL Studio Ranked / beat-battle lobbies.

**Target deploy:** [beats.popped.dev](https://beats.popped.dev) on Cloudflare Workers.

## Stack

- **React + Vite** frontend
- **Cloudflare Workers** + **Durable Objects** (Hibernatable WebSockets + alarms) for lobbies
- **Web Audio API** in-browser DAW (seeded synth samples, 16-step sequencer, mixer, WAV export)

## Local dev

```bash
npm install
npm run dev
```

## Deploy

```bash
export CLOUDFLARE_API_TOKEN=...   # needs Workers + routes on popped.dev zone
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

`wrangler.json` already binds the custom domain `beats.popped.dev`.

> **Token needed:** This cloud agent does not have a Cloudflare API token in the environment. Paste a token (or auth MCP / `wrangler login`) to deploy.

## How to play

1. Create or join a lobby with a 5-character code  
2. Host sets heat / genre / timers; everyone readies  
3. Cook phase: same seeded pack for all — build in the browser DAW  
4. Submit → vote blind → winner gets a W; host starts next round  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite + Worker |
| `npm run build` | Production build |
| `npm run deploy` | Deploy Worker + assets |
| `npm run check` | Typecheck + dry-run deploy |
