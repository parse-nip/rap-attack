import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack, Project, TrackPattern } from "../../shared/types";
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

const ROLE_COLOR: Record<string, string> = {
	kick: "#ff6b2c",
	snare: "#ffb347",
	hat: "#5eead4",
	perc: "#a78bfa",
	bass: "#38bdf8",
	melody: "#f472b6",
	fx: "#94a3b8",
	vocal: "#facc15",
};

export function Daw({ pack, project: raw, onChange, locked }: Props) {
	const project = useMemo(() => normalizeProject(raw), [raw]);
	const engineRef = useRef<DawEngine | null>(null);
	if (!engineRef.current) engineRef.current = new DawEngine(project);
	const engine = engineRef.current;

	const [playing, setPlaying] = useState(false);
	const [step, setStep] = useState(0);
	const [ready, setReady] = useState(false);
	const [selected, setSelected] = useState(0);

	const sampleById = useMemo(
		() => new Map(pack.samples.map((s) => [s.id, s])),
		[pack],
	);

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
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [locked, playing, ready]);

	const commit = (next: Project) => {
		if (locked) return;
		onChange(normalizeProject(next));
	};

	const updateTrack = (idx: number, patch: Partial<TrackPattern>) => {
		commit({
			...project,
			tracks: project.tracks.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
		});
	};

	const toggleStep = (ti: number, si: number) => {
		const tracks = project.tracks.map((t, i) => {
			if (i !== ti) return t;
			const steps = t.steps.map((s, j) => {
				if (j !== si) return asStep(s);
				const cur = asStep(s);
				return cur.on ? emptyStep() : hitStep(0.85, cur.pitch);
			});
			return { ...t, steps };
		});
		commit({ ...project, tracks });
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
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `beat-${pack.genre}-${pack.seed}.wav`;
		a.click();
	};

	const clearTrack = (idx: number) => {
		updateTrack(idx, {
			steps: Array.from({ length: 16 }, () => emptyStep()),
		});
	};

	const track = project.tracks[selected];
	const sample = track ? sampleById.get(track.sampleId) : null;

	return (
		<div className="daw simple-daw">
			<div className="daw-transport">
				<button
					type="button"
					className={`btn play ${playing ? "active" : ""}`}
					disabled={!ready}
					onClick={() => void togglePlay()}
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
						<option value={1}>1</option>
						<option value={2}>2</option>
						<option value={4}>4</option>
					</select>
				</label>
				<button type="button" className="btn ghost" onClick={() => void download()}>
					Export WAV
				</button>
				<span className="daw-ready">
					{ready ? "Tap steps · Space to play" : "Loading…"}
				</span>
			</div>

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
							<button
								type="button"
								className="pad-label"
								style={{ borderColor: color, color }}
								onClick={(e) => {
									e.stopPropagation();
									setSelected(ti);
									void engine.preview(t.sampleId, t.pitch, t.gain);
								}}
							>
								<span className="role">
									{s?.role}
									{s?.mustUse ? " · must" : ""}
								</span>
								<span className="name">{s?.name}</span>
							</button>
							<div className="steps">
								{t.steps.map((raw, si) => {
									const on = stepOn(raw);
									const beat = si % 4 === 0;
									const now =
										playing && step % 16 === si && step < 16 * project.bars;
									return (
										<button
											key={si}
											type="button"
											className={`step ${on ? "on" : ""} ${beat ? "beat" : ""} ${now ? "now" : ""}`}
											style={on ? { background: color } : undefined}
											disabled={locked}
											onClick={(e) => {
												e.stopPropagation();
												toggleStep(ti, si);
											}}
										/>
									);
								})}
							</div>
							<button
								type="button"
								className="mini clear-btn"
								disabled={locked}
								onClick={(e) => {
									e.stopPropagation();
									clearTrack(ti);
								}}
							>
								Clr
							</button>
						</div>
					);
				})}
			</div>

			{track && sample && (
				<div className="mixer inspector">
					<h3>
						{sample.name} <em>({sample.role})</em>
					</h3>
					<div className="mixer-grid">
						<label>
							Volume
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
							Pitch
							<input
								type="range"
								min={-12}
								max={12}
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
						<label className="check">
							<input
								type="checkbox"
								checked={track.mute}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { mute: e.target.checked })
								}
							/>
							Mute
						</label>
						<label className="check">
							<input
								type="checkbox"
								checked={track.solo}
								disabled={locked}
								onChange={(e) =>
									updateTrack(selected, { solo: e.target.checked })
								}
							/>
							Solo
						</label>
					</div>
					<p className="hint-line">
						Starter groove is already loaded — flip steps, twist a few knobs, drop
						your tag, submit.
					</p>
				</div>
			)}
		</div>
	);
}
