import type { Genre, Heat, Pack, SampleDef, SampleRole } from "./types";
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

const NAME_BANK: Record<SampleRole, string[]> = {
	kick: ["808 Punch", "Thump", "Boom", "Sub Kick", "Hard Kick"],
	snare: ["Snap", "Rimshot", "Crack", "Clap Stack", "Side Stick"],
	hat: ["Closed Hat", "Open Tick", "Shaker", "Chip Hat", "Air Hat"],
	perc: ["Conga", "Woodblock", "Click", "Tribell", "Rattle"],
	bass: ["Sub Growl", "Reese", "Wobble", "Warm Bass", "Acid Bass"],
	melody: ["Pluck", "Bell Lead", "Keys", "Arp Chip", "Pad Stab"],
	fx: ["Riser", "Impact", "Sweep", "Glitch", "Noise Hit"],
	vocal: ["Chop A", "Chop B", "Air Vocal", "Phrase", "Hook Bit"],
};

const BPM_BY_GENRE: Record<Genre, [number, number]> = {
	Trap: [130, 155],
	EDM: [124, 140],
	"R&B": [70, 95],
	Drill: [138, 150],
	House: [118, 128],
	"Lo-Fi": [72, 90],
	Hyperpop: [140, 175],
	Afrobeats: [100, 120],
};

function pickGenre(rand: () => number, mode: "random" | Genre): Genre {
	if (mode !== "random") return mode;
	return GENRES[Math.floor(rand() * GENRES.length)]!;
}

function heatWarp(rand: () => number, heat: Heat, base: number): number {
	const chaos = (heat - 1) / 4;
	const jitter = (rand() - 0.5) * chaos * 0.9;
	return Math.min(1, Math.max(0, base + jitter));
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

	const samples: SampleDef[] = roles.map((role, i) => {
		const names = NAME_BANK[role];
		const name = names[Math.floor(rand() * names.length)]!;
		return {
			id: `s${i}`,
			name: heat >= 4 ? `${name}‽` : name,
			role,
			pitch: heatWarp(rand, heat, 0.35 + rand() * 0.3),
			tone: heatWarp(rand, heat, 0.3 + rand() * 0.45),
			decay: heatWarp(rand, heat, role === "hat" ? 0.25 : 0.45 + rand() * 0.35),
			noise: heatWarp(rand, heat, role === "snare" || role === "hat" ? 0.55 : 0.15),
			harmonics: heatWarp(rand, heat, role === "bass" || role === "melody" ? 0.55 : 0.25),
			filter: heatWarp(rand, heat, 0.4 + rand() * 0.4),
			drive: heatWarp(rand, heat, heat * 0.12 + rand() * 0.2),
		};
	});

	return { seed, genre, heat, bpm, samples };
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
