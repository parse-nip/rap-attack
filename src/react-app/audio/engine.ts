/** Simple Web Audio engine for Beat Ranked */

import type { Pack, Project, SampleDef, TrackPattern } from "../../shared/types";
import { asStep, normalizeProject, stepOn } from "../../shared/types";

export type LoadedSample = { def: SampleDef; buffer: AudioBuffer };

function midiToHz(midi: number) {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

export function synthesizeSample(ctx: BaseAudioContext, def: SampleDef): AudioBuffer {
	const sr = ctx.sampleRate;
	const dur =
		def.role === "kick" || def.role === "bass"
			? 0.2 + def.decay * 0.7
			: 0.1 + def.decay * 0.7;
	const len = Math.ceil(sr * dur);
	const buffer = ctx.createBuffer(1, len, sr);
	const data = buffer.getChannelData(0);
	const freq = midiToHz(def.rootMidi + (def.pitch - 0.5) * 4);

	for (let i = 0; i < len; i++) {
		const t = i / sr;
		const env = Math.exp(-t * (1.2 + (1 - def.decay) * 10));
		let sig = 0;
		if (def.role === "kick") {
			const f = freq * (1 + Math.exp(-t * 35) * 3.2);
			sig = Math.sin(2 * Math.PI * f * t) * env;
		} else if (def.role === "snare") {
			sig =
				Math.sin(2 * Math.PI * 180 * t) * env * 0.4 +
				(Math.random() * 2 - 1) * Math.exp(-t * 14) * 0.7;
		} else if (def.role === "hat") {
			sig = (Math.random() * 2 - 1) * Math.exp(-t * (25 + (1 - def.decay) * 50));
		} else if (def.role === "bass") {
			sig = Math.tanh(
				(Math.sin(2 * Math.PI * freq * t) +
					Math.sin(2 * Math.PI * freq * 2 * t) * 0.3) *
					env *
					1.5,
			);
		} else if (def.role === "melody" || def.role === "vocal") {
			sig =
				(Math.sin(2 * Math.PI * freq * t) +
					Math.sin(2 * Math.PI * freq * 2 * t) * 0.35) *
				env;
			if (def.role === "vocal") {
				sig *= 0.8 + 0.2 * Math.sin(2 * Math.PI * 5 * t);
			}
		} else if (def.role === "fx") {
			sig = Math.sin(2 * Math.PI * freq * (1 + t * 3) * t) * env;
		} else {
			sig =
				Math.sin(2 * Math.PI * freq * t) * env * 0.7 +
				(Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.3;
		}
		data[i] = Math.tanh(sig) * 0.9;
	}
	return buffer;
}

export async function loadPackBuffers(ctx: BaseAudioContext, pack: Pack) {
	const map = new Map<string, LoadedSample>();
	for (const def of pack.samples) {
		map.set(def.id, { def, buffer: synthesizeSample(ctx, def) });
	}
	return map;
}

export class DawEngine {
	ctx: AudioContext;
	master: GainNode;
	private samples = new Map<string, LoadedSample>();
	private tagBuffer: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextNoteTime = 0;
	private currentStep = 0;
	playing = false;
	project: Project;
	onStep?: (step: number) => void;

	constructor(project: Project) {
		this.ctx = new AudioContext();
		this.project = normalizeProject(project);
		this.master = this.ctx.createGain();
		this.master.gain.value = this.project.masterGain;
		this.master.connect(this.ctx.destination);
	}

	async loadPack(pack: Pack) {
		this.samples = await loadPackBuffers(this.ctx, pack);
	}

	async setProject(project: Project) {
		this.project = normalizeProject(project);
		this.master.gain.value = this.project.masterGain;
		await this.loadTag(this.project);
	}

	private async loadTag(project: Project) {
		if (!project.tagAudio) {
			this.tagBuffer = null;
			return;
		}
		try {
			const bin = Uint8Array.from(atob(project.tagAudio), (c) => c.charCodeAt(0));
			this.tagBuffer = await this.ctx.decodeAudioData(bin.buffer.slice(0));
		} catch {
			this.tagBuffer = null;
		}
	}

	async resume() {
		if (this.ctx.state !== "running") await this.ctx.resume();
	}

	private secondsPerStep() {
		return 60 / this.project.bpm / 4;
	}

	private scheduleNote(track: TrackPattern, stepIdx: number, time: number) {
		const cell = asStep(track.steps[stepIdx]);
		if (!cell.on || track.mute) return;
		const sample = this.samples.get(track.sampleId);
		if (!sample) return;
		const anySolo = this.project.tracks.some((t) => t.solo);
		if (anySolo && !track.solo) return;

		const src = this.ctx.createBufferSource();
		src.buffer = sample.buffer;
		src.playbackRate.value = Math.pow(2, (track.pitch + cell.pitch) / 12);

		const filter = this.ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 300 + track.filter * 12000;

		const gain = this.ctx.createGain();
		gain.gain.value = track.gain * cell.velocity;

		src.connect(filter);
		filter.connect(gain);
		gain.connect(this.master);
		src.start(time);
	}

	private playTag(time: number) {
		if (!this.tagBuffer) return;
		const src = this.ctx.createBufferSource();
		src.buffer = this.tagBuffer;
		const g = this.ctx.createGain();
		g.gain.value = 0.95;
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
			const swing = idx % 2 === 1 ? this.project.swing * stepDur * 0.6 : 0;
			const t = this.nextNoteTime + swing;
			for (const track of this.project.tracks) {
				this.scheduleNote(track, idx, t);
			}
			this.onStep?.(this.currentStep % total);
			this.nextNoteTime += stepDur;
			this.currentStep = (this.currentStep + 1) % total;
		}
		this.timer = window.setTimeout(this.scheduler, 25);
	};

	async play() {
		await this.resume();
		if (this.playing) return;
		await this.loadTag(this.project);
		this.playing = true;
		this.currentStep = 0;
		const lead = this.tagBuffer
			? Math.min(1.1, this.tagBuffer.duration * 0.85)
			: 0.05;
		this.nextNoteTime = this.ctx.currentTime + Math.max(0.05, lead);
		if (this.tagBuffer) this.playTag(this.ctx.currentTime + 0.02);
		this.scheduler();
	}

	stop() {
		this.playing = false;
		if (this.timer != null) clearTimeout(this.timer);
		this.timer = null;
		this.currentStep = 0;
		this.onStep?.(0);
	}

	async preview(sampleId: string, pitch = 0, gain = 0.8) {
		await this.resume();
		const sample = this.samples.get(sampleId);
		if (!sample) return;
		const src = this.ctx.createBufferSource();
		src.buffer = sample.buffer;
		src.playbackRate.value = Math.pow(2, pitch / 12);
		const g = this.ctx.createGain();
		g.gain.value = gain;
		src.connect(g);
		g.connect(this.master);
		src.start();
	}

	dispose() {
		this.stop();
		void this.ctx.close();
	}
}

export async function renderProjectWav(
	pack: Pack,
	projectIn: Project,
	loops = 2,
): Promise<Blob> {
	const project = normalizeProject(projectIn);
	const sr = 44100;
	const stepDur = 60 / project.bpm / 4;
	const totalSteps = 16 * project.bars * loops;

	let tagBuf: AudioBuffer | null = null;
	if (project.tagAudio) {
		try {
			const tmp = new OfflineAudioContext(1, 1, sr);
			const bin = Uint8Array.from(atob(project.tagAudio), (c) => c.charCodeAt(0));
			tagBuf = await tmp.decodeAudioData(bin.buffer.slice(0));
		} catch {
			tagBuf = null;
		}
	}
	const lead = tagBuf ? Math.min(1.2, tagBuf.duration * 0.9) : 0;
	const offline = new OfflineAudioContext(
		2,
		Math.ceil(sr * (lead + totalSteps * stepDur + 0.5)),
		sr,
	);
	const samples = await loadPackBuffers(offline, pack);
	const master = offline.createGain();
	master.gain.value = project.masterGain;
	master.connect(offline.destination);

	if (tagBuf) {
		const src = offline.createBufferSource();
		src.buffer = tagBuf;
		const g = offline.createGain();
		g.gain.value = 0.95;
		src.connect(g);
		g.connect(master);
		src.start(0.02);
	}

	for (let step = 0; step < totalSteps; step++) {
		const idx = step % 16;
		const swing = idx % 2 === 1 ? project.swing * stepDur * 0.6 : 0;
		const time = lead + step * stepDur + swing;
		for (const track of project.tracks) {
			const cell = asStep(track.steps[idx]);
			if (!cell.on || track.mute) continue;
			const anySolo = project.tracks.some((t) => t.solo);
			if (anySolo && !track.solo) continue;
			const sample = samples.get(track.sampleId);
			if (!sample) continue;
			const src = offline.createBufferSource();
			src.buffer = sample.buffer;
			src.playbackRate.value = Math.pow(2, (track.pitch + cell.pitch) / 12);
			const filter = offline.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 300 + track.filter * 12000;
			const gain = offline.createGain();
			gain.gain.value = track.gain * cell.velocity;
			src.connect(filter);
			filter.connect(gain);
			gain.connect(master);
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

export { stepOn };
