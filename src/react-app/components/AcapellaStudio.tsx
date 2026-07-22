import { useEffect, useRef, useState } from "react";
import type { Challenge, Project, VoiceRole } from "../../shared/types";
import {
	ROLE_HELP,
	VOICE_ROLES,
	missingVoiceRoles,
	normalizeProject,
} from "../../shared/types";
import { AcapellaEngine, renderRemakeWav } from "../audio/engine";

type Props = {
	challenge: Challenge;
	project: Project;
	onChange: (p: Project) => void;
	locked?: boolean;
};

const ROLE_COLOR: Record<VoiceRole, string> = {
	drums: "#ff6b2c",
	bass: "#38bdf8",
	melody: "#f472b6",
	harmony: "#a78bfa",
	fx: "#94a3b8",
};

const MAX_REC_MS = 3200;

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export function AcapellaStudio({ challenge, project: raw, onChange, locked }: Props) {
	const project = normalizeProject(raw);
	const engineRef = useRef<AcapellaEngine | null>(null);
	if (!engineRef.current) engineRef.current = new AcapellaEngine(project);
	const engine = engineRef.current;

	const [ready, setReady] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [playingRef, setPlayingRef] = useState(false);
	const [step, setStep] = useState(0);
	const [recordingRole, setRecordingRole] = useState<VoiceRole | null>(null);
	const [error, setError] = useState<string | null>(null);
	const mediaRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		engine.onStep = (s) => setStep(s);
		return () => {
			engine.dispose();
			engineRef.current = null;
		};
	}, [engine]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			await engine.setChallenge(challenge);
			await engine.setProject(project);
			if (!cancelled) setReady(true);
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [engine, challenge.seed]);

	useEffect(() => {
		void engine.setProject(project);
	}, [engine, project]);

	const commit = (next: Project) => {
		if (locked) return;
		onChange(normalizeProject(next));
	};

	const stopAll = () => {
		engine.stop();
		setPlaying(false);
		setPlayingRef(false);
	};

	const playRef = async () => {
		if (!ready) return;
		stopAll();
		await engine.playReference();
		setPlayingRef(true);
	};

	const playRemake = async () => {
		if (!ready) return;
		stopAll();
		await engine.playRemake();
		setPlaying(true);
	};

	const startRecord = async (role: VoiceRole) => {
		if (locked || recordingRole) return;
		setError(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true },
			});
			const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
				? "audio/webm;codecs=opus"
				: "audio/webm";
			const rec = new MediaRecorder(stream, { mimeType: mime });
			chunksRef.current = [];
			rec.ondataavailable = (e) => {
				if (e.data.size) chunksRef.current.push(e.data);
			};
			rec.onstop = async () => {
				stream.getTracks().forEach((t) => t.stop());
				setRecordingRole(null);
				const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime });
				if (blob.size < 250) {
					setError("Too quiet — try again closer to the mic");
					return;
				}
				const b64 = await blobToBase64(blob);
				const id = `v${Date.now().toString(36)}`;
				const clips = [
					...project.clips.filter((c) => c.role !== role),
					{
						id,
						role,
						label: `${role} take`,
						audioBase64: b64,
						mime: blob.type,
					},
				];
				const lanes = project.lanes.map((l) =>
					l.role === role
						? {
								...l,
								clipId: id,
								steps:
									l.steps.some(Boolean)
										? l.steps
										: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
							}
						: l,
				);
				commit({ ...project, clips, lanes });
			};
			mediaRef.current = rec;
			rec.start();
			setRecordingRole(role);
			timerRef.current = window.setTimeout(() => {
				if (rec.state === "recording") rec.stop();
			}, MAX_REC_MS);
		} catch {
			setError("Allow microphone access to record voice layers");
		}
	};

	const stopRecord = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		if (mediaRef.current?.state === "recording") mediaRef.current.stop();
	};

	const toggleStep = (role: VoiceRole, si: number) => {
		const lanes = project.lanes.map((l) => {
			if (l.role !== role) return l;
			const steps = [...l.steps];
			steps[si] = !steps[si];
			return { ...l, steps };
		});
		commit({ ...project, lanes });
	};

	const updateLane = (
		role: VoiceRole,
		patch: Partial<(typeof project.lanes)[0]>,
	) => {
		commit({
			...project,
			lanes: project.lanes.map((l) => (l.role === role ? { ...l, ...patch } : l)),
		});
	};

	const missing = missingVoiceRoles(challenge, project);

	const download = async () => {
		const blob = await renderRemakeWav(project);
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `acapella-${challenge.title.replace(/\s+/g, "-").toLowerCase()}.wav`;
		a.click();
	};

	return (
		<div className="acapella">
			<section className="challenge-hero">
				<div>
					<p className="eyebrow">challenge track</p>
					<h2>
						{challenge.title}{" "}
						<em>
							· {challenge.genre} · {challenge.bpm} BPM
						</em>
					</h2>
					<p>{challenge.vibe}</p>
					<p className="hint-line">{challenge.hint}</p>
				</div>
				<div className="challenge-actions">
					<button
						type="button"
						className={`btn primary ${playingRef ? "active" : ""}`}
						disabled={!ready}
						onClick={() => void (playingRef ? stopAll() : playRef())}
					>
						{playingRef ? "Stop song" : "Play song clip"}
					</button>
					<button
						type="button"
						className={`btn play ${playing ? "active" : ""}`}
						disabled={!ready}
						onClick={() => void (playing ? stopAll() : playRemake())}
					>
						{playing ? "Stop remake" : "Play your remake"}
					</button>
					<button type="button" className="btn ghost" onClick={() => void download()}>
						Export WAV
					</button>
				</div>
			</section>

			<p className="must-line">
				Must cover with your voice:{" "}
				{challenge.mustRoles.map((r) => (
					<span key={r} className={missing.includes(r) ? "need" : "ok"}>
						{r}
					</span>
				))}
			</p>

			{error && <p className="error banner">{error}</p>}

			<div className="voice-lanes">
				{VOICE_ROLES.map((role) => {
					const lane = project.lanes.find((l) => l.role === role)!;
					const clip = project.clips.find((c) => c.id === lane.clipId);
					const color = ROLE_COLOR[role];
					const must = challenge.mustRoles.includes(role);
					const recording = recordingRole === role;
					return (
						<div
							key={role}
							className={`voice-lane ${must ? "must" : ""} ${clip ? "has-clip" : ""}`}
						>
							<div className="voice-meta">
								<div className="voice-title" style={{ color }}>
									<strong>{role}</strong>
									{must ? <span className="must-tag">required</span> : null}
								</div>
								<p>{ROLE_HELP[role]}</p>
								<div className="voice-actions">
									{!recording ? (
										<button
											type="button"
											className="btn primary"
											disabled={locked}
											onClick={() => void startRecord(role)}
										>
											{clip ? "Re-record" : "Record"}
										</button>
									) : (
										<button type="button" className="btn play active" onClick={stopRecord}>
											Stop ({(MAX_REC_MS / 1000).toFixed(1)}s max)
										</button>
									)}
									{clip && (
										<button
											type="button"
											className="btn ghost"
											onClick={() => void engine.previewClip(clip.id)}
										>
											Preview clip
										</button>
									)}
								</div>
								<label className="knob">
									<span>Vol</span>
									<input
										type="range"
										min={0}
										max={1}
										step={0.01}
										value={lane.gain}
										disabled={locked}
										onChange={(e) =>
											updateLane(role, { gain: Number(e.target.value) })
										}
									/>
								</label>
								<label className="knob">
									<span>Pitch</span>
									<input
										type="range"
										min={-8}
										max={8}
										step={1}
										value={lane.pitch}
										disabled={locked}
										onChange={(e) =>
											updateLane(role, { pitch: Number(e.target.value) })
										}
									/>
								</label>
								<label className="check">
									<input
										type="checkbox"
										checked={lane.mute}
										disabled={locked}
										onChange={(e) =>
											updateLane(role, { mute: e.target.checked })
										}
									/>
									Mute
								</label>
							</div>
							<div className="steps">
								{lane.steps.map((on, si) => {
									const beat = si % 4 === 0;
									const now = playing && step % 16 === si;
									return (
										<button
											key={si}
											type="button"
											className={`step ${on ? "on" : ""} ${beat ? "beat" : ""} ${now ? "now" : ""}`}
											style={on ? { background: color } : undefined}
											disabled={locked || !clip}
											title={!clip ? "Record a clip first" : undefined}
											onClick={() => toggleStep(role, si)}
										/>
									);
								})}
							</div>
							<div className="clip-status">
								{clip ? `Clip ready · ${clip.label}` : "No clip yet"}
							</div>
						</div>
					);
				})}
			</div>

			<label className="knob swing-row">
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
		</div>
	);
}
