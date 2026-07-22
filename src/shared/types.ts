export type Phase = "lobby" | "cookup" | "voting" | "results";

export type Genre =
	| "Trap"
	| "EDM"
	| "R&B"
	| "Drill"
	| "House"
	| "Lo-Fi"
	| "Hyperpop"
	| "Afrobeats";

export type Heat = 1 | 2 | 3 | 4 | 5;

/** What kind of mouth sound this one-shot is for the challenge */
export type VoiceRole = "drums" | "bass" | "melody" | "harmony" | "fx";

export const VOICE_ROLES: VoiceRole[] = [
	"drums",
	"bass",
	"melody",
	"harmony",
	"fx",
];

export const ROLE_HELP: Record<VoiceRole, string> = {
	drums: "One hit — kick, snare, or hat with your mouth",
	bass: "One short hum / throat note",
	melody: "One sung or whistled note",
	harmony: "One oooh / stack note",
	fx: "One whoosh, ad-lib, or weird noise",
};

export type Challenge = {
	seed: number;
	genre: Genre;
	heat: Heat;
	title: string;
	vibe: string;
	bpm: number;
	keyMidi: number;
	bars: number;
	mustRoles: VoiceRole[];
	hint: string;
};

/** A short one-shot you recorded once — then stamp copies on the timeline */
export type VoiceClip = {
	id: string;
	role: VoiceRole;
	label: string;
	audioBase64: string;
	mime: string;
};

/** One copy of a one-shot sitting on the timeline */
export type Placement = {
	id: string;
	clipId: string;
	/** Absolute step index across the loop (0 … bars*16 - 1) */
	step: number;
	pitch: number;
	gain: number;
};

export type Project = {
	bpm: number;
	swing: number;
	bars: number;
	clips: VoiceClip[];
	placements: Placement[];
	masterGain: number;
};

export type PlayerPublic = {
	id: string;
	name: string;
	ready: boolean;
	submitted: boolean;
	wins: number;
	connected: boolean;
	isHost: boolean;
};

export type SubmissionPublic = {
	id: string;
	label: string;
	project: Project;
	votes: number;
};

export type LobbySettings = {
	roundSeconds: number;
	voteSeconds: number;
	heat: Heat;
	genreMode: "random" | Genre;
	maxPlayers: number;
};

export type LobbyState = {
	code: string;
	phase: Phase;
	settings: LobbySettings;
	players: PlayerPublic[];
	challenge: Challenge | null;
	/** @deprecated */
	pack?: unknown;
	round: number;
	phaseEndsAt: number | null;
	submissions: SubmissionPublic[];
	myVote: string | null;
	winnerId: string | null;
	serverNow: number;
};

export type ClientMessage =
	| { type: "join"; name: string }
	| { type: "set_ready"; ready: boolean }
	| { type: "update_settings"; settings: Partial<LobbySettings> }
	| { type: "start_round" }
	| { type: "submit"; project: Project }
	| { type: "vote"; submissionId: string }
	| { type: "next_round" }
	| { type: "ping" };

export type ServerMessage =
	| { type: "state"; state: LobbyState; you: string }
	| { type: "error"; message: string }
	| { type: "pong"; t: number };

export const DEFAULT_SETTINGS: LobbySettings = {
	roundSeconds: 240,
	voteSeconds: 75,
	heat: 1,
	genreMode: "random",
	maxPlayers: 8,
};

export const GENRES: Genre[] = [
	"Trap",
	"EDM",
	"R&B",
	"Drill",
	"House",
	"Lo-Fi",
	"Hyperpop",
	"Afrobeats",
];

export const STEPS_PER_BAR = 16;

export function totalSteps(bars: number): number {
	return Math.max(1, bars) * STEPS_PER_BAR;
}

export function EMPTY_PROJECT(challenge: Challenge): Project {
	return {
		bpm: challenge.bpm,
		swing: 0.08,
		bars: challenge.bars,
		masterGain: 0.9,
		clips: [],
		placements: [],
	};
}

export function normalizeProject(raw: Project | Record<string, unknown>): Project {
	const r = raw as Project & {
		lanes?: {
			role: VoiceRole;
			clipId: string | null;
			steps: boolean[];
			gain: number;
			mute: boolean;
			pitch: number;
		}[];
	};

	const clips = (Array.isArray(r.clips) ? r.clips : [])
		.filter((c) => c?.audioBase64 && c?.role)
		.map((c) => ({
			id: c.id,
			role: c.role,
			label: c.label || c.role,
			audioBase64: c.audioBase64,
			mime: c.mime || "audio/webm",
		}));

	const bars = Math.max(1, Math.min(4, r.bars || 2));
	const maxStep = totalSteps(bars);

	let placements: Placement[] = [];
	if (Array.isArray(r.placements) && r.placements.length) {
		placements = r.placements
			.filter((p) => p?.clipId != null && Number.isFinite(p.step))
			.map((p, i) => ({
				id: p.id || `p${i}`,
				clipId: p.clipId,
				step: Math.max(0, Math.min(maxStep - 1, Math.floor(p.step))),
				pitch: p.pitch ?? 0,
				gain: p.gain ?? 1,
			}));
	} else if (Array.isArray(r.lanes)) {
		// Migrate old lane/step model → placements
		for (const lane of r.lanes) {
			if (!lane.clipId || lane.mute) continue;
			lane.steps?.forEach((on, si) => {
				if (!on) return;
				placements.push({
					id: `mig-${lane.role}-${si}`,
					clipId: lane.clipId!,
					step: si % maxStep,
					pitch: lane.pitch ?? 0,
					gain: lane.gain ?? 1,
				});
			});
		}
	}

	return {
		bpm: r.bpm || 120,
		swing: r.swing ?? 0.08,
		bars,
		masterGain: r.masterGain ?? 0.9,
		clips,
		placements,
	};
}

/** Roles that still need ≥1 one-shot recorded AND stamped on the timeline */
export function missingVoiceRoles(
	challenge: Challenge,
	project: Project,
): VoiceRole[] {
	const p = normalizeProject(project);
	return challenge.mustRoles.filter((role) => {
		const roleClips = new Set(
			p.clips.filter((c) => c.role === role).map((c) => c.id),
		);
		if (roleClips.size === 0) return true;
		return !p.placements.some((pl) => roleClips.has(pl.clipId));
	});
}

export function placementsForStep(project: Project, step: number): Placement[] {
	return normalizeProject(project).placements.filter((p) => p.step === step);
}

export function projectAudioBytes(project: Project): number {
	return normalizeProject(project).clips.reduce(
		(n, c) => n + (c.audioBase64?.length ?? 0),
		0,
	);
}
