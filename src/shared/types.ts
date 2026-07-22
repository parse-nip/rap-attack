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

export type SampleRole =
	| "kick"
	| "snare"
	| "hat"
	| "perc"
	| "bass"
	| "melody"
	| "fx"
	| "vocal";

export type SampleDef = {
	id: string;
	name: string;
	role: SampleRole;
	rootMidi: number;
	pitch: number;
	tone: number;
	decay: number;
	noise: number;
	harmonics: number;
	filter: number;
	drive: number;
	mustUse: boolean;
	useHint: string;
};

export type CookBrief = {
	title: string;
	vibe: string;
	mustUseIds: string[];
	rules: string[];
	tip: string;
};

export type Pack = {
	seed: number;
	genre: Genre;
	heat: Heat;
	bpm: number;
	keyMidi: number;
	samples: SampleDef[];
	brief: CookBrief;
};

/** Simple on/off step with optional velocity (defaults soft-normalized) */
export type StepCell = {
	on: boolean;
	velocity: number;
	pitch: number;
};

export type TrackPattern = {
	sampleId: string;
	steps: StepCell[];
	gain: number;
	mute: boolean;
	solo: boolean;
	pitch: number;
	filter: number;
};

export type Project = {
	bpm: number;
	swing: number;
	bars: number;
	tracks: TrackPattern[];
	masterGain: number;
	tagAudio?: string;
	tagMime?: string;
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
	pack: Pack | null;
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
	roundSeconds: 180,
	voteSeconds: 60,
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

export const STARTER_GROOVES: Record<
	Genre,
	Partial<Record<SampleRole, number[]>>
> = {
	Trap: {
		kick: [0, 7, 10],
		snare: [4, 12],
		hat: [0, 2, 4, 6, 8, 10, 12, 14],
		bass: [0, 7, 10],
		melody: [0, 3, 8, 11],
	},
	EDM: {
		kick: [0, 4, 8, 12],
		snare: [4, 12],
		hat: [2, 6, 10, 14],
		bass: [0, 4, 8, 12],
		melody: [0, 4, 8, 12],
	},
	"R&B": {
		kick: [0, 6, 10],
		snare: [4, 12],
		hat: [2, 6, 8, 11, 14],
		bass: [0, 4, 8, 12],
		melody: [0, 4, 7, 11],
		vocal: [0, 8],
	},
	Drill: {
		kick: [0, 6, 8, 14],
		snare: [4, 12],
		hat: [0, 1, 2, 3, 8, 9, 10, 11],
		bass: [0, 6, 8],
		melody: [0, 6, 10],
	},
	House: {
		kick: [0, 4, 8, 12],
		snare: [4, 12],
		hat: [0, 2, 4, 6, 8, 10, 12, 14],
		perc: [2, 10],
		bass: [0, 4, 8, 12],
		melody: [0, 8],
	},
	"Lo-Fi": {
		kick: [0, 8],
		snare: [4, 12],
		hat: [2, 6, 10, 14],
		bass: [0, 7, 10],
		melody: [0, 3, 5, 8, 12],
		vocal: [0],
	},
	Hyperpop: {
		kick: [0, 4, 8, 10, 12],
		snare: [4, 12],
		hat: [0, 1, 2, 3, 4, 5, 6, 7],
		bass: [0, 4, 8, 12],
		melody: [0, 2, 5, 8, 11],
		fx: [0, 8],
	},
	Afrobeats: {
		kick: [0, 5, 8, 13],
		snare: [4, 12],
		hat: [0, 2, 4, 6, 8, 10, 12, 14],
		perc: [2, 6, 10, 14],
		bass: [0, 5, 8],
		melody: [0, 4, 8, 12],
	},
};

export const STARTER_PITCHES: Partial<
	Record<Genre, Partial<Record<"bass" | "melody" | "vocal", number[]>>>
> = {
	Trap: {
		bass: [0, 0, 0, 0, 0, 0, 0, -5, 0, 0, -2, 0, 0, 0, 0, 0],
		melody: [0, 0, 0, 3, 0, 0, 0, 0, 7, 0, 0, 5, 0, 0, 0, 0],
	},
	EDM: {
		melody: [0, 0, 0, 0, 4, 0, 0, 0, 7, 0, 0, 0, 4, 0, 0, 0],
	},
	"R&B": {
		bass: [0, 0, 0, 0, -5, 0, 0, 0, -7, 0, 0, 0, -5, 0, 0, 0],
		melody: [0, 0, 0, 0, 4, 0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 0],
	},
	Drill: {
		bass: [0, 0, 0, 0, 0, 0, -2, 0, -5, 0, 0, 0, 0, 0, 0, 0],
		melody: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 7, 0, 0, 0, 0, 0],
	},
	House: { melody: [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0] },
	"Lo-Fi": {
		melody: [0, 0, 0, 2, 0, 4, 0, 0, 7, 0, 0, 0, 5, 0, 0, 0],
	},
	Hyperpop: {
		melody: [0, 0, 4, 0, 0, 7, 0, 0, 12, 0, 0, 7, 0, 0, 0, 0],
	},
	Afrobeats: {
		melody: [0, 0, 0, 0, 4, 0, 0, 0, 7, 0, 0, 0, 5, 0, 0, 0],
	},
};

export function emptyStep(): StepCell {
	return { on: false, velocity: 0.85, pitch: 0 };
}

export function hitStep(velocity = 0.85, pitch = 0): StepCell {
	return { on: true, velocity, pitch };
}

export function stepOn(step: StepCell | boolean | undefined): boolean {
	if (step == null) return false;
	if (typeof step === "boolean") return step;
	return !!step.on;
}

export function asStep(step: StepCell | boolean | undefined): StepCell {
	if (step == null) return emptyStep();
	if (typeof step === "boolean") return step ? hitStep() : emptyStep();
	return {
		on: !!step.on,
		velocity: Math.max(0, Math.min(1, step.velocity ?? 0.85)),
		pitch: Math.max(-24, Math.min(24, step.pitch ?? 0)),
	};
}

/** Accepts new + older complex projects and flattens to the simple model */
export function normalizeProject(raw: Project | Record<string, unknown>): Project {
	const r = raw as Project & {
		channels?: Array<{
			sampleId: string;
			gain?: number;
			mute?: boolean;
			solo?: boolean;
			pitch?: number;
			filter?: number;
		}>;
		patterns?: Array<{ tracks: Array<{ steps: unknown[] }> }>;
		activePattern?: number;
		masterReverb?: number;
		masterCrush?: number;
	};

	// New simple shape
	if (r.tracks?.length) {
		return {
			bpm: r.bpm || 120,
			swing: r.swing ?? 0.08,
			bars: Math.max(1, Math.min(4, r.bars || 2)),
			masterGain: r.masterGain ?? 0.85,
			tagAudio: r.tagAudio,
			tagMime: r.tagMime,
			tracks: r.tracks.map((t) => ({
				sampleId: t.sampleId,
				steps: Array.from({ length: 16 }, (_, i) => asStep(t.steps?.[i])),
				gain: t.gain ?? 0.75,
				mute: !!t.mute,
				solo: !!t.solo,
				pitch: t.pitch ?? 0,
				filter: t.filter ?? 0.7,
			})),
		};
	}

	// Flatten FL-complex shape → pattern 0 / active pattern
	if (r.channels?.length && r.patterns?.length) {
		const pi = Math.max(0, Math.min(r.patterns.length - 1, r.activePattern ?? 0));
		const pat = r.patterns[pi]!;
		return {
			bpm: r.bpm || 120,
			swing: r.swing ?? 0.08,
			bars: 2,
			masterGain: r.masterGain ?? 0.85,
			tagAudio: r.tagAudio,
			tagMime: r.tagMime,
			tracks: r.channels.map((c, i) => ({
				sampleId: c.sampleId,
				steps: Array.from({ length: 16 }, (_, si) =>
					asStep(pat.tracks?.[i]?.steps?.[si] as StepCell | boolean | undefined),
				),
				gain: c.gain ?? 0.75,
				mute: !!c.mute,
				solo: !!c.solo,
				pitch: c.pitch ?? 0,
				filter: c.filter ?? 0.7,
			})),
		};
	}

	return {
		bpm: 120,
		swing: 0.08,
		bars: 2,
		masterGain: 0.85,
		tracks: [],
	};
}

export function EMPTY_PROJECT(pack: Pack): Project {
	const groove = STARTER_GROOVES[pack.genre];
	const pitches = STARTER_PITCHES[pack.genre];
	const usedRoles = new Set<SampleRole>();

	return normalizeProject({
		bpm: pack.bpm,
		swing: pack.genre === "Trap" || pack.genre === "Drill" ? 0.12 : 0.06,
		bars: 2,
		masterGain: 0.85,
		tracks: pack.samples.map((s) => {
			const steps = Array.from({ length: 16 }, () => emptyStep());
			const pattern = groove[s.role];
			if (pattern && !usedRoles.has(s.role)) {
				usedRoles.add(s.role);
				const contour =
					s.role === "bass" || s.role === "melody" || s.role === "vocal"
						? pitches?.[s.role]
						: undefined;
				for (const i of pattern) {
					const vel =
						s.role === "hat" && i % 2 === 1 ? 0.55 : s.role === "kick" ? 0.95 : 0.82;
					steps[i] = hitStep(vel, contour?.[i] ?? 0);
				}
			}
			return {
				sampleId: s.id,
				steps,
				gain: s.role === "kick" || s.role === "bass" ? 0.9 : 0.7,
				mute: false,
				solo: false,
				pitch: 0,
				filter: Math.max(0.45, s.filter),
			};
		}),
	});
}

export function missingMustUse(pack: Pack, project: Project): string[] {
	const p = normalizeProject(project);
	const missing: string[] = [];
	for (const id of pack.brief.mustUseIds) {
		const track = p.tracks.find((t) => t.sampleId === id);
		const sample = pack.samples.find((s) => s.id === id);
		const hits = track?.steps.filter((s) => stepOn(s)).length ?? 0;
		if (!track || hits < 1) missing.push(sample?.name ?? id);
	}
	return missing;
}
