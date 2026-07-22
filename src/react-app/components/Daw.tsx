import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Pack, Project, StepCell, TrackPattern } from "../../shared/types";
import {
	asStep,
	emptyStep,
	hitStep,
	normalizeProject,
	stepOn,
} from "../../shared/types";
import { DawEngine, renderProjectWav } from "../audio/engine";

type Props = {
	pack: Pack;
	project: Project;
	onChange: (p: Project) => void;
	locked?: boolean;
};

type View = "seq" | "keys" | "mixer" | "pads";
type Tool = "draw" | "erase" | "velo" | "pitch";

export const ROLE_COLOR: Record<string, string> = {
	kick: "#ff6b2c",
	snare: "#ffb347",
	hat: "#5eead4",
	perc: "#a78bfa",
	bass: "#38bdf8",
	melody: "#f472b6",
	fx: "#94a3b8",
	vocal: "#facc15",
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PIANO_RANGE = 24; // 2 octaves

function midiLabel(midi: number) {
	const n = ((midi % 12) + 12) % 12;
	const oct = Math.floor(midi / 12) - 1;
	return `${NOTE_NAMES[n]}${oct}`;
}

export function Daw({ pack, project: rawProject, onChange, locked }: Props) {
	const project = useMemo(() => normalizeProject(rawProject), [rawProject]);
	const engineRef = useRef<DawEngine | null>(null);
	if (engineRef.current == null) engineRef.current = new DawEngine(project);
	const engine = engineRef.current;

	const [playing, setPlaying] = useState(false);
	const [step, setStep] = useState(0);
	const [ready, setReady] = useState(false);
	const [selected, setSelected] = useState(0);
	const [view, setView] = useState<View>("seq");
	const [tool, setTool] = useState<Tool>("draw");
	const [paintVel, setPaintVel] = useState(0.85);
	const [noteLen, setNoteLen] = useState(1);
	const [octave, setOctave] = useState(0);
	const history = useRef<Project[]>([]);
	const future = useRef<Project[]>([]);
	const clipRef = useRef<StepCell[] | null>(null);

	const commit = useCallback(
		(next: Project, pushHist = true) => {
			if (locked) return;
			const norm = normalizeProject(next);
			if (pushHist) {
				history.current = [...history.current.slice(-40), project];
				future.current = [];
			}
			onChange(norm);
		},
		[locked, onChange, project],
	);

	const undo = () => {
		const prev = history.current.pop();
		if (!prev) return;
		future.current.push(project);
		onChange(prev);
	};
	const redo = () => {
		const n = future.current.pop();
		if (!n) return;
		history.current.push(project);
		onChange(n);
	};

	useEffect(() => {
		engine.onStep = (s) => setStep(s);
		return () => {
			engine.dispose();
			engineRef.current = null;
		};
	}, [engine]);

	useEffect(() => {
		let cancelled = false;
		setReady(false);
		void (async () => {
			await engine.loadPack(pack);
			if (!cancelled) setReady(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [engine, pack]);

	useEffect(() => {
		void engine.setProject(project);
	}, [engine, project]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (locked) return;
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
			if (e.code === "Space") {
				e.preventDefault();
				void togglePlay();
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
				e.preventDefault();
				if (e.shiftKey) redo();
				else undo();
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
				e.preventDefault();
				redo();
			} else if (e.key === "1") setView("seq");
			else if (e.key === "2") setView("keys");
			else if (e.key === "3") setView("mixer");
			else if (e.key === "4") setView("pads");
			else if (e.key.toLowerCase() === "d") setTool("draw");
			else if (e.key.toLowerCase() === "e") setTool("erase");
			else if (e.key.toLowerCase() === "v") setTool("velo");
			else if (e.key.toLowerCase() === "p") setTool("pitch");
			else if (/^[a-z]$/i.test(e.key) && view === "pads") {
				const map = "qwerasdf";
				const idx = map.indexOf(e.key.toLowerCase());
				if (idx >= 0 && project.tracks[idx]) {
					const t = project.tracks[idx]!;
					void engine.preview(t.sampleId, t.pitch + octave * 12, t.gain, {
						filter: t.filter,
						drive: t.drive,
						pan: t.pan,
						reverse: t.reverse,
					});
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [locked, project, view, playing, ready, octave]);

	const sampleById = useMemo(() => {
		return new Map(pack.samples.map((s) => [s.id, s]));
	}, [pack]);

	const updateTrack = (idx: number, patch: Partial<TrackPattern>) => {
		commit({
			...project,
			tracks: project.tracks.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
		});
	};

	const setCell = (trackIdx: number, stepIdx: number, cell: StepCell) => {
		const tracks = project.tracks.map((t, i) => {
			if (i !== trackIdx) return t;
			const steps = t.steps.map((s, si) => (si === stepIdx ? cell : asStep(s)));
			return { ...t, steps };
		});
		commit({ ...project, tracks });
	};

	const paintStep = (trackIdx: number, stepIdx: number, pitchOverride?: number) => {
		if (locked) return;
		const cur = asStep(project.tracks[trackIdx]?.steps[stepIdx]);
		if (tool === "erase") {
			setCell(trackIdx, stepIdx, emptyStep());
			return;
		}
		if (tool === "velo") {
			if (!cur.on) return;
			setCell(trackIdx, stepIdx, { ...cur, velocity: paintVel });
			return;
		}
		if (tool === "pitch") {
			if (!cur.on) return;
			setCell(trackIdx, stepIdx, {
				...cur,
				pitch: pitchOverride ?? Math.max(-12, Math.min(12, cur.pitch + 1)),
			});
			return;
		}
		// draw
		setCell(
			trackIdx,
			stepIdx,
			hitStep(paintVel, pitchOverride ?? cur.pitch, noteLen),
		);
	};

	const togglePlay = async () => {
		if (!ready) return;
		if (playing) {
			engine.stop();
			setPlaying(false);
		} else {
			await engine.play();
			setPlaying(true);
		}
	};

	const download = async () => {
		const blob = await renderProjectWav(pack, project, 2);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `beat-battle-${pack.genre}-${pack.seed}.wav`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const clearTrack = (idx: number) => {
		updateTrack(idx, {
			steps: Array.from({ length: 16 }, () => emptyStep()),
		});
	};

	const randomizeTrack = (idx: number) => {
		const role = sampleById.get(project.tracks[idx]!.sampleId)?.role;
		const dens = role === "hat" ? 0.55 : role === "kick" ? 0.28 : 0.22;
		const steps = Array.from({ length: 16 }, () => {
			if (Math.random() > dens) return emptyStep();
			const vel = 0.55 + Math.random() * 0.45;
			const pitch =
				role === "melody" || role === "bass"
					? [0, 3, 5, 7, -2, 12][Math.floor(Math.random() * 6)]!
					: 0;
			return hitStep(vel, pitch, role === "bass" ? 2 : 1);
		});
		// force a downbeat sometimes
		if (!stepOn(steps[0]) && (role === "kick" || role === "bass")) {
			steps[0] = hitStep(0.95, 0, 2);
		}
		updateTrack(idx, { steps });
	};

	const copyTrack = (idx: number) => {
		clipRef.current = project.tracks[idx]!.steps.map((s) => asStep(s));
	};
	const pasteTrack = (idx: number) => {
		if (!clipRef.current) return;
		updateTrack(idx, { steps: clipRef.current.map((s) => ({ ...s })) });
	};

	const doublePattern = () => {
		commit({ ...project, bars: Math.min(8, project.bars * 2) });
	};

	const track = project.tracks[selected];
	const sample = track ? sampleById.get(track.sampleId) : null;
	const keyRoot = sample?.rootMidi ?? pack.keyMidi;

	return (
		<div className="daw daw-pro">
			{/* Transport */}
			<div className="daw-transport">
				<button
					type="button"
					className={`btn play ${playing ? "active" : ""}`}
					onClick={() => void togglePlay()}
					disabled={!ready}
					title="Space"
				>
					{playing ? "Stop" : "Play"}
				</button>
				<label className="knob">
					<span>BPM</span>
					<input
						type="number"
						min={60}
						max={200}
						value={project.bpm}
						disabled={locked}
						onChange={(e) =>
							commit({ ...project, bpm: Number(e.target.value) || project.bpm })
						}
					/>
				</label>
				<label className="knob">
					<span>Swing</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={project.swing}
						disabled={locked}
						onChange={(e) =>
							commit({ ...project, swing: Number(e.target.value) })
						}
					/>
				</label>
				<label className="knob">
					<span>Bars</span>
					<select
						value={project.bars}
						disabled={locked}
						onChange={(e) =>
							commit({ ...project, bars: Number(e.target.value) })
						}
					>
						{[1, 2, 4, 8].map((b) => (
							<option key={b} value={b}>
								{b}
							</option>
						))}
					</select>
				</label>
				<label className="knob">
					<span>Len</span>
					<select
						value={noteLen}
						disabled={locked}
						onChange={(e) => setNoteLen(Number(e.target.value))}
					>
						{[1, 2, 3, 4, 6, 8].map((n) => (
							<option key={n} value={n}>
								{n}/16
							</option>
						))}
					</select>
				</label>
				<label className="knob">
					<span>Vel</span>
					<input
						type="range"
						min={0.1}
						max={1}
						step={0.01}
						value={paintVel}
						onChange={(e) => setPaintVel(Number(e.target.value))}
					/>
				</label>
				<button type="button" className="btn ghost" disabled={locked} onClick={undo}>
					Undo
				</button>
				<button type="button" className="btn ghost" disabled={locked} onClick={redo}>
					Redo
				</button>
				<button type="button" className="btn ghost" onClick={() => void download()}>
					Export WAV
				</button>
				<span className="daw-ready">
					{ready ? `step ${step + 1}/${16 * project.bars}` : "Loading…"}
				</span>
			</div>

			{/* View + tools */}
			<div className="daw-toolbar">
				<div className="view-tabs">
					{(
						[
							["seq", "Sequencer"],
							["keys", "Piano roll"],
							["mixer", "Mixer"],
							["pads", "Pads"],
						] as const
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							className={`btn ${view === id ? "primary" : "ghost"}`}
							onClick={() => setView(id)}
						>
							{label}
						</button>
					))}
				</div>
				<div className="tool-tabs">
					{(
						[
							["draw", "Draw"],
							["erase", "Erase"],
							["velo", "Velocity"],
							["pitch", "Pitch+"],
						] as const
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							className={`btn ${tool === id ? "active" : "ghost"}`}
							onClick={() => setTool(id)}
							disabled={locked}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{view === "seq" && (
				<div className="sequencer">
					{project.tracks.map((t, ti) => {
						const s = sampleById.get(t.sampleId);
						const color = ROLE_COLOR[s?.role ?? "fx"] ?? "#94a3b8";
						return (
							<div
								key={t.sampleId}
								className={`seq-row ${selected === ti ? "selected" : ""} ${s?.mustUse ? "must" : ""}`}
								onClick={() => setSelected(ti)}
							>
								<div className="pad-side">
									<button
										type="button"
										className="pad-label"
										style={{ borderColor: color, color }}
										onClick={(e) => {
											e.stopPropagation();
											setSelected(ti);
											void engine.preview(t.sampleId, t.pitch, t.gain, {
												filter: t.filter,
												drive: t.drive,
												pan: t.pan,
												reverse: t.reverse,
											});
										}}
									>
										<span className="role">
											{s?.role}
											{s?.mustUse ? " · MUST" : ""}
										</span>
										<span className="name">{s?.name}</span>
									</button>
									<div className="row-tools">
										<button
											type="button"
											className="mini"
											disabled={locked}
											onClick={(e) => {
												e.stopPropagation();
												clearTrack(ti);
											}}
										>
											Clr
										</button>
										<button
											type="button"
											className="mini"
											disabled={locked}
											onClick={(e) => {
												e.stopPropagation();
												randomizeTrack(ti);
											}}
										>
											Rnd
										</button>
										<button
											type="button"
											className="mini"
											disabled={locked}
											onClick={(e) => {
												e.stopPropagation();
												copyTrack(ti);
											}}
										>
											Cp
										</button>
										<button
											type="button"
											className="mini"
											disabled={locked}
											onClick={(e) => {
												e.stopPropagation();
												pasteTrack(ti);
											}}
										>
											Pst
										</button>
									</div>
								</div>
								<div className="steps">
									{t.steps.map((raw, si) => {
										const cell = asStep(raw);
										const beat = si % 4 === 0;
										const activePlay =
											playing &&
											step % 16 === si &&
											step < 16 * project.bars;
										const h = cell.on ? 0.35 + cell.velocity * 0.65 : 0;
										return (
											<button
												key={si}
												type="button"
												className={`step ${cell.on ? "on" : ""} ${beat ? "beat" : ""} ${activePlay ? "now" : ""}`}
												style={
													cell.on
														? {
																background: color,
																opacity: 0.45 + cell.velocity * 0.55,
																transform: `scaleY(${h + 0.35})`,
															}
														: undefined
												}
												title={
													cell.on
														? `vel ${cell.velocity.toFixed(2)} · pitch ${cell.pitch} · len ${cell.length}`
														: undefined
												}
												disabled={locked}
												onClick={(e) => {
													e.stopPropagation();
													if (tool === "draw" && cell.on && !e.shiftKey) {
														setCell(ti, si, emptyStep());
													} else {
														paintStep(ti, si);
													}
												}}
												onContextMenu={(e) => {
													e.preventDefault();
													e.stopPropagation();
													if (cell.on) {
														setCell(ti, si, {
															...cell,
															length: Math.min(8, cell.length + 1),
														});
													}
												}}
											/>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{view === "keys" && track && sample && (
				<div className="piano-roll">
					<div className="piano-meta">
						<strong>
							{sample.name} · piano roll
						</strong>
						<span>
							Root {midiLabel(keyRoot)} · octave shift {octave >= 0 ? `+${octave}` : octave}
						</span>
						<div className="piano-oct">
							<button
								type="button"
								className="btn ghost"
								onClick={() => setOctave((o) => Math.max(-2, o - 1))}
							>
								Oct −
							</button>
							<button
								type="button"
								className="btn ghost"
								onClick={() => setOctave((o) => Math.min(2, o + 1))}
							>
								Oct +
							</button>
						</div>
					</div>
					<div className="piano-grid">
						{Array.from({ length: PIANO_RANGE }, (_, row) => {
							const pitch = PIANO_RANGE - 1 - row + octave * 12 - 12;
							const midi = keyRoot + pitch;
							const black = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
							return (
								<div key={row} className={`piano-row ${black ? "black" : ""}`}>
									<button
										type="button"
										className="piano-key"
										onClick={() =>
											void engine.preview(track.sampleId, track.pitch + pitch, track.gain, {
												filter: track.filter,
												drive: track.drive,
												pan: track.pan,
											})
										}
									>
										{midiLabel(midi)}
									</button>
									<div className="piano-steps">
										{track.steps.map((raw, si) => {
											const cell = asStep(raw);
											const active = cell.on && cell.pitch === pitch;
											const beat = si % 4 === 0;
											const now =
												playing && step % 16 === si;
											return (
												<button
													key={si}
													type="button"
													className={`pstep ${active ? "on" : ""} ${beat ? "beat" : ""} ${now ? "now" : ""}`}
													disabled={locked}
													onClick={() => {
														if (tool === "erase" || (active && tool === "draw")) {
															setCell(selected, si, emptyStep());
														} else {
															setCell(
																selected,
																si,
																hitStep(paintVel, pitch, noteLen),
															);
															void engine.preview(
																track.sampleId,
																track.pitch + pitch,
																track.gain * paintVel,
																{ filter: track.filter, drive: track.drive },
															);
														}
													}}
												/>
											);
										})}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{view === "mixer" && (
				<div className="mixer-board">
					<div className="mixer-strips">
						{project.tracks.map((t, ti) => {
							const s = sampleById.get(t.sampleId);
							const color = ROLE_COLOR[s?.role ?? "fx"] ?? "#94a3b8";
							return (
								<div
									key={t.sampleId}
									className={`strip ${selected === ti ? "selected" : ""}`}
									onClick={() => setSelected(ti)}
								>
									<div className="strip-name" style={{ color }}>
										{s?.name}
									</div>
									<label>
										<span>Vol</span>
										<input
											type="range"
											min={0}
											max={1}
											step={0.01}
											value={t.gain}
											disabled={locked}
											onChange={(e) =>
												updateTrack(ti, { gain: Number(e.target.value) })
											}
										/>
									</label>
									<label>
										Pan
										<input
											type="range"
											min={-1}
											max={1}
											step={0.01}
											value={t.pan}
											disabled={locked}
											onChange={(e) =>
												updateTrack(ti, { pan: Number(e.target.value) })
											}
										/>
									</label>
									<label>
										Filter
										<input
											type="range"
											min={0}
											max={1}
											step={0.01}
											value={t.filter}
											disabled={locked}
											onChange={(e) =>
												updateTrack(ti, { filter: Number(e.target.value) })
											}
										/>
									</label>
									<label>
										Drive
										<input
											type="range"
											min={0}
											max={1}
											step={0.01}
											value={t.drive}
											disabled={locked}
											onChange={(e) =>
												updateTrack(ti, { drive: Number(e.target.value) })
											}
										/>
									</label>
									<label>
										Rev
										<input
											type="range"
											min={0}
											max={1}
											step={0.01}
											value={t.reverb}
											disabled={locked}
											onChange={(e) =>
												updateTrack(ti, { reverb: Number(e.target.value) })
											}
										/>
									</label>
									<label>
										Dly
										<input
											type="range"
											min={0}
											max={1}
											step={0.01}
											value={t.delay}
											disabled={locked}
											onChange={(e) =>
												updateTrack(ti, { delay: Number(e.target.value) })
											}
										/>
									</label>
									<div className="strip-toggles">
										<button
											type="button"
											className={`mini ${t.mute ? "hot" : ""}`}
											disabled={locked}
											onClick={() => updateTrack(ti, { mute: !t.mute })}
										>
											M
										</button>
										<button
											type="button"
											className={`mini ${t.solo ? "hot" : ""}`}
											disabled={locked}
											onClick={() => updateTrack(ti, { solo: !t.solo })}
										>
											S
										</button>
										<button
											type="button"
											className={`mini ${t.reverse ? "hot" : ""}`}
											disabled={locked}
											onClick={() => updateTrack(ti, { reverse: !t.reverse })}
										>
											Rev
										</button>
									</div>
								</div>
							);
						})}
						<div className="strip master-strip">
							<div className="strip-name">Master</div>
							<label>
								<span>Vol</span>
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={project.masterGain}
									disabled={locked}
									onChange={(e) =>
										commit({ ...project, masterGain: Number(e.target.value) })
									}
								/>
							</label>
							<label>
								Room
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={project.masterReverb}
									disabled={locked}
									onChange={(e) =>
										commit({
											...project,
											masterReverb: Number(e.target.value),
										})
									}
								/>
							</label>
							<label>
								Crush
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={project.masterCrush}
									disabled={locked}
									onChange={(e) =>
										commit({
											...project,
											masterCrush: Number(e.target.value),
										})
									}
								/>
							</label>
							<button
								type="button"
								className="btn ghost"
								disabled={locked}
								onClick={doublePattern}
							>
								Double bars
							</button>
						</div>
					</div>
				</div>
			)}

			{view === "pads" && (
				<div className="pads-view">
					<p className="pads-hint">
						Click pads or keys <kbd>QWER</kbd>/<kbd>ASDF</kbd> · octave{" "}
						{octave >= 0 ? `+${octave}` : octave}
					</p>
					<div className="pads-grid">
						{project.tracks.map((t, ti) => {
							const s = sampleById.get(t.sampleId);
							const color = ROLE_COLOR[s?.role ?? "fx"] ?? "#94a3b8";
							return (
								<button
									key={t.sampleId}
									type="button"
									className={`drum-pad ${selected === ti ? "selected" : ""}`}
									style={{ borderColor: color }}
									onMouseDown={() => {
										setSelected(ti);
										void engine.preview(
											t.sampleId,
											t.pitch + octave * 12,
											t.gain,
											{
												filter: t.filter,
												drive: t.drive,
												pan: t.pan,
												reverse: t.reverse,
											},
										);
									}}
								>
									<span className="pad-key">
										{"QWERASDF"[ti] ?? "·"}
									</span>
									<span className="pad-role">{s?.role}</span>
									<span className="pad-name">{s?.name}</span>
								</button>
							);
						})}
					</div>
					<div className="piano-oct">
						<button
							type="button"
							className="btn ghost"
							onClick={() => setOctave((o) => Math.max(-2, o - 1))}
						>
							Oct −
						</button>
						<button
							type="button"
							className="btn ghost"
							onClick={() => setOctave((o) => Math.min(2, o + 1))}
						>
							Oct +
						</button>
					</div>
				</div>
			)}

			{/* Inspector for selected track */}
			{track && sample && view !== "mixer" && (
				<div className="mixer inspector">
					<h3>
						{sample.name} <em>({sample.role})</em>
						{sample.mustUse ? <span className="must-tag">MUST USE</span> : null}
					</h3>
					<div className="mixer-grid">
						<label>
							Gain
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={track.gain}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { gain: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Transpose
							<input
								type="range"
								min={-24}
								max={24}
								step={1}
								value={track.pitch}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { pitch: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Filter
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={track.filter}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { filter: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Drive
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={track.drive}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { drive: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Pan
							<input
								type="range"
								min={-1}
								max={1}
								step={0.01}
								value={track.pan}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { pan: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Reverb
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={track.reverb}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { reverb: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Delay
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={track.delay}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { delay: Number(e.target.value) })
								}
							/>
						</label>
						<label className="check">
							<input
								type="checkbox"
								checked={track.mute}
								disabled={locked}
								onChange={(e) => updateTrack(selected, { mute: e.target.checked })}
							/>
							Mute
						</label>
						<label className="check">
							<input
								type="checkbox"
								checked={track.solo}
								disabled={locked}
								onChange={(e) => updateTrack(selected, { solo: e.target.checked })}
							/>
							Solo
						</label>
						<label className="check">
							<input
								type="checkbox"
								checked={track.reverse}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { reverse: e.target.checked })
								}
							/>
							Reverse
						</label>
					</div>
					<p className="daw-shortcuts">
						Space play · 1–4 views · D/E/V/P tools · ⌘Z undo · right-click step =
						longer gate
					</p>
				</div>
			)}
		</div>
	);
}
