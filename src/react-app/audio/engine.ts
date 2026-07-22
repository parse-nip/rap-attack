/** Full-featured Web Audio engine for Beat Ranked */

import type { Pack, Project, SampleDef, StepCell, TrackPattern } from "../../shared/types";
import { asStep, normalizeProject, stepOn } from "../../shared/types";

export type LoadedSample = {
	def: SampleDef;
	buffer: AudioBuffer;
};

function midiToHz(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

export function synthesizeSample(
	ctx: BaseAudioContext,
	def: SampleDef,
): AudioBuffer {
	const sr = ctx.sampleRate;
	const dur =
		def.role === "kick" || def.role === "bass"
			? 0.2 + def.decay * 0.75
			: def.role === "melody" || def.role === "vocal"
				? 0.15 + def.decay * 0.85
				: 0.08 + def.decay * 0.7;
	const len = Math.ceil(sr * dur);
	const buffer = ctx.createBuffer(1, len, sr);
	const data = buffer.getChannelData(0);
	const baseMidi = def.rootMidi + (def.pitch - 0.5) * 4;
	const freq = midiToHz(baseMidi);

	for (let i = 0; i < len; i++) {
		const t = i / sr;
		const env = Math.exp(-t * (1.15 + (1 - def.decay) * 10));
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
			sig = Math.sin(2 * Math.PI * freq * t) * env;
			sig += Math.sin(2 * Math.PI * freq * 2 * t) * env * def.harmonics * 0.35;
			sig += Math.sin(2 * Math.PI * freq * 3 * t) * env * def.harmonics * 0.12;
			sig = Math.tanh(sig * (1.4 + def.drive * 3));
		} else if (def.role === "melody" || def.role === "vocal") {
			const partials = 1 + Math.floor(def.harmonics * 4);
			for (let h = 1; h <= partials; h++) {
				sig += Math.sin(2 * Math.PI * freq * h * t) * ((1 / h) * Math.pow(0.85, h - 1));
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

function reverseBuffer(ctx: BaseAudioContext, src: AudioBuffer): AudioBuffer {
	const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
	for (let c = 0; c < src.numberOfChannels; c++) {
		const a = src.getChannelData(c);
		const b = out.getChannelData(c);
		for (let i = 0; i < a.length; i++) b[i] = a[a.length - 1 - i]!;
	}
	return out;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
	const rate = ctx.sampleRate;
	const len = Math.floor(rate * seconds);
	const impulse = ctx.createBuffer(2, len, rate);
	for (let c = 0; c < 2; c++) {
		const ch = impulse.getChannelData(c);
		for (let i = 0; i < len; i++) {
			ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
		}
	}
	return impulse;
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
	const n = 256;
	const curve = new Float32Array(n);
	const deg = Math.PI / 180;
	for (let i = 0; i < n; i++) {
		const x = (i * 2) / n - 1;
		curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
	}
	return curve;
}

export async function loadPackBuffers(
	ctx: BaseAudioContext,
	pack: Pack,
): Promise<Map<string, LoadedSample>> {
	const map = new Map<string, LoadedSample>();
	for (const def of pack.samples) {
		map.set(def.id, { def, buffer: synthesizeSample(ctx, def) });
	}
	return map;
}

type Bus = {
	input: GainNode;
	pan: StereoPannerNode;
	filter: BiquadFilterNode;
	drive: WaveShaperNode;
	dry: GainNode;
	reverbSend: GainNode;
	delaySend: GainNode;
};

export class DawEngine {
	ctx: AudioContext;
	master: GainNode;
	private compressor: DynamicsCompressorNode;
	private masterFilter: BiquadFilterNode;
	private reverb: ConvolverNode;
	private reverbGain: GainNode;
	private delay: DelayNode;
	private delayFeedback: GainNode;
	private delayGain: GainNode;
	private crush: WaveShaperNode;
	private samples = new Map<string, LoadedSample>();
	private tagBuffer: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextNoteTime = 0;
	private currentStep = 0;
	playing = false;
	project: Project;
	onStep?: (step: number) => void;
	onMeter?: (levels: number[]) => void;

	constructor(project: Project) {
		this.ctx = new AudioContext();
		this.project = normalizeProject(project);

		this.master = this.ctx.createGain();
		this.compressor = this.ctx.createDynamicsCompressor();
		this.compressor.threshold.value = -18;
		this.compressor.knee.value = 12;
		this.compressor.ratio.value = 3.5;
		this.compressor.attack.value = 0.003;
		this.compressor.release.value = 0.18;

		this.masterFilter = this.ctx.createBiquadFilter();
		this.masterFilter.type = "lowpass";
		this.masterFilter.frequency.value = 18000;

		this.crush = this.ctx.createWaveShaper();
		this.crush.curve = makeDistortionCurve(0.1);

		this.reverb = this.ctx.createConvolver();
		this.reverb.buffer = makeImpulse(this.ctx, 1.6, 2.4);
		this.reverbGain = this.ctx.createGain();
		this.reverbGain.gain.value = 0.14;

		this.delay = this.ctx.createDelay(1.0);
		this.delay.delayTime.value = 0.22;
		this.delayFeedback = this.ctx.createGain();
		this.delayFeedback.gain.value = 0.28;
		this.delayGain = this.ctx.createGain();
		this.delayGain.gain.value = 0.2;
		this.delay.connect(this.delayFeedback);
		this.delayFeedback.connect(this.delay);
		this.delay.connect(this.delayGain);

		// master chain
		this.master.connect(this.crush);
		this.crush.connect(this.masterFilter);
		this.masterFilter.connect(this.compressor);
		this.compressor.connect(this.ctx.destination);

		this.reverb.connect(this.reverbGain);
		this.reverbGain.connect(this.compressor);
		this.delayGain.connect(this.compressor);
	}

	private applyMaster() {
		this.master.gain.value = this.project.masterGain ?? 0.85;
		this.reverbGain.gain.value = this.project.masterReverb ?? 0.12;
		const crush = this.project.masterCrush ?? 0;
		this.crush.curve = makeDistortionCurve(0.1 + crush * 120);
		this.masterFilter.frequency.value = 18000 - crush * 9000;
		// sync delay time to dotted 8th-ish from BPM
		const beat = 60 / Math.max(60, this.project.bpm);
		this.delay.delayTime.value = beat * 0.75;
	}

	async loadPack(pack: Pack) {
		this.samples = await loadPackBuffers(this.ctx, pack);
	}

	async setProject(project: Project) {
		this.project = normalizeProject(project);
		this.applyMaster();
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

	private secondsPerStep(): number {
		return 60 / this.project.bpm / 4;
	}

	private makeBus(track: TrackPattern): Bus {
		const input = this.ctx.createGain();
		const filter = this.ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 280 + track.filter * 14000;
		filter.Q.value = 0.7;

		const drive = this.ctx.createWaveShaper();
		drive.curve = makeDistortionCurve(Math.max(0.5, track.drive * 90));
		drive.oversample = "2x";

		const pan = this.ctx.createStereoPanner();
		pan.pan.value = Math.max(-1, Math.min(1, track.pan));

		const dry = this.ctx.createGain();
		dry.gain.value = 1;

		const reverbSend = this.ctx.createGain();
		reverbSend.gain.value = track.reverb;

		const delaySend = this.ctx.createGain();
		delaySend.gain.value = track.delay;

		input.connect(filter);
		filter.connect(drive);
		drive.connect(pan);
		pan.connect(dry);
		pan.connect(reverbSend);
		pan.connect(delaySend);
		dry.connect(this.master);
		reverbSend.connect(this.reverb);
		delaySend.connect(this.delay);

		return { input, pan, filter, drive, dry, reverbSend, delaySend };
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

	private scheduleHit(
		track: TrackPattern,
		cell: StepCell,
		time: number,
		stepDur: number,
	) {
		const sample = this.samples.get(track.sampleId);
		if (!sample || track.mute) return;
		const anySolo = this.project.tracks.some((t) => t.solo);
		if (anySolo && !track.solo) return;

		const bus = this.makeBus(track);
		const src = this.ctx.createBufferSource();
		let buf = sample.buffer;
		if (track.reverse) buf = reverseBuffer(this.ctx, buf);
		src.buffer = buf;

		const totalPitch = track.pitch + cell.pitch;
		src.playbackRate.value = Math.pow(2, totalPitch / 12);

		const vel = cell.velocity;
		bus.input.gain.value = track.gain * vel;

		// Gate / length envelope
		const gate = Math.max(0.04, cell.length * stepDur * 0.92);
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(1, time);
		g.gain.setValueAtTime(1, time + gate * 0.75);
		g.gain.exponentialRampToValueAtTime(0.001, time + gate);

		src.connect(g);
		g.connect(bus.input);
		src.start(time);
		src.stop(time + gate + 0.05);
	}

	private scheduler = () => {
		const lookAhead = 0.12;
		const stepDur = this.secondsPerStep();
		const totalSteps = 16 * this.project.bars;

		while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
			const stepInBar = this.currentStep % 16;
			const swing =
				stepInBar % 2 === 1 ? this.project.swing * stepDur * 0.65 : 0;
			const t = this.nextNoteTime + swing;

			for (const track of this.project.tracks) {
				const cell = asStep(track.steps[stepInBar]);
				if (cell.on) this.scheduleHit(track, cell, t, stepDur);
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
		await this.loadTag(this.project);
		this.applyMaster();
		this.playing = true;
		this.currentStep = 0;
		const lead = this.tagBuffer
			? Math.min(1.15, this.tagBuffer.duration * 0.85)
			: 0.05;
		this.nextNoteTime = this.ctx.currentTime + Math.max(0.05, lead);
		if (this.tagBuffer) {
			this.playTag(this.ctx.currentTime + 0.02);
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
		this.onStep?.(0);
	}

	async preview(
		sampleId: string,
		pitch = 0,
		gain = 0.8,
		opts?: { reverse?: boolean; filter?: number; drive?: number; pan?: number },
	) {
		await this.resume();
		const sample = this.samples.get(sampleId);
		if (!sample) return;
		const fake: TrackPattern = {
			sampleId,
			steps: [],
			gain,
			mute: false,
			solo: false,
			pitch,
			filter: opts?.filter ?? 0.75,
			drive: opts?.drive ?? 0.1,
			pan: opts?.pan ?? 0,
			reverb: 0.08,
			delay: 0,
			reverse: !!opts?.reverse,
		};
		this.scheduleHit(fake, asStep({ on: true, velocity: 1, pitch: 0, length: 2 }), this.ctx.currentTime, this.secondsPerStep());
	}

	async previewTag() {
		await this.resume();
		await this.loadTag(this.project);
		if (!this.tagBuffer) return;
		this.playTag(this.ctx.currentTime);
	}

	getSampleBuffer(sampleId: string): AudioBuffer | null {
		return this.samples.get(sampleId)?.buffer ?? null;
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
	const duration = lead + totalSteps * stepDur + 1.0;
	const offline = new OfflineAudioContext(2, Math.ceil(sr * duration), sr);
	const samples = await loadPackBuffers(offline, pack);

	const master = offline.createGain();
	master.gain.value = project.masterGain;
	const comp = offline.createDynamicsCompressor();
	comp.threshold.value = -18;
	comp.ratio.value = 3.5;
	master.connect(comp);
	comp.connect(offline.destination);

	const reverb = offline.createConvolver();
	reverb.buffer = makeImpulse(offline, 1.4, 2.2);
	const reverbGain = offline.createGain();
	reverbGain.gain.value = project.masterReverb;
	reverb.connect(reverbGain);
	reverbGain.connect(comp);

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
		const swing = stepInBar % 2 === 1 ? project.swing * stepDur * 0.65 : 0;
		const time = lead + step * stepDur + swing;

		for (const track of project.tracks) {
			const cell = asStep(track.steps[stepInBar]);
			if (!cell.on || track.mute) continue;
			const anySolo = project.tracks.some((t) => t.solo);
			if (anySolo && !track.solo) continue;
			const sample = samples.get(track.sampleId);
			if (!sample) continue;

			const src = offline.createBufferSource();
			src.buffer = track.reverse ? reverseBuffer(offline, sample.buffer) : sample.buffer;
			src.playbackRate.value = Math.pow(2, (track.pitch + cell.pitch) / 12);

			const filter = offline.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 280 + track.filter * 14000;

			const pan = offline.createStereoPanner();
			pan.pan.value = track.pan;

			const gain = offline.createGain();
			gain.gain.value = track.gain * cell.velocity;

			const gate = Math.max(0.04, cell.length * stepDur * 0.92);
			const env = offline.createGain();
			env.gain.setValueAtTime(1, time);
			env.gain.setValueAtTime(1, time + gate * 0.75);
			env.gain.exponentialRampToValueAtTime(0.001, time + gate);

			const revSend = offline.createGain();
			revSend.gain.value = track.reverb;

			src.connect(env);
			env.connect(filter);
			filter.connect(pan);
			pan.connect(gain);
			gain.connect(master);
			pan.connect(revSend);
			revSend.connect(reverb);
			src.start(time);
			src.stop(time + gate + 0.05);
		}
	}

	const rendered = await offline.startRendering();
	return audioBufferToWav(rendered);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numChan = buffer.numberOfChannels;
	const sr = buffer.sampleRate;
	const bitDepth = 16;
	const samples = buffer.length;
	const blockAlign = (numChan * bitDepth) / 8;
	const byteRate = sr * blockAlign;
	const dataSize = samples * blockAlign;
	const ab = new ArrayBuffer(44 + dataSize);
	const view = new DataView(ab);
	const writeStr = (o: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
	};
	writeStr(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeStr(8, "WAVE");
	writeStr(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, numChan, true);
	view.setUint32(24, sr, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeStr(36, "data");
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

export { stepOn };
