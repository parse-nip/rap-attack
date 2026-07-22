import { Hono } from "hono";
import { BeatLobby } from "./lobby";

export { BeatLobby };

const app = new Hono<{ Bindings: Env }>();

function lobbyStub(env: Env, code: string) {
	const id = env.BEAT_LOBBY.idFromName(code.toUpperCase());
	return env.BEAT_LOBBY.get(id);
}

app.get("/api/health", (c) =>
	c.json({
		ok: true,
		service: "mouth-ranked",
		mode: "acapella-remake",
		domain: "beats.popped.dev",
	}),
);

app.post("/api/lobbies", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { code?: string };
	const code =
		(body.code?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) ||
			randomCode());
	const stub = lobbyStub(c.env, code);
	// Touch DO so it initializes with the same code used for routing
	await stub.fetch(new Request(`https://lobby/meta?code=${code}`));
	return c.json({ code });
});

app.get("/api/lobbies/:code", async (c) => {
	const code = c.req.param("code").toUpperCase();
	const stub = lobbyStub(c.env, code);
	const res = await stub.fetch(new Request(`https://lobby/meta?code=${code}`));
	return new Response(res.body, {
		status: res.status,
		headers: { "content-type": "application/json" },
	});
});

app.get("/ws/:code", async (c) => {
	const upgrade = c.req.header("Upgrade");
	if (upgrade !== "websocket") {
		return c.text("Expected WebSocket", 426);
	}
	const code = c.req.param("code").toUpperCase();
	const stub = lobbyStub(c.env, code);
	const headers = new Headers(c.req.raw.headers);
	headers.set("X-Lobby-Code", code);
	// Preserve the original upgrade Request (required for WebSockets)
	return stub.fetch(new Request(c.req.raw, { headers }));
});

function randomCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const bytes = crypto.getRandomValues(new Uint8Array(5));
	return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export default app;
