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

/** What your mouth is supposed to cover */
export type VoiceRole = "drums" | "bass" | "melody" | "harmony" | "fx";

export const VOICE_ROLES: VoiceRole[] = [
	"drums",
	"bass",
	"melody",
	"harmony",
	"fx",
];

export const ROLE_HELP: Record<VoiceRole, string> = {
	drums: "Beatbox the kit — kick, snare, hats with your mouth",
	bass: "Hum / throat the low end — match the groove",
	melody: "Sing or whistle the hook",
	harmony: "Stack a second vocal / ooohs",
	fx: "Risers, whooshes, ad-libs, weird mouth noises",
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
	/** Roles you must cover with voice */
	mustRoles: VoiceRole[];
	hint: string;
};

export type VoiceClip = {
	id: string;
	role: VoiceRole;
	label: string;
	audioBase64: string;
	mime: string;
};

export type VoiceLane = {
	role: VoiceRole;
	/** Clip id from project.clips, or null if empty */
	clipId: string | null;
	steps: boolean[];
	gain: number;
	mute: boolean;
	/** Semitone-ish playback rate shift */
	pitch: number;
};

export type Project = {
	bpm: number;
	swing: number;
	bars: number;
	clips: VoiceClip[];
	lanes: VoiceLane[];
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
	/** Shared challenge for the round */
	challenge: Challenge | null;
	/** @deprecated old field — ignored */
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

export function EMPTY_PROJECT(challenge: Challenge): Project {
	return {
		bpm: challenge.bpm,
		swing: 0.08,
		bars: challenge.bars,
		masterGain: 0.9,
		clips: [],
		lanes: VOICE_ROLES.map((role) => ({
			role,
			clipId: null,
			steps: defaultStepsForRole(role, challenge.genre),
			gain: role === "bass" || role === "drums" ? 0.9 : 0.75,
			mute: false,
			pitch: 0,
		})),
	};
}

function defaultStepsForRole(role: VoiceRole, genre: Genre): boolean[] {
	const steps = Array.from({ length: 16 }, () => false);
	// Light ghost grid so they know where hits often go — still empty of audio
	if (role === "drums") {
		if (genre === "House" || genre === "EDM") {
			[0, 4, 8, 12].forEach((i) => (steps[i] = true));
		} else {
			[0, 4, 7, 10, 12].forEach((i) => (steps[i] = true));
		}
	}
	return steps;
}

export function normalizeProject(raw: Project | Record<string, unknown>): Project {
	const r = raw as Project;
	const clips = Array.isArray(r.clips) ? r.clips : [];
	const lanes: VoiceLane[] =
		Array.isArray(r.lanes) && r.lanes.length
			? r.lanes.map((l) => ({
					role: l.role,
					clipId: l.clipId ?? null,
					steps: Array.from({ length: 16 }, (_, i) => !!l.steps?.[i]),
					gain: l.gain ?? 0.8,
					mute: !!l.mute,
					pitch: l.pitch ?? 0,
				}))
			: VOICE_ROLES.map((role) => ({
					role,
					clipId: null,
					steps: Array.from({ length: 16 }, () => false),
					gain: 0.8,
					mute: false,
					pitch: 0,
				}));

	return {
		bpm: r.bpm || 120,
		swing: r.swing ?? 0.08,
		bars: Math.max(1, Math.min(4, r.bars || 2)),
		masterGain: r.masterGain ?? 0.9,
		clips: clips
			.filter((c) => c?.audioBase64 && c?.role)
			.map((c) => ({
				id: c.id,
				role: c.role,
				label: c.label || c.role,
				audioBase64: c.audioBase64,
				mime: c.mime || "audio/webm",
			})),
		lanes,
	};
}

export function missingVoiceRoles(
	challenge: Challenge,
	project: Project,
): VoiceRole[] {
	const p = normalizeProject(project);
	return challenge.mustRoles.filter((role) => {
		const lane = p.lanes.find((l) => l.role === role);
		if (!lane?.clipId) return true;
		const clip = p.clips.find((c) => c.id === lane.clipId);
		if (!clip) return true;
		const hits = lane.steps.filter(Boolean).length;
		return hits < 1;
	});
}

/** Cap total voice payload roughly (~1.5MB base64) */
export function projectAudioBytes(project: Project): number {
	return normalizeProject(project).clips.reduce(
		(n, c) => n + (c.audioBase64?.length ?? 0),
		0,
	);
}
