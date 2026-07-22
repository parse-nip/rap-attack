import { useEffect, useRef, useState } from "react";
import type {
	Challenge,
	Placement,
	Project,
	VoiceClip,
	VoiceRole,
} from "../../shared/types";
import {
	ROLE_HELP,
	STEPS_PER_BAR,
	VOICE_ROLES,
	missingVoiceRoles,
	normalizeProject,
	totalSteps,
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

/** Short one-shot — not a full loop */
const MAX_REC_MS = 900;

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

function uid(prefix: string) {
	return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function AcapellaStudio({ challenge, project: raw, onChange, locked }: Props) {
	const project = normalizeProject(raw);
	const engineRef = useRef<AcapellaEngine | null>(null);
	if (!engineRef.current) engineRef.current = new AcapellaEngine(project);
	const engine = engineRef.current;

	const [ready, setReady] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [playingRef, setPlayingRef] = useState(false);
	const [playhead, setPlayhead] = useState(0);
	const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
	const [recordRole, setRecordRole] = useState<VoiceRole>("drums");
	const [recording, setRecording] = useState(false);
	const [paintPitch, setPaintPitch] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const mediaRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const timerRef = useRef<number | null>(null);

	const steps = totalSteps(project.bars);
	const selected =
		project.clips.find((c) => c.id === selectedClipId) ?? project.clips[0] ?? null;

	useEffect(() => {
		engine.onStep = (s) => setPlayhead(s);
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

	useEffect(() => {
		if (selectedClipId && !project.clips.some((c) => c.id === selectedClipId)) {
			setSelectedClipId(project.clips[0]?.id ?? null);
		} else if (!selectedClipId && project.clips[0]) {
			setSelectedClipId(project.clips[0].id);
		}
	}, [project.clips, selectedClipId]);

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

	const startRecord = async () => {
		if (locked || recording) return;
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
				setRecording(false);
				const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime });
				if (blob.size < 200) {
					setError("Too quiet — get closer and make one short sound");
					return;
				}
				const b64 = await blobToBase64(blob);
				const clip: VoiceClip = {
					id: uid("c"),
					role: recordRole,
					label: `${recordRole} ${project.clips.filter((c) => c.role === recordRole).length + 1}`,
					audioBase64: b64,
					mime: blob.type,
				};
				const next = { ...project, clips: [...project.clips, clip] };
				commit(next);
				setSelectedClipId(clip.id);
			};
			mediaRef.current = rec;
			rec.start();
			setRecording(true);
			timerRef.current = window.setTimeout(() => {
				if (rec.state === "recording") rec.stop();
			}, MAX_REC_MS);
		} catch {
			setError("Allow microphone access to record one-shots");
		}
	};

	const stopRecord = () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		if (mediaRef.current?.state === "recording") mediaRef.current.stop();
	};

	const deleteClip = (clipId: string) => {
		commit({
			...project,
			clips: project.clips.filter((c) => c.id !== clipId),
			placements: project.placements.filter((p) => p.clipId !== clipId),
		});
	};

	/** Toggle a stamp of the selected one-shot on this step */
	const stampStep = (step: number) => {
		if (locked || !selected) return;
		const existing = project.placements.find(
			(p) => p.step === step && p.clipId === selected.id,
		);
		if (existing) {
			commit({
				...project,
				placements: project.placements.filter((p) => p.id !== existing.id),
			});
			return;
		}
		const placement: Placement = {
			id: uid("p"),
			clipId: selected.id,
			step,
			pitch: paintPitch,
			gain: 1,
		};
		commit({ ...project, placements: [...project.placements, placement] });
	};

	/** Copy selected sound onto every Nth step */
	const stampEvery = (interval: number, offset = 0) => {
		if (locked || !selected) return;
		const next = project.placements.filter((p) => p.clipId !== selected.id);
		for (let s = offset; s < steps; s += interval) {
			next.push({
				id: uid("p"),
				clipId: selected.id,
				step: s,
				pitch: paintPitch,
				gain: 1,
			});
		}
		commit({ ...project, placements: next });
	};

	/** Duplicate bar 1 pattern of selected clip into remaining bars */
	const copyBarAcross = () => {
		if (locked || !selected || project.bars < 2) return;
		const bar0 = project.placements.filter(
			(p) => p.clipId === selected.id && p.step < STEPS_PER_BAR,
		);
		const kept = project.placements.filter(
			(p) => !(p.clipId === selected.id && p.step >= STEPS_PER_BAR),
		);
		const copies: Placement[] = [];
		for (let bar = 1; bar < project.bars; bar++) {
			for (const p of bar0) {
				copies.push({
					...p,
					id: uid("p"),
					step: p.step + bar * STEPS_PER_BAR,
				});
			}
		}
		commit({ ...project, placements: [...kept, ...copies] });
	};

	const clearSelectedFromTimeline = () => {
		if (locked || !selected) return;
		commit({
			...project,
			placements: project.placements.filter((p) => p.clipId !== selected.id),
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

	const clipsByRole = (role: VoiceRole) =>
		project.clips.filter((c) => c.role === role);

	return (
		<div className="acapella sampler">
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
					<p className="hint-line">
						Record one short mouth sound → select it → tap the timeline to copy it.
					</p>
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
				Must stamp on timeline:{" "}
				{challenge.mustRoles.map((r) => (
					<span key={r} className={missing.includes(r) ? "need" : "ok"}>
						{r}
					</span>
				))}
			</p>

			{error && <p className="error banner">{error}</p>}

			<section className="kit-panel">
				<header className="kit-head">
					<h3>Mouth kit</h3>
					<p>One sound per take. Then paint copies on the timeline.</p>
				</header>

				<div className="record-bar">
					<label>
						Recording as
						<select
							value={recordRole}
							disabled={locked || recording}
							onChange={(e) => setRecordRole(e.target.value as VoiceRole)}
						>
							{VOICE_ROLES.map((r) => (
								<option key={r} value={r}>
									{r}
								</option>
							))}
						</select>
					</label>
					{!recording ? (
						<button
							type="button"
							className="btn primary"
							disabled={locked}
							onClick={() => void startRecord()}
						>
							Record one-shot (~{(MAX_REC_MS / 1000).toFixed(1)}s)
						</button>
					) : (
						<button type="button" className="btn play active" onClick={stopRecord}>
							Stop
						</button>
					)}
					<p className="rec-hint">{ROLE_HELP[recordRole]}</p>
				</div>

				<div className="kit-pads">
					{project.clips.length === 0 && (
						<p className="kit-empty">No sounds yet — record a kick / hum / note.</p>
					)}
					{VOICE_ROLES.map((role) => {
						const pads = clipsByRole(role);
						if (!pads.length) return null;
						return (
							<div key={role} className="kit-role">
								<span className="kit-role-label" style={{ color: ROLE_COLOR[role] }}>
									{role}
								</span>
								<div className="kit-role-pads">
									{pads.map((clip) => {
										const hits = project.placements.filter(
											(p) => p.clipId === clip.id,
										).length;
										const active = selected?.id === clip.id;
										return (
											<div
												key={clip.id}
												className={`pad ${active ? "active" : ""}`}
												style={{ ["--pad" as string]: ROLE_COLOR[role] }}
											>
												<button
													type="button"
													className="pad-main"
													disabled={locked}
													onClick={() => setSelectedClipId(clip.id)}
												>
													<strong>{clip.label}</strong>
													<em>{hits} on timeline</em>
												</button>
												<div className="pad-tools">
													<button
														type="button"
														className="btn ghost"
														onClick={() => void engine.previewClip(clip.id)}
													>
														Preview
													</button>
													<button
														type="button"
														className="btn ghost"
														disabled={locked}
														onClick={() => deleteClip(clip.id)}
													>
														Delete
													</button>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</section>

			<section className="timeline-panel">
				<header className="timeline-head">
					<div>
						<h3>Timeline</h3>
						<p>
							{selected
								? `Stamping “${selected.label}” — tap a step to copy / remove`
								: "Select a kit sound first"}
						</p>
					</div>
					<label className="knob">
						<span>Paint pitch</span>
						<input
							type="range"
							min={-8}
							max={8}
							step={1}
							value={paintPitch}
							disabled={locked}
							onChange={(e) => setPaintPitch(Number(e.target.value))}
						/>
						<em>{paintPitch > 0 ? `+${paintPitch}` : paintPitch}</em>
					</label>
				</header>

				<div className="stamp-tools">
					<button
						type="button"
						className="btn"
						disabled={locked || !selected}
						onClick={() => stampEvery(4)}
					>
						Stamp every beat
					</button>
					<button
						type="button"
						className="btn"
						disabled={locked || !selected}
						onClick={() => stampEvery(2)}
					>
						Stamp 8ths
					</button>
					<button
						type="button"
						className="btn"
						disabled={locked || !selected}
						onClick={() => stampEvery(1)}
					>
						Fill all
					</button>
					<button
						type="button"
						className="btn"
						disabled={locked || !selected || project.bars < 2}
						onClick={copyBarAcross}
					>
						Copy bar 1 → all
					</button>
					<button
						type="button"
						className="btn ghost"
						disabled={locked || !selected}
						onClick={clearSelectedFromTimeline}
					>
						Clear this sound
					</button>
				</div>

				<div className="timeline" style={{ ["--cols" as string]: steps }}>
					<div className="timeline-ruler">
						{Array.from({ length: steps }, (_, s) => (
							<span
								key={s}
								className={`${s % 4 === 0 ? "beat" : ""} ${playing && playhead === s ? "now" : ""}`}
							>
								{s % 4 === 0 ? s / 4 + 1 : ""}
							</span>
						))}
					</div>

					{VOICE_ROLES.map((role) => {
						const roleClips = clipsByRole(role);
						const must = challenge.mustRoles.includes(role);
						return (
							<div
								key={role}
								className={`timeline-row ${must ? "must" : ""} ${roleClips.length ? "live" : ""}`}
							>
								<div className="row-label" style={{ color: ROLE_COLOR[role] }}>
									{role}
								</div>
								<div className="row-steps">
									{Array.from({ length: steps }, (_, s) => {
										const here = project.placements.filter((p) => {
											const clip = project.clips.find((c) => c.id === p.clipId);
											return p.step === s && clip?.role === role;
										});
										const selectedHere = selected
											? here.find((p) => p.clipId === selected.id)
											: null;
										const other = here.filter((p) => p.clipId !== selected?.id);
										const beat = s % 4 === 0;
										const now = playing && playhead === s;
										return (
											<button
												key={s}
												type="button"
												className={`tstep ${beat ? "beat" : ""} ${now ? "now" : ""} ${selectedHere ? "mine" : ""} ${other.length ? "other" : ""}`}
												style={
													selectedHere
														? { background: ROLE_COLOR[role] }
														: other[0]
															? {
																	background: ROLE_COLOR[role],
																	opacity: 0.45,
																}
															: undefined
												}
												disabled={locked || !selected || selected.role !== role}
												title={
													!selected
														? "Select a kit sound"
														: selected.role !== role
															? `Select a ${role} sound to edit this row`
															: selectedHere
																? "Remove this copy"
																: "Stamp a copy here"
												}
												onClick={() => {
													if (selected?.role === role) stampStep(s);
												}}
											/>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</section>

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
