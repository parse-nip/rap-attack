import { DurableObject } from "cloudflare:workers";
import { generateChallenge, lobbyCodeFromSeed } from "../shared/packs";
import {
	DEFAULT_SETTINGS,
	missingVoiceRoles,
	normalizeProject,
	projectAudioBytes,
	type ClientMessage,
	type LobbySettings,
	type LobbyState,
	type Phase,
	type PlayerPublic,
	type Project,
	type ServerMessage,
	type SubmissionPublic,
} from "../shared/types";

type PlayerRecord = {
	id: string;
	name: string;
	ready: boolean;
	submitted: boolean;
	wins: number;
	isHost: boolean;
	project: Project | null;
	vote: string | null;
};

type Persisted = {
	code: string;
	phase: Phase;
	settings: LobbySettings;
	players: PlayerRecord[];
	challengeSeed: number | null;
	/** @deprecated migrated → challengeSeed */
	packSeed?: number | null;
	round: number;
	phaseEndsAt: number | null;
	winnerId: string | null;
};

function uid(): string {
	return crypto.randomUUID().slice(0, 8);
}

export class BeatLobby extends DurableObject<Env> {
	private players = new Map<string, PlayerRecord>();
	private phase: Phase = "lobby";
	private settings: LobbySettings = { ...DEFAULT_SETTINGS };
	private challengeSeed: number | null = null;
	private round = 0;
	private phaseEndsAt: number | null = null;
	private winnerId: string | null = null;
	private code = "";
	private loaded = false;

	private async ensureLoaded() {
		if (this.loaded) return;
		const data = await this.ctx.storage.get<Persisted>("state");
		if (data) {
			this.code = data.code;
			this.phase = data.phase;
			this.settings = data.settings;
			this.challengeSeed = data.challengeSeed ?? data.packSeed ?? null;
			this.round = data.round;
			this.phaseEndsAt = data.phaseEndsAt;
			this.winnerId = data.winnerId;
			this.players = new Map(data.players.map((p) => [p.id, p]));
		} else {
			this.code = lobbyCodeFromSeed(
				Math.floor(Math.random() * 0xffffffff) ^ Date.now(),
			);
		}
		this.loaded = true;
	}

	private async persist() {
		const data: Persisted = {
			code: this.code,
			phase: this.phase,
			settings: this.settings,
			players: [...this.players.values()],
			challengeSeed: this.challengeSeed,
			round: this.round,
			phaseEndsAt: this.phaseEndsAt,
			winnerId: this.winnerId,
		};
		await this.ctx.storage.put("state", data);
	}

	private connectedIds(): Set<string> {
		const ids = new Set<string>();
		for (const ws of this.ctx.getWebSockets()) {
			const att = ws.deserializeAttachment() as { playerId?: string } | null;
			if (att?.playerId) ids.add(att.playerId);
		}
		return ids;
	}

	private challenge() {
		if (this.challengeSeed == null) return null;
		return generateChallenge(
			this.challengeSeed,
			this.settings.heat,
			this.settings.genreMode,
		);
	}

	private submissionsPublic(): SubmissionPublic[] {
		if (this.phase !== "voting" && this.phase !== "results") return [];
		const submitted = [...this.players.values()].filter(
			(p) => p.submitted && p.project,
		);
		const votes = new Map<string, number>();
		for (const p of this.players.values()) {
			if (p.vote) votes.set(p.vote, (votes.get(p.vote) ?? 0) + 1);
		}
		return submitted.map((p, i) => ({
			id: p.id,
			label:
				this.phase === "results"
					? p.name
					: `Remake ${String.fromCharCode(65 + i)}`,
			project: p.project!,
			votes: votes.get(p.id) ?? 0,
		}));
	}

	private stateFor(viewerId: string): LobbyState {
		const connected = this.connectedIds();
		const me = this.players.get(viewerId);
		const players: PlayerPublic[] = [...this.players.values()].map((p) => ({
			id: p.id,
			name: p.name,
			ready: p.ready,
			submitted: p.submitted,
			wins: p.wins,
			connected: connected.has(p.id),
			isHost: p.isHost,
		}));

		return {
			code: this.code,
			phase: this.phase,
			settings: this.settings,
			players,
			challenge: this.challenge(),
			round: this.round,
			phaseEndsAt: this.phaseEndsAt,
			submissions: this.submissionsPublic(),
			myVote: me?.vote ?? null,
			winnerId: this.winnerId,
			serverNow: Date.now(),
		};
	}

	private send(ws: WebSocket, msg: ServerMessage) {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			/* socket gone */
		}
	}

	private broadcast() {
		for (const ws of this.ctx.getWebSockets()) {
			const att = ws.deserializeAttachment() as { playerId?: string } | null;
			const pid = att?.playerId;
			if (!pid) continue;
			this.send(ws, { type: "state", state: this.stateFor(pid), you: pid });
		}
	}

	private async promoteHostIfNeeded() {
		const connected = this.connectedIds();
		const list = [...this.players.values()];
		const host = list.find((p) => p.isHost);
		if (host && connected.has(host.id)) return;
		for (const p of list) p.isHost = false;
		const next = list.find((p) => connected.has(p.id)) ?? list[0];
		if (next) next.isHost = true;
	}

	async fetch(request: Request): Promise<Response> {
		await this.ensureLoaded();
		const url = new URL(request.url);
		const codeParam =
			url.searchParams.get("code") || request.headers.get("X-Lobby-Code");
		if (codeParam) {
			const normalized = codeParam
				.toUpperCase()
				.replace(/[^A-Z0-9]/g, "")
				.slice(0, 5);
			if (normalized && this.code !== normalized) {
				this.code = normalized;
				await this.persist();
			}
		}

		if (url.pathname.endsWith("/meta") || url.pathname === "/meta") {
			await this.promoteHostIfNeeded();
			return Response.json({
				code: this.code,
				phase: this.phase,
				players: this.players.size,
				maxPlayers: this.settings.maxPlayers,
			});
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ playerId: null });

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		await this.ensureLoaded();
		const text = typeof message === "string" ? message : new TextDecoder().decode(message);
		let msg: ClientMessage;
		try {
			msg = JSON.parse(text) as ClientMessage;
		} catch {
			this.send(ws, { type: "error", message: "Invalid message" });
			return;
		}

		const att = (ws.deserializeAttachment() ?? {}) as { playerId: string | null };

		try {
			switch (msg.type) {
				case "ping":
					this.send(ws, { type: "pong", t: Date.now() });
					return;
				case "join":
					await this.handleJoin(ws, att, msg.name);
					break;
				case "set_ready":
					await this.withPlayer(att.playerId, (p) => {
						if (this.phase !== "lobby") return;
						p.ready = !!msg.ready;
					});
					break;
				case "update_settings":
					await this.withPlayer(att.playerId, (p) => {
						if (!p.isHost || this.phase !== "lobby") return;
						this.settings = { ...this.settings, ...msg.settings };
					});
					break;
				case "start_round":
					await this.withPlayer(att.playerId, async (p) => {
						if (!p.isHost || this.phase !== "lobby") return;
						await this.beginCookup();
					});
					break;
				case "submit":
					await this.withPlayer(att.playerId, (p) => {
						if (this.phase !== "cookup") return;
						const challenge = this.challenge();
						if (!challenge) return;
						const project = normalizeProject(msg.project);
						const missing = missingVoiceRoles(challenge, project);
						if (missing.length) {
							throw new Error(
								`Record & place voice for: ${missing.join(", ")}`,
							);
						}
						if (!project.lanes.some((l) => l.clipId && l.steps.some(Boolean))) {
							throw new Error("Place at least one voice clip on the grid");
						}
						if (projectAudioBytes(project) > 2_000_000) {
							throw new Error("Voice clips too large — re-record shorter takes");
						}
						p.project = project;
						p.submitted = true;
					});
					await this.maybeEarlyVote();
					break;
				case "vote":
					await this.withPlayer(att.playerId, (p) => {
						if (this.phase !== "voting") return;
						if (msg.submissionId === p.id) return; // no self-vote
						const target = this.players.get(msg.submissionId);
						if (!target?.submitted) return;
						p.vote = msg.submissionId;
					});
					break;
				case "next_round":
					await this.withPlayer(att.playerId, async (p) => {
						if (!p.isHost || this.phase !== "results") return;
						this.phase = "lobby";
						this.phaseEndsAt = null;
						this.challengeSeed = null;
						this.winnerId = null;
						for (const pl of this.players.values()) {
							pl.ready = false;
							pl.submitted = false;
							pl.project = null;
							pl.vote = null;
						}
						await this.ctx.storage.deleteAlarm();
					});
					break;
			}
		} catch (e) {
			this.send(ws, {
				type: "error",
				message: e instanceof Error ? e.message : "Action failed",
			});
		}

		await this.persist();
		this.broadcast();
	}

	private async withPlayer(
		playerId: string | null,
		fn: (p: PlayerRecord) => void | Promise<void>,
	) {
		if (!playerId) throw new Error("Join the lobby first");
		const p = this.players.get(playerId);
		if (!p) throw new Error("Unknown player");
		await fn(p);
	}

	private async handleJoin(
		ws: WebSocket,
		att: { playerId: string | null },
		rawName: string,
	) {
		const name = rawName.trim().slice(0, 18) || "Producer";
		if (att.playerId && this.players.has(att.playerId)) {
			const existing = this.players.get(att.playerId)!;
			existing.name = name;
			ws.serializeAttachment({ playerId: existing.id });
			this.send(ws, {
				type: "state",
				state: this.stateFor(existing.id),
				you: existing.id,
			});
			this.broadcast();
			return;
		}

		if (this.players.size >= this.settings.maxPlayers) {
			this.send(ws, { type: "error", message: "Lobby is full" });
			ws.close(1013, "full");
			return;
		}

		const id = uid();
		const isFirst = this.players.size === 0;
		const player: PlayerRecord = {
			id,
			name,
			ready: false,
			submitted: false,
			wins: 0,
			isHost: isFirst,
			project: null,
			vote: null,
		};
		this.players.set(id, player);
		ws.serializeAttachment({ playerId: id });
		await this.persist();
		this.send(ws, { type: "state", state: this.stateFor(id), you: id });
		this.broadcast();
	}

	private async beginCookup() {
		const connected = this.connectedIds();
		const active = [...this.players.values()].filter((p) => connected.has(p.id));
		if (active.length < 1) throw new Error("Need at least 1 player");

		this.round += 1;
		this.phase = "cookup";
		this.winnerId = null;
		this.challengeSeed = (Math.random() * 0xffffffff) >>> 0;
		this.phaseEndsAt = Date.now() + this.settings.roundSeconds * 1000;

		for (const p of this.players.values()) {
			p.ready = false;
			p.submitted = false;
			p.project = null;
			p.vote = null;
		}

		await this.ctx.storage.setAlarm(this.phaseEndsAt);
	}

	private async maybeEarlyVote() {
		const connected = this.connectedIds();
		const needed = [...this.players.values()].filter((p) => connected.has(p.id));
		if (needed.length > 0 && needed.every((p) => p.submitted)) {
			await this.beginVoting();
		}
	}

	private async beginVoting() {
		this.phase = "voting";
		this.phaseEndsAt = Date.now() + this.settings.voteSeconds * 1000;
		// Auto-submit empty-ish projects? No — only submitted count.
		// Players who didn't submit simply don't appear.
		await this.ctx.storage.setAlarm(this.phaseEndsAt);
		await this.persist();
		this.broadcast();
	}

	private async finishVoting() {
		const tallies = new Map<string, number>();
		for (const p of this.players.values()) {
			if (!p.submitted || !p.project) continue;
			tallies.set(p.id, 0);
		}
		for (const p of this.players.values()) {
			if (p.vote && tallies.has(p.vote)) {
				tallies.set(p.vote, (tallies.get(p.vote) ?? 0) + 1);
			}
		}

		let bestId: string | null = null;
		let bestVotes = -1;
		for (const [id, v] of tallies) {
			if (v > bestVotes) {
				bestVotes = v;
				bestId = id;
			}
		}

		// Tie-break: earliest submitter order by id (stable enough)
		if (bestId) {
			const winner = this.players.get(bestId);
			if (winner) winner.wins += 1;
		}

		this.winnerId = bestId;
		this.phase = "results";
		this.phaseEndsAt = null;
		await this.ctx.storage.deleteAlarm();
		await this.persist();
		this.broadcast();
	}

	async alarm() {
		await this.ensureLoaded();
		if (this.phase === "cookup") {
			await this.beginVoting();
		} else if (this.phase === "voting") {
			await this.finishVoting();
		}
	}

	async webSocketClose(ws: WebSocket) {
		await this.ensureLoaded();
		await this.promoteHostIfNeeded();
		await this.persist();
		this.broadcast();
		try {
			ws.close();
		} catch {
			/* */
		}
	}

	async webSocketError(ws: WebSocket) {
		try {
			ws.close();
		} catch {
			/* */
		}
	}
}
