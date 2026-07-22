import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack, Project, TrackPattern } from "../../shared/types";
import { DawEngine, renderProjectWav } from "../audio/engine";

type Props = {
	pack: Pack;
	project: Project;
	onChange: (p: Project) => void;
	locked?: boolean;
	currentStep?: number;
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

export function Daw({ pack, project, onChange, locked }: Props) {
	const engineRef = useRef<DawEngine | null>(null);
	if (engineRef.current == null) {
		engineRef.current = new DawEngine(project);
	}
	const engine = engineRef.current;

	const [playing, setPlaying] = useState(false);
	const [step, setStep] = useState(0);
	const [ready, setReady] = useState(false);
	const [selected, setSelected] = useState(0);

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

	const sampleById = useMemo(() => {
		const m = new Map(pack.samples.map((s) => [s.id, s]));
		return m;
	}, [pack]);

	const updateTrack = (idx: number, patch: Partial<TrackPattern>) => {
		if (locked) return;
		const tracks = project.tracks.map((t, i) =>
			i === idx ? { ...t, ...patch } : t,
		);
		onChange({ ...project, tracks });
	};

	const toggleStep = (trackIdx: number, stepIdx: number) => {
		if (locked) return;
		const tracks = project.tracks.map((t, i) => {
			if (i !== trackIdx) return t;
			const steps = [...t.steps];
			steps[stepIdx] = !steps[stepIdx];
			return { ...t, steps };
		});
		onChange({ ...project, tracks });
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

	const track = project.tracks[selected];
	const sample = track ? sampleById.get(track.sampleId) : null;

	return (
		<div className="daw">
			<div className="daw-transport">
				<button
					type="button"
					className={`btn play ${playing ? "active" : ""}`}
					onClick={() => void togglePlay()}
					disabled={!ready}
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
							onChange({ ...project, bpm: Number(e.target.value) || project.bpm })
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
							onChange({ ...project, swing: Number(e.target.value) })
						}
					/>
				</label>
				<label className="knob">
					<span>Bars</span>
					<select
						value={project.bars}
						disabled={locked}
						onChange={(e) =>
							onChange({ ...project, bars: Number(e.target.value) })
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
				<span className="daw-ready">{ready ? "Engine ready" : "Loading samples…"}</span>
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
									{s?.mustUse ? " · MUST" : ""}
								</span>
								<span className="name">{s?.name}</span>
							</button>
							<div className="steps">
								{t.steps.map((on, si) => {
									const beat = si % 4 === 0;
									const activePlay =
										playing && step % 16 === si && step < 16 * project.bars;
									return (
										<button
											key={si}
											type="button"
											className={`step ${on ? "on" : ""} ${beat ? "beat" : ""} ${activePlay ? "now" : ""}`}
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
						</div>
					);
				})}
			</div>

			{track && sample && (
				<div className="mixer">
					<h3>
						{sample.name} <em>({sample.role})</em>
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
					</div>
				</div>
			)}
		</div>
	);
}
