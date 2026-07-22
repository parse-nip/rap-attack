import type { Challenge, Genre, Heat, VoiceRole } from "./types";
import { GENRES } from "./types";

export function mulberry32(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

const BPM: Record<Genre, [number, number]> = {
	Trap: [136, 146],
	EDM: [126, 130],
	"R&B": [78, 90],
	Drill: [140, 146],
	House: [122, 126],
	"Lo-Fi": [76, 86],
	Hyperpop: [150, 165],
	Afrobeats: [104, 112],
};

const KEYS = [48, 50, 52, 53, 55, 57]; // C3–A3

const TITLES: Record<Genre, string[]> = {
	Trap: ["Chrome Heart", "Night Slide", "Trunk Prayer"],
	EDM: ["Peak Protocol", "Grid Drop", "Neon Run"],
	"R&B": ["Velvet Line", "Slow Signal", "Soft Clock"],
	Drill: ["Cold Bars", "Slide Report", "Block Tone"],
	House: ["Floor Confession", "Disco Wire", "Pulse Room"],
	"Lo-Fi": ["Tape Window", "Dust Loop", "Rain Desk"],
	Hyperpop: ["Sugar Glitch", "Cry Pixel", "Candy Static"],
	Afrobeats: ["Sunset Log", "Lagos Skip", "Gold Bounce"],
};

const VIBES: Record<Genre, string[]> = {
	Trap: [
		"Dark melodic trap clip — catch the 808 pocket and the short hook.",
		"Hard trap — recreate the slap with mouth drums + hummed bass.",
	],
	EDM: [
		"Festival drop energy — four-on-the-floor and a sticky lead.",
		"Big room pulse — drums locked, melody is the star.",
	],
	"R&B": [
		"Late-night R&B — soft drums, warm bass, sing the line.",
		"Silky groove — harmony stacks will win this one.",
	],
	Drill: [
		"Cold drill clip — sparse kicks, busy hats, mean bass.",
		"UK pressure — snare on the 3, bass short and nasty.",
	],
	House: [
		"Classic house loop — kick never stops, sing the stab.",
		"Club keys energy — bassline + chant melody.",
	],
	"Lo-Fi": [
		"Dusty loop — imperfect is correct. Hum it lazy.",
		"Study beat — soft kick, pretty melody, airy harmony.",
	],
	Hyperpop: [
		"Too bright, too much — scream-sing the hook, chaotic drums.",
		"Glitch sugar — weird FX mouth noises welcome.",
	],
	Afrobeats: [
		"Perc-forward bounce — beatbox the groove, sing the sunshine.",
		"Log-drum energy — melody first, bass simple.",
	],
};

function pickGenre(rand: () => number, mode: "random" | Genre): Genre {
	if (mode !== "random") return mode;
	return GENRES[Math.floor(rand() * GENRES.length)]!;
}

export function generateChallenge(
	seed: number,
	heat: Heat,
	genreMode: "random" | Genre,
): Challenge {
	const rand = mulberry32(seed);
	const genre = pickGenre(rand, genreMode);
	const [lo, hi] = BPM[genre];
	const bpm = Math.round(lo + rand() * (hi - lo));
	const title = TITLES[genre][Math.floor(rand() * TITLES[genre].length)]!;
	const vibe = VIBES[genre][Math.floor(rand() * VIBES[genre].length)]!;
	const keyMidi = KEYS[Math.floor(rand() * KEYS.length)]!;

	const mustRoles: VoiceRole[] = ["drums", "bass", "melody"];
	if (heat >= 3) mustRoles.push("harmony");
	if (heat >= 5) mustRoles.push("fx");

	const hint =
		heat >= 4
			? "High heat: record wild one-shots, then stamp them everywhere."
			: "Record one short mouth sound at a time, then copy it on the timeline.";

	return {
		seed,
		genre,
		heat,
		title,
		vibe,
		bpm,
		keyMidi,
		bars: 2,
		mustRoles,
		hint,
	};
}

/** @deprecated alias while lobby migrates */
export function generatePack(
	seed: number,
	heat: Heat,
	genreMode: "random" | Genre,
) {
	return generateChallenge(seed, heat, genreMode);
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
