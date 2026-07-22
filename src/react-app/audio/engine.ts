/** Web Audio sample synthesis + sequencer engine for Beat Battle */

import type { Pack, Project, SampleDef, TrackPattern } from "../../shared/types";

export type LoadedSample = {
	def: SampleDef;
	buffer: AudioBuffer;
};

function midiToHz(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Synthesize a one-shot into an AudioBuffer from SampleDef */
export function synthesizeSample(
	ctx: BaseAudioContext,
	def: SampleDef,
): AudioBuffer {
	const sr = ctx.sampleRate;
	const dur =
		def.role === "kick" || def.role === "bass"
			? 0.18 + def.decay * 0.7
			: 0.08 + def.decay * 0.75;
	const len = Math.ceil(sr * dur);
	const buffer = ctx.createBuffer(1, len, sr);
	const data = buffer.getChannelData(0);
	const baseMidi = def.rootMidi + (def.pitch - 0.5) * 4;
	const freq = midiToHz(baseMidi);

	for (let i = 0; i < len; i++) {
		const t = i / sr;
		const env = Math.exp(-t * (1.2 + (1 - def.decay) * 10));
		let sig = 0;

		if (def.role === "kick") {
			const f = freq * (1 + Math.exp(-t * 35) * 3.2);
			sig = Math.sin(2 * Math.PI * f * t) * env;
			sig += (Math.random() * 2 - 1) * 0.04 * Math.exp(-t * 90);
		} else if (def.role === "snare") {
			const tone = Math.sin(2 * Math.PI * 180 * t) * env * (1 - def.noise * 0.6);
			const noise = (Math.random() * 2 - 1) * Math.exp(-t * (10 + def.tone * 18));
			sig = tone + noise * (0.45 + def.noise * 0.5);
		} else if (def.role === "hat") {
			sig =
				(Math.random() * 2 - 1) *
				Math.exp(-t * (22 + (1 - def.decay) * 55)) *
				(0.55 + def.noise * 0.4);
			sig += Math.sin(2 * Math.PI * (7000 + def.tone * 3500) * t) * env * 0.12;
		} else if (def.role === "bass") {
			const f = freq;
			sig = Math.sin(2 * Math.PI * f * t) * env;
			sig += Math.sin(2 * Math.PI * f * 2 * t) * env * def.harmonics * 0.35;
			sig += Math.sin(2 * Math.PI * f * 3 * t) * env * def.harmonics * 0.12;
			sig = Math.tanh(sig * (1.4 + def.drive * 3));
		} else if (def.role === "melody" || def.role === "vocal") {
			const partials = 1 + Math.floor(def.harmonics * 4);
			for (let h = 1; h <= partials; h++) {
				const amp = (1 / h) * Math.pow(0.85, h - 1);
				sig += Math.sin(2 * Math.PI * freq * h * t) * amp;
			}
			sig *= env * (0.75 + def.tone * 0.25);
			if (def.role === "vocal") {
				sig *= 0.75 + 0.25 * Math.sin(2 * Math.PI * (4.5 + def.tone * 3) * t);
			}
		} else if (def.role === "fx") {
			const sweep = freq * (1 + t * (1.5 + def.pitch * 4));
			sig = Math.sin(2 * Math.PI * sweep * t) * env;
			sig += (Math.random() * 2 - 1) * env * def.noise * 0.4;
		} else {
			sig = Math.sin(2 * Math.PI * freq * t) * env * (1 - def.noise * 0.4);
			sig += (Math.random() * 2 - 1) * Math.exp(-t * 28) * def.noise;
		}

		sig = Math.tanh(sig * (1 + def.drive * 2.5));
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
	private tagBuffer: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextNoteTime = 0;
	private currentStep = 0;
	private tagPlayedThisLoop = false;
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

	async setProject(project: Project) {
		this.project = project;
		await this.loadTag(project);
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

	private secondsPerStep(): number {
		const bpm = this.project.bpm;
		return 60 / bpm / 4; // 16th notes
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

			// Producer tag plays once at the very start of playback
			if (this.currentStep === 0 && !this.tagPlayedThisLoop) {
				this.playTag(Math.max(0, t - 0.02));
				this.tagPlayedThisLoop = true;
			}

			for (const track of this.project.tracks) {
				const idx = this.currentStep % 16;
				if (track.steps[idx]) this.scheduleNote(track, t);
			}

			this.onStep?.(this.currentStep % totalSteps);
			this.nextNoteTime += stepDur;
			this.currentStep = (this.currentStep + 1) % totalSteps;
			if (this.currentStep === 0) {
				// Only play tag on the first loop of a Play press
			}
		}
		this.timer = window.setTimeout(this.scheduler, 25);
	};

	async play() {
		await this.resume();
		if (this.playing) return;
		await this.loadTag(this.project);
		this.playing = true;
		this.currentStep = 0;
		this.tagPlayedThisLoop = false;
		// Leave a little runway so the tag can breathe before the groove
		const lead = this.tagBuffer ? Math.min(1.1, this.tagBuffer.duration * 0.85) : 0.05;
		this.nextNoteTime = this.ctx.currentTime + Math.max(0.05, lead);
		if (this.tagBuffer) {
			this.playTag(this.ctx.currentTime + 0.02);
			this.tagPlayedThisLoop = true;
		}
		this.scheduler();
	}

	stop() {
		this.playing = false;
		if (this.timer != null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this.currentStep = 0;
		this.tagPlayedThisLoop = false;
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

	async previewTag() {
		await this.resume();
		await this.loadTag(this.project);
		if (!this.tagBuffer) return;
		this.playTag(this.ctx.currentTime);
	}

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
	const duration = lead + totalSteps * stepDur + 0.5;
	const offline = new OfflineAudioContext(2, Math.ceil(sr * duration), sr);
	const samples = new Map<string, LoadedSample>();
	for (const def of pack.samples) {
		samples.set(def.id, { def, buffer: synthesizeSample(offline, def) });
	}

	const master = offline.createGain();
	master.gain.value = 0.85;
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
		const stepInBar = step % 16;
		const swing = stepInBar % 2 === 1 ? project.swing * stepDur * 0.6 : 0;
		const time = lead + step * stepDur + swing;
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
