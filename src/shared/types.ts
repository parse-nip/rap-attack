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
	/** Musical root MIDI for pitched roles */
	rootMidi: number;
	/** 0-1 normalized synthesis knobs derived from lobby seed */
	pitch: number;
	tone: number;
	decay: number;
	noise: number;
	harmonics: number;
	filter: number;
	drive: number;
	/** Highlighted as a must-use cook element */
	mustUse: boolean;
	/** Short reason shown on the cook card */
	useHint: string;
};

/** Concrete cook instructions so everyone builds from the same brief */
export type CookBrief = {
	title: string;
	vibe: string;
	/** Sample ids that MUST appear in the pattern (≥1 hit each) */
	mustUseIds: string[];
	/** Human-readable checklist lines */
	rules: string[];
	/** Arrangement tip for sounding good fast */
	tip: string;
};

export type Pack = {
	seed: number;
	genre: Genre;
	heat: Heat;
	bpm: number;
	/** Shared musical key (MIDI root for the pack) */
	keyMidi: number;
	samples: SampleDef[];
	brief: CookBrief;
};

export type StepCell = boolean;

/** 16-step pattern per track */
export type TrackPattern = {
	sampleId: string;
	steps: StepCell[]; // length 16
	gain: number; // 0-1
	mute: boolean;
	solo: boolean;
	pitch: number; // semitone offset -12..12
	filter: number; // 0-1
	drive: number; // 0-1
};

export type Project = {
	bpm: number;
	swing: number; // 0-1
	tracks: TrackPattern[];
	bars: number; // loop length in bars (1-4)
	/** Base64-encoded short voice/producer tag (plays before the loop) */
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
	/** Anonymous label shown during voting */
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
	/** Your vote target submission id, if any (personalized in messages) */
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

/** Genre starter grooves that already slap — players remix from here */
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

export function EMPTY_PROJECT(pack: Pack): Project {
	const groove = STARTER_GROOVES[pack.genre];
	const usedRoles = new Set<SampleRole>();

	return {
		bpm: pack.bpm,
		swing: pack.genre === "Trap" || pack.genre === "Drill" ? 0.12 : 0.06,
		bars: 2,
		tracks: pack.samples.map((s) => {
			const steps = Array.from({ length: 16 }, () => false);
			const pattern = groove[s.role];
			// Only auto-fill the first sample of each role so it doesn't stack muddy
			if (pattern && !usedRoles.has(s.role)) {
				usedRoles.add(s.role);
				for (const i of pattern) steps[i] = true;
			}
			return {
				sampleId: s.id,
				steps,
				gain: s.role === "kick" || s.role === "bass" ? 0.88 : 0.68,
				mute: false,
				solo: false,
				pitch: 0,
				filter: Math.max(0.45, s.filter),
				drive: s.drive * 0.3,
			};
		}),
	};
}

export function missingMustUse(pack: Pack, project: Project): string[] {
	const missing: string[] = [];
	for (const id of pack.brief.mustUseIds) {
		const track = project.tracks.find((t) => t.sampleId === id);
		const sample = pack.samples.find((s) => s.id === id);
		const hits = track?.steps.filter(Boolean).length ?? 0;
		if (!track || hits < 1) {
			missing.push(sample?.name ?? id);
		}
	}
	return missing;
}
