import type {
	CookBrief,
	Genre,
	Heat,
	Pack,
	SampleDef,
	SampleRole,
} from "./types";
import { GENRES } from "./types";

/** Mulberry32 PRNG — deterministic from seed */
export function mulberry32(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

const ROLE_SETS: Record<Genre, SampleRole[]> = {
	Trap: ["kick", "snare", "hat", "hat", "perc", "bass", "melody", "fx"],
	EDM: ["kick", "snare", "hat", "perc", "bass", "melody", "melody", "fx"],
	"R&B": ["kick", "snare", "hat", "perc", "bass", "melody", "vocal", "fx"],
	Drill: ["kick", "snare", "hat", "hat", "perc", "bass", "melody", "fx"],
	House: ["kick", "snare", "hat", "perc", "bass", "melody", "fx", "perc"],
	"Lo-Fi": ["kick", "snare", "hat", "perc", "bass", "melody", "fx", "vocal"],
	Hyperpop: ["kick", "snare", "hat", "perc", "bass", "melody", "fx", "vocal"],
	Afrobeats: ["kick", "snare", "hat", "perc", "perc", "bass", "melody", "fx"],
};

/** Named kits that feel like real pack elements, not random noise */
const NAME_BANK: Record<SampleRole, string[]> = {
	kick: ["808 Body", "Punch Kick", "Sub Thump", "Hard Kick", "Boom Room"],
	snare: ["Crack Snare", "Clap Stack", "Rim Snap", "Side Stick", "Snap Gate"],
	hat: ["Closed Tick", "Open Air", "Shaker Lane", "Chip Hat", "Hat Roll"],
	perc: ["Conga Hit", "Wood Click", "Tribell", "Rim Perc", "Shaker Fill"],
	bass: ["Sub 808", "Reese Growl", "Warm Square", "Slide Bass", "Acid Pulse"],
	melody: ["Hook Pluck", "Bell Stab", "Keys Phrase", "Arp Chip", "Pad Hit"],
	fx: ["Impact", "Riser Bit", "Sweep Down", "Glitch Tick", "Noise Tail"],
	vocal: ["Tag Chop", "Air Vowels", "Phrase Bit", "Hook Adlib", "Yeah Chop"],
};

const BPM_BY_GENRE: Record<Genre, [number, number]> = {
	Trap: [136, 148],
	EDM: [126, 132],
	"R&B": [78, 92],
	Drill: [140, 146],
	House: [122, 126],
	"Lo-Fi": [76, 88],
	Hyperpop: [150, 168],
	Afrobeats: [104, 114],
};

const KEYS = [45, 47, 48, 50, 52, 53, 55]; // A2–G3 range, musical roots

const BRIEF_TITLES: Record<Genre, string[]> = {
	Trap: ["Night Ride", "Trunk Pressure", "Slide Season", "Chrome 808"],
	EDM: ["Mainstage Drop", "Peak Energy", "Festival Pulse", "Warehouse Key"],
	"R&B": ["Late Text", "Velvet Groove", "Soft Lights", "Slow Burn"],
	Drill: ["Block Clock", "Slide & Crack", "UK Pressure", "Cold Streets"],
	House: ["Floor Work", "Disco Heat", "Four-on-floor", "Club Keys"],
	"Lo-Fi": ["Study Dust", "Tape Afternoon", "Rain Window", "Soft Focus"],
	Hyperpop: ["Glitter Crash", "Sugar Overdrive", "Pixel Scream", "Candy Distortion"],
	Afrobeats: ["Sunset Log", "Afro Bounce", "Lagos Light", "Perc Party"],
};

const VIBES: Record<Genre, string[]> = {
	Trap: [
		"Dark melodic trap — leave space for the 808 to breathe.",
		"Hard pocket trap — snares slap, hats chatter, melody short.",
	],
	EDM: [
		"Big-room energy — kick+bass locked, melody as the drop hook.",
		"Festival cook — four-on-floor forever, riser into the hook.",
	],
	"R&B": [
		"Silky pocket — swing the hats, keep the keys warm.",
		"Neo-soul night drive — vocal chops are the hook.",
	],
	Drill: [
		"Sliding drill — sparse kicks, busy hats, cold melody.",
		"UK pressure — snare on the 3, bass mean and short.",
	],
	House: [
		"Classic house — kick never stops, perc answers the snare.",
		"Club keys — bassline and stab melody carry the floor.",
	],
	"Lo-Fi": [
		"Dusty loop — imperfect is correct, leave air between hits.",
		"Tape-warm cook — soft kick, pretty keys, vocal as texture.",
	],
	Hyperpop: [
		"Too much is correct — stack melody + fx, overdrive welcome.",
		"Glitch sugar — rolls, impacts, and a sticky hook stab.",
	],
	Afrobeats: [
		"Perc-forward bounce — kick + congas carry the groove.",
		"Sunset log drum energy — melody sings, bass stays simple.",
	],
};

function pickGenre(rand: () => number, mode: "random" | Genre): Genre {
	if (mode !== "random") return mode;
	return GENRES[Math.floor(rand() * GENRES.length)]!;
}

function heatWarp(rand: () => number, heat: Heat, base: number): number {
	const chaos = (heat - 1) / 4;
	const jitter = (rand() - 0.5) * chaos * 0.55;
	return Math.min(1, Math.max(0, base + jitter));
}

function roleRoot(role: SampleRole, keyMidi: number): number {
	switch (role) {
		case "kick":
			return keyMidi - 12;
		case "bass":
			return keyMidi - 12;
		case "melody":
			return keyMidi + 12;
		case "vocal":
			return keyMidi + 7;
		case "fx":
			return keyMidi + 19;
		case "perc":
			return keyMidi + 24;
		case "snare":
			return 40;
		case "hat":
			return 42;
		default:
			return keyMidi;
	}
}

function defaultHint(role: SampleRole): string {
	switch (role) {
		case "kick":
			return "Pocket foundation — keep it on the grid";
		case "snare":
			return "Backbeat slap — usually steps 5 & 13";
		case "hat":
			return "Motion + groove — rolls win rounds";
		case "perc":
			return "Fill the gaps between kick/snare";
		case "bass":
			return "Lock with the kick — same key, different octave";
		case "melody":
			return "THIS is your hook — feature it";
		case "fx":
			return "Transitions & drama — not every bar";
		case "vocal":
			return "Human glue — chop it like a hook";
	}
}

function buildBrief(
	rand: () => number,
	genre: Genre,
	samples: SampleDef[],
): CookBrief {
	const titleBank = BRIEF_TITLES[genre];
	const vibeBank = VIBES[genre];
	const title = titleBank[Math.floor(rand() * titleBank.length)]!;
	const vibe = vibeBank[Math.floor(rand() * vibeBank.length)]!;

	const byRole = (role: SampleRole) => samples.find((s) => s.role === role);
	const kick = byRole("kick");
	const snare = byRole("snare");
	const bass = byRole("bass");
	const melody = byRole("melody");
	const hat = byRole("hat");
	const special =
		byRole("vocal") || byRole("perc") || byRole("fx") || hat;

	const must: SampleDef[] = [];
	for (const s of [kick, snare, bass, melody, special]) {
		if (s && !must.includes(s)) must.push(s);
	}
	// Cap at 4 must-uses so it's focused
	const mustUse = must.slice(0, 4);
	for (const s of samples) s.mustUse = mustUse.some((m) => m.id === s.id);
	for (const s of mustUse) {
		if (s.role === "melody") s.useHint = "REQUIRED HOOK — put this in the pocket";
		else if (s.role === "bass") s.useHint = "REQUIRED BASS — lock to the kick";
		else if (s.role === "kick") s.useHint = "REQUIRED KICK — don't mute this";
		else if (s.role === "snare") s.useHint = "REQUIRED SNARE — own the backbeat";
		else s.useHint = `REQUIRED ${s.role.toUpperCase()} — feature this element`;
	}

	const rules = [
		`Use ${mustUse.map((s) => s.name).join(", ")} — at least one hit each.`,
		melody
			? `Feature "${melody.name}" as the hook (don't bury it).`
			: "Keep a clear hook phrase repeating.",
		bass && kick
			? `Keep "${bass.name}" locked with "${kick.name}".`
			: "Bass and kick should feel glued.",
		`Starter groove is loaded — remix it, don't wipe everything.`,
	];

	const tip =
		genre === "Trap" || genre === "Drill"
			? "Leave silence. Space between 808 hits = expensive."
			: genre === "House" || genre === "EDM"
				? "Kick on every beat. Build energy with hats/fx, not more kicks."
				: genre === "Lo-Fi" || genre === "R&B"
					? "Less is more — swing + soft filter wins."
					: "Commit to the hook early — voters hear 8 bars max.";

	return {
		title,
		vibe,
		mustUseIds: mustUse.map((s) => s.id),
		rules,
		tip,
	};
}

export function generatePack(
	seed: number,
	heat: Heat,
	genreMode: "random" | Genre,
): Pack {
	const rand = mulberry32(seed);
	const genre = pickGenre(rand, genreMode);
	const roles = ROLE_SETS[genre];
	const [bpmLo, bpmHi] = BPM_BY_GENRE[genre];
	const bpm = Math.round(bpmLo + rand() * (bpmHi - bpmLo));
	const keyMidi = KEYS[Math.floor(rand() * KEYS.length)]!;

	const samples: SampleDef[] = roles.map((role, i) => {
		const names = NAME_BANK[role];
		const name = names[Math.floor(rand() * names.length)]!;
		const musical =
			role === "bass" || role === "melody" || role === "kick" || role === "vocal";
		return {
			id: `s${i}`,
			name: heat >= 4 ? `${name}‽` : name,
			role,
			rootMidi: roleRoot(role, keyMidi),
			pitch: heatWarp(rand, heat, musical ? 0.5 : 0.4 + rand() * 0.2),
			tone: heatWarp(rand, heat, 0.4 + rand() * 0.35),
			decay: heatWarp(
				rand,
				heat,
				role === "hat" ? 0.2 : role === "kick" ? 0.55 : 0.4 + rand() * 0.3,
			),
			noise: heatWarp(
				rand,
				heat,
				role === "snare" || role === "hat" ? 0.5 : 0.08 + rand() * 0.1,
			),
			harmonics: heatWarp(
				rand,
				heat,
				role === "bass" || role === "melody" ? 0.5 + rand() * 0.25 : 0.2,
			),
			filter: heatWarp(rand, heat, role === "bass" ? 0.35 : 0.55 + rand() * 0.3),
			drive: heatWarp(rand, heat, heat * 0.08 + rand() * 0.15),
			mustUse: false,
			useHint: defaultHint(role),
		};
	});

	const brief = buildBrief(rand, genre, samples);
	return { seed, genre, heat, bpm, keyMidi, samples, brief };
}

export function lobbyCodeFromSeed(n: number): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let x = n >>> 0;
	let out = "";
	for (let i = 0; i < 5; i++) {
		out += alphabet[x % alphabet.length];
		x = Math.imul(x ^ (x >>> 7), 0x45d9f3b) >>> 0;
	}
	return out;
}
