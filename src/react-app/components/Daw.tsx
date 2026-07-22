import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	Channel,
	Pack,
	PlaylistClip,
	Project,
	StepCell,
} from "../../shared/types";
import {
	PATTERN_COUNT,
	asStep,
	emptyStep,
	hitStep,
	normalizeProject,
	songLengthBars,
	stepOn,
} from "../../shared/types";
import { DawEngine, renderProjectWav } from "../audio/engine";

type Props = {
	pack: Pack;
	project: Project;
	onChange: (p: Project) => void;
	locked?: boolean;
};

type Panel = "rack" | "keys" | "playlist" | "mixer";
type GraphParam = "velocity" | "pitch" | "stepPan";

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
const PIANO_RANGE = 24;

function midiLabel(midi: number) {
	const n = ((midi % 12) + 12) % 12;
	const oct = Math.floor(midi / 12) - 1;
	return `${NOTE_NAMES[n]}${oct}`;
}

export function Daw({ pack, project: raw, onChange, locked }: Props) {
	const project = useMemo(() => normalizeProject(raw), [raw]);
	const engineRef = useRef<DawEngine | null>(null);
	if (!engineRef.current) engineRef.current = new DawEngine(project);
	const engine = engineRef.current;

	const [playing, setPlaying] = useState(false);
	const [step, setStep] = useState(0);
	const [ready, setReady] = useState(false);
	const [selected, setSelected] = useState(0);
	const [panel, setPanel] = useState<Panel>("rack");
	const [graph, setGraph] = useState<GraphParam>("velocity");
	const [graphOpen, setGraphOpen] = useState(true);
	const [paintVel] = useState(0.9);
	const [noteLen, setNoteLen] = useState(1);
	const [octave, setOctave] = useState(0);
	const history = useRef<Project[]>([]);
	const future = useRef<Project[]>([]);

	const sampleById = useMemo(
		() => new Map(pack.samples.map((s) => [s.id, s])),
		[pack],
	);

	const commit = useCallback(
		(next: Project) => {
			if (locked) return;
			history.current = [...history.current.slice(-50), project];
			future.current = [];
			onChange(normalizeProject(next));
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
				e.shiftKey ? redo() : undo();
			} else if (e.key === "Tab") {
				e.preventDefault();
				commit({
					...project,
					playMode: project.playMode === "pattern" ? "song" : "pattern",
				});
			} else if (e.key === "F6" || e.key === "1") setPanel("rack");
			else if (e.key === "F7" || e.key === "2") setPanel("keys");
			else if (e.key === "F5" || e.key === "3") setPanel("playlist");
			else if (e.key === "F9" || e.key === "4") setPanel("mixer");
			else if (e.key === "]" || e.key === "[") {
				const dir = e.key === "]" ? 1 : -1;
				commit({
					...project,
					activePattern:
						(project.activePattern + dir + PATTERN_COUNT) % PATTERN_COUNT,
				});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [locked, project, playing, ready]);

	const updateChannel = (idx: number, patch: Partial<Channel>) => {
		commit({
			...project,
			channels: project.channels.map((c, i) =>
				i === idx ? { ...c, ...patch } : c,
			),
		});
	};

	const setCell = (chIdx: number, stepIdx: number, cell: StepCell) => {
		const patterns = project.patterns.map((p, pi) => {
			if (pi !== project.activePattern) return p;
			return {
				...p,
				tracks: p.tracks.map((t, ti) => {
					if (ti !== chIdx) return t;
					const steps = t.steps.map((s, si) => (si === stepIdx ? cell : asStep(s)));
					return { ...t, steps };
				}),
			};
		});
		commit({ ...project, patterns });
	};

	const toggleStep = (chIdx: number, stepIdx: number) => {
		const cur = asStep(
			project.patterns[project.activePattern]?.tracks[chIdx]?.steps[stepIdx],
		);
		if (cur.on) setCell(chIdx, stepIdx, emptyStep());
		else setCell(chIdx, stepIdx, hitStep(paintVel, cur.pitch, noteLen, cur.stepPan));
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
		const blob = await renderProjectWav(pack, project, 1);
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `beat-ranked-${pack.genre}-${pack.seed}.wav`;
		a.click();
	};

	const activePat = project.patterns[project.activePattern]!;
	const channel = project.channels[selected];
	const sample = channel ? sampleById.get(channel.sampleId) : null;
	const songBars = songLengthBars(project);

	const addClip = (patternIndex: number) => {
		const startBar = songBars;
		const clip: PlaylistClip = {
			id: `c${Date.now().toString(36)}`,
			patternIndex,
			startBar,
			lengthBars: 1,
		};
		commit({ ...project, playlist: [...project.playlist, clip], playMode: "song" });
	};

	const stampScale = (chIdx: number) => {
		// FL-ish stamp: place a simple scale phrase on empty-ish melody channel
		const degrees = [0, 2, 4, 5, 7, 9, 11, 12];
		const patterns = project.patterns.map((p, pi) => {
			if (pi !== project.activePattern) return p;
			return {
				...p,
				tracks: p.tracks.map((t, ti) => {
					if (ti !== chIdx) return t;
					const steps = t.steps.map((s, si) => {
						if (si % 2 !== 0) return asStep(s);
						return hitStep(0.8, degrees[(si / 2) % degrees.length]!, 2);
					});
					return { ...t, steps };
				}),
			};
		});
		commit({ ...project, patterns });
	};

	return (
		<div className="fl-daw">
			{/* FL-style transport */}
			<div className="fl-transport">
				<button
					type="button"
					className={`fl-pat-song ${project.playMode === "pattern" ? "pat" : "song"}`}
					disabled={locked}
					onClick={() =>
						commit({
							...project,
							playMode: project.playMode === "pattern" ? "song" : "pattern",
						})
					}
					title="Tab toggles Pat/Song"
				>
					{project.playMode === "pattern" ? "PAT" : "SONG"}
				</button>
				<button
					type="button"
					className={`btn play ${playing ? "active" : ""}`}
					disabled={!ready}
					onClick={() => void togglePlay()}
				>
					{playing ? "Stop" : "Play"}
				</button>
				<div className="fl-pattern-sel">
					<button
						type="button"
						className="mini"
						disabled={locked}
						onClick={() =>
							commit({
								...project,
								activePattern:
									(project.activePattern - 1 + PATTERN_COUNT) % PATTERN_COUNT,
							})
						}
					>
						−
					</button>
					<span className="fl-pat-num">
						{String(project.activePattern + 1).padStart(3, "0")}
					</span>
					<button
						type="button"
						className="mini"
						disabled={locked}
						onClick={() =>
							commit({
								...project,
								activePattern: (project.activePattern + 1) % PATTERN_COUNT,
							})
						}
					>
						+
					</button>
					<span className="fl-pat-name">{activePat.name}</span>
				</div>
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
					<span>Len</span>
					<select
						value={noteLen}
						disabled={locked}
						onChange={(e) => setNoteLen(Number(e.target.value))}
					>
						{[1, 2, 3, 4, 6, 8].map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
				</label>
				<button type="button" className="btn ghost" disabled={locked} onClick={undo}>
					Undo
				</button>
				<button type="button" className="btn ghost" disabled={locked} onClick={redo}>
					Redo
				</button>
				<button type="button" className="btn ghost" onClick={() => void download()}>
					Export
				</button>
				<span className="daw-ready">
					{ready
						? `${project.playMode.toUpperCase()} · step ${step + 1}`
						: "Loading…"}
				</span>
			</div>

			{/* Pattern chips */}
			<div className="fl-pattern-bank">
				{project.patterns.map((p, i) => {
					const filled = p.tracks.some((t) => t.steps.some((s) => stepOn(s)));
					return (
						<button
							key={p.name}
							type="button"
							className={`fl-pat-chip ${i === project.activePattern ? "on" : ""} ${filled ? "filled" : ""}`}
							disabled={locked}
							onClick={() => commit({ ...project, activePattern: i })}
							onDoubleClick={() => {
								const name = prompt("Pattern name", p.name);
								if (!name) return;
								commit({
									...project,
									patterns: project.patterns.map((pp, pi) =>
										pi === i ? { ...pp, name } : pp,
									),
								});
							}}
						>
							{i + 1}
						</button>
					);
				})}
			</div>

			{/* Window tabs — FL F5/F6/F7/F9 mapping */}
			<div className="fl-window-tabs">
				{(
					[
						["rack", "Channel Rack"],
						["keys", "Piano Roll"],
						["playlist", "Playlist"],
						["mixer", "Mixer"],
					] as const
				).map(([id, label]) => (
					<button
						key={id}
						type="button"
						className={`btn ${panel === id ? "primary" : "ghost"}`}
						onClick={() => setPanel(id)}
					>
						{label}
					</button>
				))}
				<button
					type="button"
					className={`btn ghost ${graphOpen ? "active" : ""}`}
					onClick={() => setGraphOpen((v) => !v)}
				>
					Graph
				</button>
			</div>

			<div className="fl-workspace">
				{/* Browser */}
				<aside className="fl-browser">
					<div className="fl-browser-title">Browser · Pack</div>
					<ul>
						{pack.samples.map((s, i) => {
							const color = ROLE_COLOR[s.role] ?? "#888";
							return (
								<li key={s.id}>
									<button
										type="button"
										className={`fl-browser-item ${selected === i ? "on" : ""} ${s.mustUse ? "must" : ""}`}
										onClick={() => {
											setSelected(i);
											void engine.preview(s.id, 0, 0.85);
										}}
										onDoubleClick={() => setPanel("keys")}
									>
										<span className="dot" style={{ background: color }} />
										<span className="nm">{s.name}</span>
										<span className="rl">{s.role}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</aside>

				<div className="fl-main">
					{panel === "rack" && (
						<div className="fl-rack">
							{project.channels.map((ch, ci) => {
								const s = sampleById.get(ch.sampleId);
								const color = ROLE_COLOR[s?.role ?? "fx"] ?? "#888";
								const steps =
									activePat.tracks[ci]?.steps ??
									Array.from({ length: project.patternLength }, () => emptyStep());
								return (
									<div
										key={ch.sampleId}
										className={`fl-channel ${selected === ci ? "selected" : ""}`}
										onClick={() => setSelected(ci)}
									>
										<button
											type="button"
											className={`fl-led ${ch.mute ? "" : "lit"}`}
											title="Mute"
											disabled={locked}
											onClick={(e) => {
												e.stopPropagation();
												updateChannel(ci, { mute: !ch.mute });
											}}
										/>
										<label className="fl-knob" title="Pan">
											<input
												type="range"
												min={-1}
												max={1}
												step={0.01}
												value={ch.pan}
												disabled={locked}
												onChange={(e) =>
													updateChannel(ci, { pan: Number(e.target.value) })
												}
											/>
										</label>
										<label className="fl-knob" title="Volume">
											<input
												type="range"
												min={0}
												max={1}
												step={0.01}
												value={ch.gain}
												disabled={locked}
												onChange={(e) =>
													updateChannel(ci, { gain: Number(e.target.value) })
												}
											/>
										</label>
										<button
											type="button"
											className="fl-chan-btn"
											style={{ borderColor: color, color }}
											onClick={(e) => {
												e.stopPropagation();
												setSelected(ci);
												void engine.preview(ch.sampleId, ch.pitch, ch.gain, ch);
											}}
											onDoubleClick={() => {
												setSelected(ci);
												setPanel("keys");
											}}
										>
											<span className="fl-chan-name">{s?.name}</span>
											<span className="fl-chan-role">
												{s?.role}
												{s?.mustUse ? " ★" : ""}
											</span>
										</button>
										<div className="fl-steps">
											{steps.map((raw, si) => {
												const cell = asStep(raw);
												const beat = si % 4 === 0;
												const now =
													playing &&
													project.playMode === "pattern" &&
													step % project.patternLength === si;
												return (
													<button
														key={si}
														type="button"
														className={`fl-step ${cell.on ? "on" : ""} ${beat ? "beat" : ""} ${now ? "now" : ""}`}
														style={
															cell.on
																? {
																		opacity: 0.4 + cell.velocity * 0.6,
																	}
																: undefined
														}
														disabled={locked}
														onClick={(e) => {
															e.stopPropagation();
															toggleStep(ci, si);
														}}
														onContextMenu={(e) => {
															e.preventDefault();
															if (!cell.on) return;
															setCell(ci, si, {
																...cell,
																length: Math.min(8, cell.length + 1),
															});
														}}
													/>
												);
											})}
										</div>
									</div>
								);
							})}

							{graphOpen && channel && (
								<div className="fl-graph">
									<div className="fl-graph-tabs">
										{(
											[
												["velocity", "Velocity"],
												["pitch", "Pitch"],
												["stepPan", "Pan"],
											] as const
										).map(([id, label]) => (
											<button
												key={id}
												type="button"
												className={graph === id ? "on" : ""}
												onClick={() => setGraph(id)}
											>
												{label}
											</button>
										))}
										<span className="fl-graph-hint">
											Graph Editor · {sample?.name}
										</span>
									</div>
									<div className="fl-graph-bars">
										{(activePat.tracks[selected]?.steps ?? []).map((raw, si) => {
											const cell = asStep(raw);
											let h = 0.15;
											if (graph === "velocity") h = cell.on ? cell.velocity : 0.08;
											if (graph === "pitch")
												h = cell.on ? (cell.pitch + 12) / 24 : 0.08;
											if (graph === "stepPan")
												h = cell.on ? (cell.stepPan + 1) / 2 : 0.08;
											return (
												<button
													key={si}
													type="button"
													className={`fl-gbar ${cell.on ? "on" : ""}`}
													disabled={locked || !cell.on}
													style={{ height: `${Math.round(h * 100)}%` }}
													onClick={(e) => {
														const rect = (
															e.currentTarget.parentElement as HTMLElement
														).getBoundingClientRect();
														const y = 1 - (e.clientY - rect.top) / rect.height;
														const next = { ...cell };
														if (graph === "velocity")
															next.velocity = Math.max(0.05, Math.min(1, y));
														if (graph === "pitch")
															next.pitch = Math.round(y * 24 - 12);
														if (graph === "stepPan")
															next.stepPan = Math.max(-1, Math.min(1, y * 2 - 1));
														setCell(selected, si, next);
													}}
												/>
											);
										})}
									</div>
								</div>
							)}
						</div>
					)}

					{panel === "keys" && channel && sample && (
						<div className="piano-roll fl-piano">
							<div className="piano-meta">
								<strong>
									Piano roll · {sample.name}
								</strong>
								<span>Double-click channel button opens this</span>
								<div className="piano-oct">
									<button
										type="button"
										className="btn ghost"
										onClick={() => setOctave((o) => o - 1)}
									>
										Oct −
									</button>
									<button
										type="button"
										className="btn ghost"
										onClick={() => setOctave((o) => o + 1)}
									>
										Oct +
									</button>
									<button
										type="button"
										className="btn ghost"
										disabled={locked}
										onClick={() => stampScale(selected)}
									>
										Stamp scale
									</button>
								</div>
							</div>
							<div className="piano-grid">
								{Array.from({ length: PIANO_RANGE }, (_, row) => {
									const pitch = PIANO_RANGE - 1 - row + octave * 12 - 12;
									const midi = sample.rootMidi + pitch;
									const black = [1, 3, 6, 8, 10].includes(
										((midi % 12) + 12) % 12,
									);
									const steps = activePat.tracks[selected]?.steps ?? [];
									return (
										<div
											key={row}
											className={`piano-row ${black ? "black" : ""}`}
										>
											<button
												type="button"
												className="piano-key"
												onClick={() =>
													void engine.preview(
														channel.sampleId,
														channel.pitch + pitch,
														channel.gain,
														channel,
													)
												}
											>
												{midiLabel(midi)}
											</button>
											<div className="piano-steps">
												{steps.map((raw, si) => {
													const cell = asStep(raw);
													const active = cell.on && cell.pitch === pitch;
													return (
														<button
															key={si}
															type="button"
															className={`pstep ${active ? "on" : ""} ${si % 4 === 0 ? "beat" : ""}`}
															disabled={locked}
															style={
																active
																	? {
																			gridColumn: `span ${Math.min(cell.length, 16 - si)}`,
																		}
																	: undefined
															}
															onClick={() => {
																if (active) setCell(selected, si, emptyStep());
																else {
																	setCell(
																		selected,
																		si,
																		hitStep(paintVel, pitch, noteLen),
																	);
																	void engine.preview(
																		channel.sampleId,
																		channel.pitch + pitch,
																		channel.gain * paintVel,
																		channel,
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
							{/* Velocity lane */}
							<div className="fl-vel-lane">
								<span>VEL</span>
								<div className="fl-graph-bars">
									{(activePat.tracks[selected]?.steps ?? []).map((raw, si) => {
										const cell = asStep(raw);
										return (
											<button
												key={si}
												type="button"
												className={`fl-gbar ${cell.on ? "on" : ""}`}
												disabled={locked || !cell.on}
												style={{
													height: `${Math.round((cell.on ? cell.velocity : 0.08) * 100)}%`,
												}}
												onClick={(e) => {
													const rect = (
														e.currentTarget.parentElement as HTMLElement
													).getBoundingClientRect();
													const y = 1 - (e.clientY - rect.top) / rect.height;
													setCell(selected, si, {
														...cell,
														velocity: Math.max(0.05, Math.min(1, y)),
													});
												}}
											/>
										);
									})}
								</div>
							</div>
						</div>
					)}

					{panel === "playlist" && (
						<div className="fl-playlist">
							<div className="fl-playlist-head">
								<strong>Playlist · Song mode arrangement</strong>
								<span>{songBars} bars</span>
								<button
									type="button"
									className="btn ghost"
									disabled={locked}
									onClick={() => addClip(project.activePattern)}
								>
									+ Drop pattern {project.activePattern + 1}
								</button>
							</div>
							<div
								className="fl-playlist-grid"
								style={{
									gridTemplateColumns: `80px repeat(${Math.max(songBars, 4)}, minmax(48px, 1fr))`,
								}}
							>
								<div className="fl-pl-corner" />
								{Array.from({ length: Math.max(songBars, 4) }, (_, b) => (
									<div key={b} className="fl-pl-barhead">
										{b + 1}
									</div>
								))}
								{project.patterns.map((p, pi) => (
									<div key={p.name} className="fl-pl-row" style={{ display: "contents" }}>
										<div className="fl-pl-label">{p.name}</div>
										{Array.from({ length: Math.max(songBars, 4) }, (_, b) => {
											const clip = project.playlist.find(
												(c) =>
													c.patternIndex === pi &&
													b >= c.startBar &&
													b < c.startBar + c.lengthBars,
											);
											return (
												<button
													key={`${pi}-${b}`}
													type="button"
													className={`fl-pl-cell ${clip ? "filled" : ""}`}
													disabled={locked}
													onClick={() => {
														if (clip) {
															commit({
																...project,
																playlist: project.playlist.filter(
																	(c) => c.id !== clip.id,
																),
																playMode: "song",
															});
														} else {
															commit({
																...project,
																playlist: [
																	...project.playlist,
																	{
																		id: `c${Date.now()}${b}`,
																		patternIndex: pi,
																		startBar: b,
																		lengthBars: 1,
																	},
																],
																playMode: "song",
															});
														}
													}}
												>
													{clip ? `P${pi + 1}` : ""}
												</button>
											);
										})}
									</div>
								))}
							</div>
							<p className="fl-hint">
								Switch transport to <strong>SONG</strong> to hear the arrangement.
								PAT loops the selected pattern only.
							</p>
						</div>
					)}

					{panel === "mixer" && (
						<div className="mixer-board fl-mixer">
							<div className="mixer-strips">
								{project.channels.map((ch, ci) => {
									const s = sampleById.get(ch.sampleId);
									const color = ROLE_COLOR[s?.role ?? "fx"] ?? "#888";
									return (
										<div
											key={ch.sampleId}
											className={`strip ${selected === ci ? "selected" : ""}`}
											onClick={() => setSelected(ci)}
										>
											<div className="strip-name" style={{ color }}>
												{s?.name}
											</div>
											<label>
												Vol
												<input
													type="range"
													min={0}
													max={1}
													step={0.01}
													value={ch.gain}
													disabled={locked}
													onChange={(e) =>
														updateChannel(ci, { gain: Number(e.target.value) })
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
													value={ch.pan}
													disabled={locked}
													onChange={(e) =>
														updateChannel(ci, { pan: Number(e.target.value) })
													}
												/>
											</label>
											<div className="fl-inserts">
												<span className="ins-label">INSERTS</span>
												<label>
													EQ Lo
													<input
														type="range"
														min={-1}
														max={1}
														step={0.01}
														value={ch.eqLow}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																eqLow: Number(e.target.value),
															})
														}
													/>
												</label>
												<label>
													EQ Mid
													<input
														type="range"
														min={-1}
														max={1}
														step={0.01}
														value={ch.eqMid}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																eqMid: Number(e.target.value),
															})
														}
													/>
												</label>
												<label>
													EQ Hi
													<input
														type="range"
														min={-1}
														max={1}
														step={0.01}
														value={ch.eqHigh}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																eqHigh: Number(e.target.value),
															})
														}
													/>
												</label>
												<label>
													Comp
													<input
														type="range"
														min={0}
														max={1}
														step={0.01}
														value={ch.compress}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																compress: Number(e.target.value),
															})
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
														value={ch.drive}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																drive: Number(e.target.value),
															})
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
														value={ch.filter}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																filter: Number(e.target.value),
															})
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
														value={ch.reverb}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																reverb: Number(e.target.value),
															})
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
														value={ch.delay}
														disabled={locked}
														onChange={(e) =>
															updateChannel(ci, {
																delay: Number(e.target.value),
															})
														}
													/>
												</label>
											</div>
											<div className="strip-toggles">
												<button
													type="button"
													className={`mini ${ch.mute ? "hot" : ""}`}
													disabled={locked}
													onClick={() => updateChannel(ci, { mute: !ch.mute })}
												>
													M
												</button>
												<button
													type="button"
													className={`mini ${ch.solo ? "hot" : ""}`}
													disabled={locked}
													onClick={() => updateChannel(ci, { solo: !ch.solo })}
												>
													S
												</button>
												<button
													type="button"
													className={`mini ${ch.reverse ? "hot" : ""}`}
													disabled={locked}
													onClick={() =>
														updateChannel(ci, { reverse: !ch.reverse })
													}
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
										Vol
										<input
											type="range"
											min={0}
											max={1}
											step={0.01}
											value={project.masterGain}
											disabled={locked}
											onChange={(e) =>
												commit({
													...project,
													masterGain: Number(e.target.value),
												})
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
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<p className="daw-shortcuts">
				Space play · Tab Pat/Song · [ ] pattern · F5 Playlist · F6 Rack · F7 Piano ·
				F9 Mixer · Graph = velocity/pitch/pan per step
			</p>
		</div>
	);
}
