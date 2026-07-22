/** FL-informed Web Audio engine — pattern/song, graph params, mixer inserts */

import type {
	Channel,
	Pack,
	Project,
	SampleDef,
	StepCell,
} from "../../shared/types";
import { asStep, normalizeProject, songLengthBars } from "../../shared/types";

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
	const freq = midiToHz(def.rootMidi + (def.pitch - 0.5) * 4);

	for (let i = 0; i < len; i++) {
		const t = i / sr;
		const env = Math.exp(-t * (1.15 + (1 - def.decay) * 10));
		let sig = 0;
		if (def.role === "kick") {
			const f = freq * (1 + Math.exp(-t * 35) * 3.2);
			sig = Math.sin(2 * Math.PI * f * t) * env;
			sig += (Math.random() * 2 - 1) * 0.04 * Math.exp(-t * 90);
		} else if (def.role === "snare") {
			sig =
				Math.sin(2 * Math.PI * 180 * t) * env * (1 - def.noise * 0.6) +
				(Math.random() * 2 - 1) *
					Math.exp(-t * (10 + def.tone * 18)) *
					(0.45 + def.noise * 0.5);
		} else if (def.role === "hat") {
			sig =
				(Math.random() * 2 - 1) *
					Math.exp(-t * (22 + (1 - def.decay) * 55)) *
					(0.55 + def.noise * 0.4) +
				Math.sin(2 * Math.PI * (7000 + def.tone * 3500) * t) * env * 0.12;
		} else if (def.role === "bass") {
			sig = Math.sin(2 * Math.PI * freq * t) * env;
			sig += Math.sin(2 * Math.PI * freq * 2 * t) * env * def.harmonics * 0.35;
			sig = Math.tanh(sig * (1.4 + def.drive * 3));
		} else if (def.role === "melody" || def.role === "vocal") {
			const partials = 1 + Math.floor(def.harmonics * 4);
			for (let h = 1; h <= partials; h++) {
				sig +=
					Math.sin(2 * Math.PI * freq * h * t) *
					((1 / h) * Math.pow(0.85, h - 1));
			}
			sig *= env * (0.75 + def.tone * 0.25);
			if (def.role === "vocal") {
				sig *= 0.75 + 0.25 * Math.sin(2 * Math.PI * (4.5 + def.tone * 3) * t);
			}
		} else if (def.role === "fx") {
			sig =
				Math.sin(2 * Math.PI * freq * (1 + t * (1.5 + def.pitch * 4)) * t) * env;
			sig += (Math.random() * 2 - 1) * env * def.noise * 0.4;
		} else {
			sig = Math.sin(2 * Math.PI * freq * t) * env * (1 - def.noise * 0.4);
			sig += (Math.random() * 2 - 1) * Math.exp(-t * 28) * def.noise;
		}
		data[i] = Math.tanh(sig * (1 + def.drive * 2.5)) * 0.9;
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

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
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

export async function loadPackBuffers(ctx: BaseAudioContext, pack: Pack) {
	const map = new Map<string, LoadedSample>();
	for (const def of pack.samples) {
		map.set(def.id, { def, buffer: synthesizeSample(ctx, def) });
	}
	return map;
}

/** Resolve which pattern/step plays at a global song step */
export function resolveSongStep(
	project: Project,
	globalStep: number,
): { patternIndex: number; stepInPattern: number } | null {
	const plen = project.patternLength;
	const globalBar = Math.floor(globalStep / plen);
	const stepInBar = globalStep % plen;
	const clip = project.playlist.find(
		(c) => globalBar >= c.startBar && globalBar < c.startBar + c.lengthBars,
	);
	if (!clip) return null;
	return { patternIndex: clip.patternIndex, stepInPattern: stepInBar };
}

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
	onStep?: (step: number, meta?: { patternIndex: number }) => void;

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

		this.delay = this.ctx.createDelay(1.0);
		this.delayFeedback = this.ctx.createGain();
		this.delayFeedback.gain.value = 0.28;
		this.delayGain = this.ctx.createGain();
		this.delay.connect(this.delayFeedback);
		this.delayFeedback.connect(this.delay);
		this.delay.connect(this.delayGain);

		this.master.connect(this.crush);
		this.crush.connect(this.masterFilter);
		this.masterFilter.connect(this.compressor);
		this.compressor.connect(this.ctx.destination);
		this.reverb.connect(this.reverbGain);
		this.reverbGain.connect(this.compressor);
		this.delayGain.connect(this.compressor);
		this.applyMaster();
	}

	private applyMaster() {
		this.master.gain.value = this.project.masterGain ?? 0.85;
		this.reverbGain.gain.value = this.project.masterReverb ?? 0.12;
		const crush = this.project.masterCrush ?? 0;
		this.crush.curve = makeDistortionCurve(0.1 + crush * 120);
		this.masterFilter.frequency.value = 18000 - crush * 9000;
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

	private secondsPerStep() {
		return 60 / this.project.bpm / 4;
	}

	private scheduleHit(
		ch: Channel,
		cell: StepCell,
		time: number,
		stepDur: number,
	) {
		const sample = this.samples.get(ch.sampleId);
		if (!sample || ch.mute) return;
		const anySolo = this.project.channels.some((c) => c.solo);
		if (anySolo && !ch.solo) return;

		const src = this.ctx.createBufferSource();
		src.buffer = ch.reverse
			? reverseBuffer(this.ctx, sample.buffer)
			: sample.buffer;
		src.playbackRate.value = Math.pow(2, (ch.pitch + cell.pitch) / 12);

		const filter = this.ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 280 + ch.filter * 14000;

		const low = this.ctx.createBiquadFilter();
		low.type = "lowshelf";
		low.frequency.value = 180;
		low.gain.value = ch.eqLow * 12;

		const mid = this.ctx.createBiquadFilter();
		mid.type = "peaking";
		mid.frequency.value = 1000;
		mid.Q.value = 0.9;
		mid.gain.value = ch.eqMid * 10;

		const high = this.ctx.createBiquadFilter();
		high.type = "highshelf";
		high.frequency.value = 4500;
		high.gain.value = ch.eqHigh * 10;

		const drive = this.ctx.createWaveShaper();
		drive.curve = makeDistortionCurve(Math.max(0.5, ch.drive * 90 + ch.compress * 40));

		const pan = this.ctx.createStereoPanner();
		pan.pan.value = Math.max(-1, Math.min(1, ch.pan + cell.stepPan));

		const dry = this.ctx.createGain();
		const amp = this.ctx.createGain();
		amp.gain.value = ch.gain * cell.velocity * (1 - ch.compress * 0.15);

		const reverbSend = this.ctx.createGain();
		reverbSend.gain.value = ch.reverb;
		const delaySend = this.ctx.createGain();
		delaySend.gain.value = ch.delay;

		const gate = Math.max(0.04, cell.length * stepDur * 0.92);
		const env = this.ctx.createGain();
		env.gain.setValueAtTime(1, time);
		env.gain.setValueAtTime(1, time + gate * 0.75);
		env.gain.exponentialRampToValueAtTime(0.001, time + gate);

		src.connect(env);
		env.connect(filter);
		filter.connect(low);
		low.connect(mid);
		mid.connect(high);
		high.connect(drive);
		drive.connect(pan);
		pan.connect(amp);
		amp.connect(dry);
		dry.connect(this.master);
		pan.connect(reverbSend);
		pan.connect(delaySend);
		reverbSend.connect(this.reverb);
		delaySend.connect(this.delay);

		src.start(time);
		src.stop(time + gate + 0.05);
	}

	private lookUp(step: number): {
		patternIndex: number;
		stepInPattern: number;
	} | null {
		if (this.project.playMode === "pattern") {
			return {
				patternIndex: this.project.activePattern,
				stepInPattern: step % this.project.patternLength,
			};
		}
		return resolveSongStep(this.project, step);
	}

	private loopLength(): number {
		if (this.project.playMode === "pattern") return this.project.patternLength;
		return songLengthBars(this.project) * this.project.patternLength;
	}

	private scheduler = () => {
		const lookAhead = 0.12;
		const stepDur = this.secondsPerStep();
		const loopLen = Math.max(1, this.loopLength());

		while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
			const lookup = this.lookUp(this.currentStep);
			const stepInPat = lookup?.stepInPattern ?? 0;
			const swing =
				stepInPat % 2 === 1 ? this.project.swing * stepDur * 0.65 : 0;
			const t = this.nextNoteTime + swing;

			if (lookup) {
				const pat = this.project.patterns[lookup.patternIndex];
				if (pat) {
					for (let ci = 0; ci < this.project.channels.length; ci++) {
						const ch = this.project.channels[ci]!;
						const cell = asStep(pat.tracks[ci]?.steps[lookup.stepInPattern]);
						if (cell.on) this.scheduleHit(ch, cell, t, stepDur);
					}
				}
				this.onStep?.(this.currentStep % loopLen, {
					patternIndex: lookup.patternIndex,
				});
			} else {
				this.onStep?.(this.currentStep % loopLen);
			}

			this.nextNoteTime += stepDur;
			this.currentStep = (this.currentStep + 1) % loopLen;
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
		if (this.tagBuffer) this.playTag(this.ctx.currentTime + 0.02);
		this.scheduler();
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
		opts?: Partial<Channel>,
	) {
		await this.resume();
		const ch: Channel = {
			sampleId,
			gain,
			mute: false,
			solo: false,
			pitch,
			filter: opts?.filter ?? 0.75,
			drive: opts?.drive ?? 0.1,
			pan: opts?.pan ?? 0,
			reverb: opts?.reverb ?? 0.08,
			delay: opts?.delay ?? 0,
			reverse: !!opts?.reverse,
			eqLow: opts?.eqLow ?? 0,
			eqMid: opts?.eqMid ?? 0,
			eqHigh: opts?.eqHigh ?? 0,
			compress: opts?.compress ?? 0,
		};
		this.scheduleHit(
			ch,
			asStep({ on: true, velocity: 1, pitch: 0, length: 2, stepPan: 0 }),
			this.ctx.currentTime,
			this.secondsPerStep(),
		);
	}

	dispose() {
		this.stop();
		void this.ctx.close();
	}
}

export async function renderProjectWav(
	pack: Pack,
	projectIn: Project,
	loops = 1,
): Promise<Blob> {
	const project = normalizeProject(projectIn);
	const engine = new DawEngine(project);
	// Offline path: schedule via OfflineAudioContext manually
	const sr = 44100;
	const stepDur = 60 / project.bpm / 4;
	const loopLen =
		project.playMode === "song"
			? songLengthBars(project) * project.patternLength
			: project.patternLength;
	const totalSteps = loopLen * loops;

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

	const lookUp = (step: number) => {
		if (project.playMode === "pattern") {
			return {
				patternIndex: project.activePattern,
				stepInPattern: step % project.patternLength,
			};
		}
		return resolveSongStep(project, step % loopLen);
	};

	for (let step = 0; step < totalSteps; step++) {
		const lookup = lookUp(step);
		if (!lookup) continue;
		const stepInPat = lookup.stepInPattern;
		const swing = stepInPat % 2 === 1 ? project.swing * stepDur * 0.65 : 0;
		const time = lead + step * stepDur + swing;
		const pat = project.patterns[lookup.patternIndex];
		if (!pat) continue;
		for (let ci = 0; ci < project.channels.length; ci++) {
			const ch = project.channels[ci]!;
			const cell = asStep(pat.tracks[ci]?.steps[stepInPat]);
			if (!cell.on || ch.mute) continue;
			const anySolo = project.channels.some((c) => c.solo);
			if (anySolo && !ch.solo) continue;
			const sample = samples.get(ch.sampleId);
			if (!sample) continue;
			const src = offline.createBufferSource();
			src.buffer = ch.reverse
				? reverseBuffer(offline, sample.buffer)
				: sample.buffer;
			src.playbackRate.value = Math.pow(2, (ch.pitch + cell.pitch) / 12);
			const filter = offline.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 280 + ch.filter * 14000;
			const pan = offline.createStereoPanner();
			pan.pan.value = Math.max(-1, Math.min(1, ch.pan + cell.stepPan));
			const gain = offline.createGain();
			gain.gain.value = ch.gain * cell.velocity;
			const gate = Math.max(0.04, cell.length * stepDur * 0.92);
			const env = offline.createGain();
			env.gain.setValueAtTime(1, time);
			env.gain.exponentialRampToValueAtTime(0.001, time + gate);
			const revSend = offline.createGain();
			revSend.gain.value = ch.reverb;
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

	engine.dispose();
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
	view.setUint32(28, sr * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);
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
