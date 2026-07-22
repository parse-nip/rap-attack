/** Web Audio sample synthesis + sequencer engine for Beat Battle */

import type { Pack, Project, SampleDef, TrackPattern } from "../../shared/types";

export type LoadedSample = {
	def: SampleDef;
	buffer: AudioBuffer;
};

function midiToHz(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function roleBaseMidi(role: SampleDef["role"]): number {
	switch (role) {
		case "kick":
			return 36;
		case "snare":
			return 40;
		case "hat":
			return 42;
		case "perc":
			return 60;
		case "bass":
			return 36;
		case "melody":
			return 64;
		case "fx":
			return 72;
		case "vocal":
			return 60;
		default:
			return 60;
	}
}

/** Synthesize a one-shot into an AudioBuffer from SampleDef */
export function synthesizeSample(
	ctx: BaseAudioContext,
	def: SampleDef,
): AudioBuffer {
	const sr = ctx.sampleRate;
	const dur = 0.08 + def.decay * 0.9;
	const len = Math.ceil(sr * dur);
	const buffer = ctx.createBuffer(1, len, sr);
	const data = buffer.getChannelData(0);
	const baseMidi = roleBaseMidi(def.role) + (def.pitch - 0.5) * 24;
	const freq = midiToHz(baseMidi);

	for (let i = 0; i < len; i++) {
		const t = i / sr;
		const env = Math.exp(-t * (1.5 + (1 - def.decay) * 12));
		let sig = 0;

		if (def.role === "kick") {
			const f = freq * (1 + Math.exp(-t * 40) * 2.5);
			sig = Math.sin(2 * Math.PI * f * t) * env;
			sig += (Math.random() * 2 - 1) * 0.05 * Math.exp(-t * 80);
		} else if (def.role === "snare") {
			const tone = Math.sin(2 * Math.PI * freq * 1.8 * t) * env * (1 - def.noise);
			const noise = (Math.random() * 2 - 1) * Math.exp(-t * (8 + def.tone * 20));
			sig = tone + noise * def.noise;
		} else if (def.role === "hat") {
			sig =
				(Math.random() * 2 - 1) *
				Math.exp(-t * (20 + (1 - def.decay) * 60)) *
				(0.5 + def.noise * 0.5);
			sig += Math.sin(2 * Math.PI * (6000 + def.tone * 4000) * t) * env * 0.15;
		} else if (def.role === "bass") {
			const f = freq * (0.5 + def.pitch);
			sig = Math.sin(2 * Math.PI * f * t) * env;
			sig += Math.sin(2 * Math.PI * f * 2 * t) * env * def.harmonics * 0.4;
			sig += Math.sin(2 * Math.PI * f * 3 * t) * env * def.harmonics * 0.15;
			if (def.drive > 0.3) sig = Math.tanh(sig * (1 + def.drive * 4));
		} else if (def.role === "melody" || def.role === "vocal") {
			const partials = 1 + Math.floor(def.harmonics * 5);
			for (let h = 1; h <= partials; h++) {
				const amp = (1 / h) * Math.pow(def.harmonics, h - 1);
				sig += Math.sin(2 * Math.PI * freq * h * t) * amp;
			}
			sig *= env * (0.7 + def.tone * 0.3);
			if (def.role === "vocal") {
				sig *= 0.7 + 0.3 * Math.sin(2 * Math.PI * (5 + def.tone * 4) * t);
			}
		} else if (def.role === "fx") {
			const sweep = freq * (1 + t * (2 + def.pitch * 6));
			sig = Math.sin(2 * Math.PI * sweep * t) * env;
			sig += (Math.random() * 2 - 1) * env * def.noise * 0.5;
		} else {
			// perc
			sig = Math.sin(2 * Math.PI * freq * t) * env * (1 - def.noise * 0.5);
			sig += (Math.random() * 2 - 1) * Math.exp(-t * 30) * def.noise;
		}

		// soft clip + drive
		sig = Math.tanh(sig * (1 + def.drive * 3));
		data[i] = sig * 0.9;
	}

	return buffer;
}

export async function loadPackBuffers(
	ctx: AudioContext,
	pack: Pack,
): Promise<Map<string, LoadedSample>> {
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
	private timer: number | null = null;
	private nextNoteTime = 0;
	private currentStep = 0;
	playing = false;
	project: Project;
	onStep?: (step: number) => void;

	constructor(project: Project) {
		this.ctx = new AudioContext();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.85;
		this.master.connect(this.ctx.destination);
		this.project = project;
	}

	async loadPack(pack: Pack) {
		this.samples = await loadPackBuffers(this.ctx, pack);
	}

	setProject(project: Project) {
		this.project = project;
	}

	async resume() {
		if (this.ctx.state !== "running") await this.ctx.resume();
	}

	private secondsPerStep(): number {
		const bpm = this.project.bpm;
		return 60 / bpm / 4; // 16th notes
	}

	private scheduleNote(track: TrackPattern, time: number) {
		const sample = this.samples.get(track.sampleId);
		if (!sample || track.mute) return;

		const anySolo = this.project.tracks.some((t) => t.solo);
		if (anySolo && !track.solo) return;

		const src = this.ctx.createBufferSource();
		src.buffer = sample.buffer;
		const rate = Math.pow(2, track.pitch / 12);
		src.playbackRate.value = rate;

		const filter = this.ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 300 + track.filter * 12000;

		const drive = this.ctx.createWaveShaper();
		drive.curve = makeDistortionCurve(track.drive * 80);
		drive.oversample = "2x";

		const gain = this.ctx.createGain();
		gain.gain.value = track.gain;

		src.connect(filter);
		filter.connect(drive);
		drive.connect(gain);
		gain.connect(this.master);
		src.start(time);
	}

	private scheduler = () => {
		const lookAhead = 0.12;
		const stepDur = this.secondsPerStep();
		const totalSteps = 16 * this.project.bars;

		while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
			const stepInBar = this.currentStep % 16;
			const swing =
				stepInBar % 2 === 1 ? this.project.swing * stepDur * 0.6 : 0;
			const t = this.nextNoteTime + swing;

			for (const track of this.project.tracks) {
				const idx = this.currentStep % 16;
				if (track.steps[idx]) this.scheduleNote(track, t);
			}

			this.onStep?.(this.currentStep % totalSteps);
			this.nextNoteTime += stepDur;
			this.currentStep = (this.currentStep + 1) % totalSteps;
		}
		this.timer = window.setTimeout(this.scheduler, 25);
	};

	async play() {
		await this.resume();
		if (this.playing) return;
		this.playing = true;
		this.currentStep = 0;
		this.nextNoteTime = this.ctx.currentTime + 0.05;
		this.scheduler();
	}

	stop() {
		this.playing = false;
		if (this.timer != null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.currentStep = 0;
		this.onStep?.(0);
	}

	/** One-shot preview of a sample */
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

	/** Offline-ish live playthrough of one loop for voting (starts play) */
	dispose() {
		this.stop();
		void this.ctx.close();
	}
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
	const n = 256;
	const curve = new Float32Array(n);
	const deg = Math.PI / 180;
	for (let i = 0; i < n; i++) {
		const x = (i * 2) / n - 1;
		curve[i] =
			((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
	}
	return curve;
}

/** Encode a short offline render of the project to a WAV blob (optional download) */
export async function renderProjectWav(
	pack: Pack,
	project: Project,
	loops = 2,
): Promise<Blob> {
	const sr = 44100;
	const stepDur = 60 / project.bpm / 4;
	const totalSteps = 16 * project.bars * loops;
	const duration = totalSteps * stepDur + 0.5;
	const offline = new OfflineAudioContext(2, Math.ceil(sr * duration), sr);
	const samples = new Map<string, LoadedSample>();
	for (const def of pack.samples) {
		samples.set(def.id, { def, buffer: synthesizeSample(offline, def) });
	}

	const master = offline.createGain();
	master.gain.value = 0.85;
	master.connect(offline.destination);

	for (let step = 0; step < totalSteps; step++) {
		const stepInBar = step % 16;
		const swing = stepInBar % 2 === 1 ? project.swing * stepDur * 0.6 : 0;
		const time = step * stepDur + swing;
		for (const track of project.tracks) {
			if (!track.steps[step % 16] || track.mute) continue;
			const anySolo = project.tracks.some((t) => t.solo);
			if (anySolo && !track.solo) continue;
			const sample = samples.get(track.sampleId);
			if (!sample) continue;
			const src = offline.createBufferSource();
			src.buffer = sample.buffer;
			src.playbackRate.value = Math.pow(2, track.pitch / 12);
			const filter = offline.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 300 + track.filter * 12000;
			const gain = offline.createGain();
			gain.gain.value = track.gain;
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
	const format = 1;
	const bitDepth = 16;
	const samples = buffer.length;
	const blockAlign = (numChan * bitDepth) / 8;
	const byteRate = sr * blockAlign;
	const dataSize = samples * blockAlign;
	const ab = new ArrayBuffer(44 + dataSize);
	const view = new DataView(ab);

	writeStr(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeStr(view, 8, "WAVE");
	writeStr(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, format, true);
	view.setUint16(22, numChan, true);
	view.setUint32(24, sr, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeStr(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;
	const channels: Float32Array[] = [];
	for (let c = 0; c < numChan; c++) channels.push(buffer.getChannelData(c));
	for (let i = 0; i < samples; i++) {
		for (let c = 0; c < numChan; c++) {
			const s = Math.max(-1, Math.min(1, channels[c]![i]!));
			view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			offset += 2;
		}
	}
	return new Blob([ab], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, str: string) {
	for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
