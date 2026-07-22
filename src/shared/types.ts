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

export type StepCell = {
	on: boolean;
	velocity: number;
	pitch: number;
	length: number;
	/** Graph-editor pan offset for this step (-1..1), added to channel pan */
	stepPan: number;
};

/** Global channel (FL Channel Rack row + mixer strip) */
export type Channel = {
	sampleId: string;
	gain: number;
	mute: boolean;
	solo: boolean;
	pitch: number;
	filter: number;
	drive: number;
	pan: number;
	reverb: number;
	delay: number;
	reverse: boolean;
	eqLow: number;
	eqMid: number;
	eqHigh: number;
	compress: number;
};

export type PatternTrack = {
	steps: StepCell[];
};

export type Pattern = {
	name: string;
	tracks: PatternTrack[];
};

export type PlaylistClip = {
	id: string;
	patternIndex: number;
	startBar: number;
	lengthBars: number;
};

export type PlayMode = "pattern" | "song";

export type Project = {
	bpm: number;
	swing: number;
	patternLength: number;
	channels: Channel[];
	patterns: Pattern[];
	activePattern: number;
	playMode: PlayMode;
	playlist: PlaylistClip[];
	masterGain: number;
	masterReverb: number;
	masterCrush: number;
	tagAudio?: string;
	tagMime?: string;
};

/** @deprecated legacy shape — migrated by normalizeProject */
export type LegacyTrackPattern = {
	sampleId: string;
	steps: Array<StepCell | boolean>;
	gain?: number;
	mute?: boolean;
	solo?: boolean;
	pitch?: number;
	filter?: number;
	drive?: number;
	pan?: number;
	reverb?: number;
	delay?: number;
	reverse?: boolean;
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

export const PATTERN_COUNT = 8;

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
		bass: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
	House: {
		bass: [0, 0, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, 0],
		melody: [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0],
	},
	"Lo-Fi": {
		bass: [0, 0, 0, 0, 0, 0, 0, -2, 0, 0, -5, 0, 0, 0, 0, 0],
		melody: [0, 0, 0, 2, 0, 4, 0, 0, 7, 0, 0, 0, 5, 0, 0, 0],
	},
	Hyperpop: {
		bass: [0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0],
		melody: [0, 0, 4, 0, 0, 7, 0, 0, 12, 0, 0, 7, 0, 0, 0, 0],
	},
	Afrobeats: {
		bass: [0, 0, 0, 0, 0, -5, 0, 0, 0, 0, 0, 0, 0, -2, 0, 0],
		melody: [0, 0, 0, 0, 4, 0, 0, 0, 7, 0, 0, 0, 5, 0, 0, 0],
	},
};

function clamp01(n: number) {
	return Math.max(0, Math.min(1, n));
}

export function emptyStep(): StepCell {
	return { on: false, velocity: 0.85, pitch: 0, length: 1, stepPan: 0 };
}

export function hitStep(
	velocity = 0.85,
	pitch = 0,
	length = 1,
	stepPan = 0,
): StepCell {
	return { on: true, velocity, pitch, length, stepPan };
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
		velocity: clamp01(step.velocity ?? 0.85),
		pitch: Math.max(-24, Math.min(24, step.pitch ?? 0)),
		length: Math.max(1, Math.min(8, Math.round(step.length ?? 1))),
		stepPan: Math.max(-1, Math.min(1, step.stepPan ?? 0)),
	};
}

function emptyPatternTracks(channelCount: number, length: number): PatternTrack[] {
	return Array.from({ length: channelCount }, () => ({
		steps: Array.from({ length }, () => emptyStep()),
	}));
}

export function activePatternTracks(project: Project): PatternTrack[] {
	const p = project.patterns[project.activePattern] ?? project.patterns[0];
	return p?.tracks ?? [];
}

export function normalizeProject(raw: Project | Record<string, unknown>): Project {
	const r = raw as Project & {
		tracks?: LegacyTrackPattern[];
		bars?: number;
	};

	// Legacy single-pattern projects
	if ((!r.channels || r.channels.length === 0) && r.tracks?.length) {
		const channels: Channel[] = r.tracks.map((t) => ({
			sampleId: t.sampleId,
			gain: t.gain ?? 0.75,
			mute: !!t.mute,
			solo: !!t.solo,
			pitch: t.pitch ?? 0,
			filter: t.filter ?? 0.7,
			drive: t.drive ?? 0,
			pan: t.pan ?? 0,
			reverb: t.reverb ?? 0.05,
			delay: t.delay ?? 0,
			reverse: !!t.reverse,
			eqLow: 0,
			eqMid: 0,
			eqHigh: 0,
			compress: 0,
		}));
		const len = 16;
		const pattern0: Pattern = {
			name: "Pattern 1",
			tracks: r.tracks.map((t) => ({
				steps: Array.from({ length: len }, (_, i) => asStep(t.steps?.[i])),
			})),
		};
		const patterns: Pattern[] = [
			pattern0,
			...Array.from({ length: PATTERN_COUNT - 1 }, (_, i) => ({
				name: `Pattern ${i + 2}`,
				tracks: emptyPatternTracks(channels.length, len),
			})),
		];
		const bars = Math.max(1, Math.min(8, r.bars || 2));
		return {
			bpm: r.bpm || 120,
			swing: r.swing ?? 0.08,
			patternLength: len,
			channels,
			patterns,
			activePattern: 0,
			playMode: "pattern",
			playlist: [
				{ id: "c0", patternIndex: 0, startBar: 0, lengthBars: bars },
			],
			masterGain: r.masterGain ?? 0.85,
			masterReverb: r.masterReverb ?? 0.12,
			masterCrush: r.masterCrush ?? 0,
			tagAudio: r.tagAudio,
			tagMime: r.tagMime,
		};
	}

	const channels = (r.channels ?? []).map((c) => ({
		sampleId: c.sampleId,
		gain: c.gain ?? 0.75,
		mute: !!c.mute,
		solo: !!c.solo,
		pitch: c.pitch ?? 0,
		filter: c.filter ?? 0.7,
		drive: c.drive ?? 0,
		pan: c.pan ?? 0,
		reverb: c.reverb ?? 0.05,
		delay: c.delay ?? 0,
		reverse: !!c.reverse,
		eqLow: c.eqLow ?? 0,
		eqMid: c.eqMid ?? 0,
		eqHigh: c.eqHigh ?? 0,
		compress: c.compress ?? 0,
	}));
	const plen = r.patternLength || 16;
	let patterns = (r.patterns ?? []).map((p, pi) => ({
		name: p.name || `Pattern ${pi + 1}`,
		tracks: channels.map((_, ti) => ({
			steps: Array.from({ length: plen }, (_, si) =>
				asStep(p.tracks?.[ti]?.steps?.[si]),
			),
		})),
	}));
	while (patterns.length < PATTERN_COUNT) {
		patterns.push({
			name: `Pattern ${patterns.length + 1}`,
			tracks: emptyPatternTracks(channels.length, plen),
		});
	}
	patterns = patterns.slice(0, PATTERN_COUNT);

	const playlist =
		r.playlist?.length > 0
			? r.playlist.map((c, i) => ({
					id: c.id || `clip${i}`,
					patternIndex: Math.max(0, Math.min(PATTERN_COUNT - 1, c.patternIndex)),
					startBar: Math.max(0, c.startBar),
					lengthBars: Math.max(1, c.lengthBars),
				}))
			: [{ id: "c0", patternIndex: 0, startBar: 0, lengthBars: 2 }];

	return {
		bpm: r.bpm || 120,
		swing: r.swing ?? 0.08,
		patternLength: plen,
		channels,
		patterns,
		activePattern: Math.max(0, Math.min(PATTERN_COUNT - 1, r.activePattern ?? 0)),
		playMode: r.playMode === "song" ? "song" : "pattern",
		playlist,
		masterGain: r.masterGain ?? 0.85,
		masterReverb: r.masterReverb ?? 0.12,
		masterCrush: r.masterCrush ?? 0,
		tagAudio: r.tagAudio,
		tagMime: r.tagMime,
	};
}

export function EMPTY_PROJECT(pack: Pack): Project {
	const groove = STARTER_GROOVES[pack.genre];
	const pitches = STARTER_PITCHES[pack.genre];
	const usedRoles = new Set<SampleRole>();
	const plen = 16;

	const channels: Channel[] = pack.samples.map((s) => ({
		sampleId: s.id,
		gain: s.role === "kick" || s.role === "bass" ? 0.9 : 0.7,
		mute: false,
		solo: false,
		pitch: 0,
		filter: Math.max(0.45, s.filter),
		drive: s.drive * 0.28,
		pan:
			s.role === "hat" ? 0.15 : s.role === "perc" ? -0.2 : s.role === "fx" ? 0.25 : 0,
		reverb:
			s.role === "melody" || s.role === "vocal" || s.role === "fx"
				? 0.22
				: s.role === "snare"
					? 0.12
					: 0.04,
		delay: s.role === "melody" || s.role === "vocal" ? 0.12 : 0,
		reverse: false,
		eqLow: s.role === "kick" || s.role === "bass" ? 0.15 : 0,
		eqMid: 0,
		eqHigh: s.role === "hat" || s.role === "perc" ? 0.1 : 0,
		compress: s.role === "kick" || s.role === "snare" ? 0.2 : 0,
	}));

	const pattern0Tracks: PatternTrack[] = pack.samples.map((s) => {
		const steps = Array.from({ length: plen }, () => emptyStep());
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
				steps[i] = hitStep(vel, contour?.[i] ?? 0, s.role === "bass" ? 2 : 1);
			}
		}
		return { steps };
	});

	const patterns: Pattern[] = [
		{ name: "Pattern 1", tracks: pattern0Tracks },
		...Array.from({ length: PATTERN_COUNT - 1 }, (_, i) => ({
			name: `Pattern ${i + 2}`,
			tracks: emptyPatternTracks(channels.length, plen),
		})),
	];

	// Song starter: Pattern 1 for 2 bars (intro feel); leave room to arrange
	return normalizeProject({
		bpm: pack.bpm,
		swing: pack.genre === "Trap" || pack.genre === "Drill" ? 0.12 : 0.06,
		patternLength: plen,
		channels,
		patterns,
		activePattern: 0,
		playMode: "pattern",
		playlist: [{ id: "c0", patternIndex: 0, startBar: 0, lengthBars: 2 }],
		masterGain: 0.85,
		masterReverb: 0.14,
		masterCrush: 0,
	});
}

export function missingMustUse(pack: Pack, project: Project): string[] {
	const p = normalizeProject(project);
	const missing: string[] = [];
	for (const id of pack.brief.mustUseIds) {
		const chIdx = p.channels.findIndex((c) => c.sampleId === id);
		const sample = pack.samples.find((s) => s.id === id);
		if (chIdx < 0) {
			missing.push(sample?.name ?? id);
			continue;
		}
		let hits = 0;
		for (const pat of p.patterns) {
			hits += pat.tracks[chIdx]?.steps.filter((s) => stepOn(s)).length ?? 0;
		}
		if (hits < 1) missing.push(sample?.name ?? id);
	}
	return missing;
}

export function songLengthBars(project: Project): number {
	const p = normalizeProject(project);
	if (p.playlist.length === 0) return 2;
	return Math.max(...p.playlist.map((c) => c.startBar + c.lengthBars), 1);
}
