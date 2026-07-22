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
	/** 0-1 normalized synthesis knobs derived from lobby seed */
	pitch: number;
	tone: number;
	decay: number;
	noise: number;
	harmonics: number;
	filter: number;
	drive: number;
};

export type Pack = {
	seed: number;
	genre: Genre;
	heat: Heat;
	bpm: number;
	samples: SampleDef[];
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

export const EMPTY_PROJECT = (pack: Pack): Project => ({
	bpm: pack.bpm,
	swing: 0.08,
	bars: 2,
	tracks: pack.samples.map((s) => ({
		sampleId: s.id,
		steps: Array.from({ length: 16 }, () => false),
		gain: s.role === "kick" || s.role === "bass" ? 0.85 : 0.7,
		mute: false,
		solo: false,
		pitch: 0,
		filter: s.filter,
		drive: s.drive * 0.35,
	})),
});
