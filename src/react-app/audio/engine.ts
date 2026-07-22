/** Reference song synth + voice-lane playback for a cappella battles */

import type { Challenge, Project, VoiceRole } from "../../shared/types";
import { normalizeProject } from "../../shared/types";
import { mulberry32 } from "../../shared/packs";

function midiToHz(midi: number) {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function drumPattern(genre: Challenge["genre"]): {
	kick: number[];
	snare: number[];
	hat: number[];
} {
	if (genre === "House" || genre === "EDM") {
		return {
			kick: [0, 4, 8, 12],
			snare: [4, 12],
			hat: [0, 2, 4, 6, 8, 10, 12, 14],
		};
	}
	if (genre === "Drill") {
		return { kick: [0, 6, 8, 14], snare: [4, 12], hat: [0, 1, 2, 3, 8, 9, 10, 11] };
	}
	if (genre === "Lo-Fi" || genre === "R&B") {
		return { kick: [0, 6, 10], snare: [4, 12], hat: [2, 6, 8, 11, 14] };
	}
	return { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] };
}

function melodyContour(seed: number): number[] {
	const rand = mulberry32(seed ^ 0xabc);
	const degrees = [0, 2, 3, 5, 7, 8, 10, 12];
	return Array.from({ length: 16 }, (_, i) =>
		i % 2 === 0 ? degrees[Math.floor(rand() * degrees.length)]! : -99,
	);
}

function writeTone(
	data: Float32Array,
	sr: number,
	start: number,
	dur: number,
	freq: number,
	amp: number,
	type: "sine" | "square" | "noise" | "kick",
) {
	const n0 = Math.floor(start * sr);
	const n1 = Math.min(data.length, Math.floor((start + dur) * sr));
	for (let i = n0; i < n1; i++) {
		const t = (i - n0) / sr;
		const env = Math.exp(-t * (type === "kick" ? 8 : 6));
		let sig = 0;
		if (type === "noise") sig = (Math.random() * 2 - 1) * env;
		else if (type === "kick") {
			const f = freq * (1 + Math.exp(-t * 40) * 3);
			sig = Math.sin(2 * Math.PI * f * t) * env;
		} else if (type === "square") {
			sig = Math.sign(Math.sin(2 * Math.PI * freq * t)) * env * 0.5;
		} else sig = Math.sin(2 * Math.PI * freq * t) * env;
		data[i] = Math.max(-1, Math.min(1, (data[i] ?? 0) + sig * amp));
	}
}

/** Build a short reference "song clip" everyone hears */
export function renderReferenceBuffer(
	ctx: BaseAudioContext,
	challenge: Challenge,
): AudioBuffer {
	const sr = ctx.sampleRate;
	const stepDur = 60 / challenge.bpm / 4;
	const steps = 16 * challenge.bars;
	const dur = steps * stepDur + 0.3;
	const buffer = ctx.createBuffer(2, Math.ceil(sr * dur), sr);
	const L = buffer.getChannelData(0);
	const R = buffer.getChannelData(1);
	const mono = new Float32Array(L.length);

	const drums = drumPattern(challenge.genre);
	const contour = melodyContour(challenge.seed);
	const root = challenge.keyMidi;

	for (let s = 0; s < steps; s++) {
		const t = s * stepDur;
		const i = s % 16;
		if (drums.kick.includes(i)) {
			writeTone(mono, sr, t, 0.25, midiToHz(root - 12), 0.9, "kick");
		}
		if (drums.snare.includes(i)) {
			writeTone(mono, sr, t, 0.18, 180, 0.55, "noise");
			writeTone(mono, sr, t, 0.12, 220, 0.25, "sine");
		}
		if (drums.hat.includes(i)) {
			writeTone(mono, sr, t, 0.06, 8000, 0.22, "noise");
		}
		// bass
		if (drums.kick.includes(i) || i === 0 || i === 8) {
			const deg = i >= 8 ? -5 : 0;
			writeTone(mono, sr, t, stepDur * 1.6, midiToHz(root - 12 + deg), 0.55, "sine");
		}
		// melody
		const m = contour[i]!;
		if (m !== -99) {
			writeTone(
				mono,
				sr,
				t,
				stepDur * 1.4,
				midiToHz(root + 12 + m),
				0.35,
				challenge.genre === "Hyperpop" ? "square" : "sine",
			);
		}
		// harmony ghost
		if (i === 0 || i === 8) {
			writeTone(mono, sr, t, stepDur * 3, midiToHz(root + 19), 0.12, "sine");
		}
	}

	for (let i = 0; i < mono.length; i++) {
		L[i] = mono[i]!;
		R[i] = mono[i]! * 0.96;
	}
	return buffer;
}

async function decodeBase64Audio(
	ctx: BaseAudioContext,
	b64: string,
): Promise<AudioBuffer | null> {
	try {
		const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		return await ctx.decodeAudioData(bin.buffer.slice(0));
	} catch {
		return null;
	}
}

export class AcapellaEngine {
	ctx: AudioContext;
	master: GainNode;
	private timer: number | null = null;
	private nextNoteTime = 0;
	private currentStep = 0;
	private clipBuffers = new Map<string, AudioBuffer>();
	private reference: AudioBuffer | null = null;
	playing = false;
	playingRef = false;
	project: Project;
	onStep?: (step: number) => void;

	constructor(project: Project) {
		this.ctx = new AudioContext();
		this.project = normalizeProject(project);
		this.master = this.ctx.createGain();
		this.master.gain.value = this.project.masterGain;
		this.master.connect(this.ctx.destination);
	}

	async resume() {
		if (this.ctx.state !== "running") await this.ctx.resume();
	}

	async setChallenge(challenge: Challenge) {
		this.reference = renderReferenceBuffer(this.ctx, challenge);
	}

	async setProject(project: Project) {
		this.project = normalizeProject(project);
		this.master.gain.value = this.project.masterGain;
		this.clipBuffers.clear();
		for (const clip of this.project.clips) {
			const buf = await decodeBase64Audio(this.ctx, clip.audioBase64);
			if (buf) this.clipBuffers.set(clip.id, buf);
		}
	}

	async playReference() {
		await this.resume();
		this.stop();
		if (!this.reference) return;
		this.playingRef = true;
		const src = this.ctx.createBufferSource();
		src.buffer = this.reference;
		src.connect(this.master);
		src.onended = () => {
			this.playingRef = false;
		};
		src.start();
		// stash for stop
		(this as unknown as { _refSrc?: AudioBufferSourceNode })._refSrc = src;
	}

	private secondsPerStep() {
		return 60 / this.project.bpm / 4;
	}

	private scheduleLane(role: VoiceRole, stepIdx: number, time: number) {
		const lane = this.project.lanes.find((l) => l.role === role);
		if (!lane || lane.mute || !lane.steps[stepIdx] || !lane.clipId) return;
		const buf = this.clipBuffers.get(lane.clipId);
		if (!buf) return;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		src.playbackRate.value = Math.pow(2, lane.pitch / 12);
		const g = this.ctx.createGain();
		g.gain.value = lane.gain;
		src.connect(g);
		g.connect(this.master);
		src.start(time);
	}

	private scheduler = () => {
		const lookAhead = 0.12;
		const stepDur = this.secondsPerStep();
		const total = 16 * this.project.bars;
		while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
			const idx = this.currentStep % 16;
			const swing = idx % 2 === 1 ? this.project.swing * stepDur * 0.55 : 0;
			const t = this.nextNoteTime + swing;
			for (const lane of this.project.lanes) {
				this.scheduleLane(lane.role, idx, t);
			}
			this.onStep?.(this.currentStep % total);
			this.nextNoteTime += stepDur;
			this.currentStep = (this.currentStep + 1) % total;
		}
		this.timer = window.setTimeout(this.scheduler, 25);
	};

	async playRemake() {
		await this.resume();
		this.stop();
		this.playing = true;
		this.currentStep = 0;
		this.nextNoteTime = this.ctx.currentTime + 0.05;
		this.scheduler();
	}

	stop() {
		this.playing = false;
		this.playingRef = false;
		if (this.timer != null) clearTimeout(this.timer);
		this.timer = null;
		const refSrc = (this as unknown as { _refSrc?: AudioBufferSourceNode })._refSrc;
		try {
			refSrc?.stop();
		} catch {
			/* */
		}
		this.currentStep = 0;
		this.onStep?.(0);
	}

	async previewClip(clipId: string) {
		await this.resume();
		const buf = this.clipBuffers.get(clipId);
		if (!buf) return;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		src.connect(this.master);
		src.start();
	}

	dispose() {
		this.stop();
		void this.ctx.close();
	}
}

export async function renderRemakeWav(projectIn: Project): Promise<Blob> {
	const project = normalizeProject(projectIn);
	const sr = 44100;
	const stepDur = 60 / project.bpm / 4;
	const total = 16 * project.bars * 2;
	const offline = new OfflineAudioContext(2, Math.ceil(sr * (total * stepDur + 0.5)), sr);
	const buffers = new Map<string, AudioBuffer>();
	for (const clip of project.clips) {
		const buf = await decodeBase64Audio(offline, clip.audioBase64);
		if (buf) buffers.set(clip.id, buf);
	}
	const master = offline.createGain();
	master.gain.value = project.masterGain;
	master.connect(offline.destination);

	for (let step = 0; step < total; step++) {
		const idx = step % 16;
		const swing = idx % 2 === 1 ? project.swing * stepDur * 0.55 : 0;
		const time = step * stepDur + swing;
		for (const lane of project.lanes) {
			if (lane.mute || !lane.steps[idx] || !lane.clipId) continue;
			const buf = buffers.get(lane.clipId);
			if (!buf) continue;
			const src = offline.createBufferSource();
			src.buffer = buf;
			src.playbackRate.value = Math.pow(2, lane.pitch / 12);
			const g = offline.createGain();
			g.gain.value = lane.gain;
			src.connect(g);
			g.connect(master);
			src.start(time);
		}
	}
	const rendered = await offline.startRendering();
	return audioBufferToWav(rendered);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numChan = buffer.numberOfChannels;
	const sr = buffer.sampleRate;
	const samples = buffer.length;
	const blockAlign = (numChan * 16) / 8;
	const dataSize = samples * blockAlign;
	const ab = new ArrayBuffer(44 + dataSize);
	const view = new DataView(ab);
	const w = (o: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
	};
	w(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	w(8, "WAVE");
	w(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, numChan, true);
	view.setUint32(24, sr, true);
	view.setUint32(28, sr * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);
	w(36, "data");
	view.setUint32(40, dataSize, true);
	let off = 44;
	const chans = Array.from({ length: numChan }, (_, c) => buffer.getChannelData(c));
	for (let i = 0; i < samples; i++) {
		for (let c = 0; c < numChan; c++) {
			const s = Math.max(-1, Math.min(1, chans[c]![i]!));
			view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			off += 2;
		}
	}
	return new Blob([ab], { type: "audio/wav" });
}
