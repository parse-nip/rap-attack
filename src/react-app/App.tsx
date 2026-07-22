import { useEffect, useState } from "react";
import {
	EMPTY_PROJECT,
	GENRES,
	missingVoiceRoles,
	normalizeProject,
	type Genre,
	type Heat,
	type Project,
} from "../shared/types";
import { AcapellaStudio } from "./components/AcapellaStudio";
import { AcapellaEngine } from "./audio/engine";
import { useLobby } from "./hooks/useLobby";

function useCountdown(endsAt: number | null, serverNow: number) {
	const [remaining, setRemaining] = useState<number | null>(
		endsAt == null ? null : Math.max(0, Math.ceil((endsAt - serverNow) / 1000)),
	);

	useEffect(() => {
		if (endsAt == null) {
			setRemaining(null);
			return;
		}
		const tick = () => {
			setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
		};
		tick();
		const id = window.setInterval(tick, 250);
		return () => clearInterval(id);
	}, [endsAt, serverNow]);

	return remaining;
}

function formatTime(s: number) {
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function App() {
	const [screen, setScreen] = useState<"home" | "room">("home");
	const [name, setName] = useState(() => localStorage.getItem("bb-name") ?? "");
	const [codeInput, setCodeInput] = useState("");
	const [code, setCode] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [homeError, setHomeError] = useState<string | null>(null);

	const { status, error, state, you, send } = useLobby(
		screen === "room" ? code : null,
		screen === "room" ? name.trim() || "Voice" : null,
	);

	const createLobby = async () => {
		setBusy(true);
		setHomeError(null);
		try {
			localStorage.setItem("bb-name", name.trim() || "Voice");
			const res = await fetch("/api/lobbies", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			});
			const data = (await res.json()) as { code: string };
			setCode(data.code);
			setScreen("room");
		} catch {
			setHomeError("Could not create lobby");
		} finally {
			setBusy(false);
		}
	};

	const joinLobby = async () => {
		const c = codeInput.trim().toUpperCase();
		if (c.length < 4) {
			setHomeError("Enter a valid lobby code");
			return;
		}
		localStorage.setItem("bb-name", name.trim() || "Voice");
		setCode(c);
		setScreen("room");
	};

	if (screen === "home") {
		return (
			<div className="shell home">
				<div className="atmosphere" aria-hidden />
				<header className="brand-block">
					<p className="eyebrow">popped.dev · a cappella remake battle</p>
					<h1 className="brand">Mouth Ranked</h1>
					<p className="tagline">
						Hear the song clip. Record one mouth sound. Stamp copies on the timeline. Vote.
					</p>
				</header>

				<section className="home-panel">
					<label>
						Your name
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="stage name"
							maxLength={18}
						/>
					</label>
					<div className="home-actions">
						<button
							type="button"
							className="btn primary"
							disabled={busy}
							onClick={() => void createLobby()}
						>
							Create lobby
						</button>
						<div className="join-row">
							<input
								value={codeInput}
								onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
								placeholder="CODE"
								maxLength={5}
							/>
							<button type="button" className="btn" onClick={() => void joinLobby()}>
								Join
							</button>
						</div>
					</div>
					{homeError && <p className="error">{homeError}</p>}
					<ul className="rules">
						<li>Same challenge song clip for everyone</li>
						<li>Record one mouth sound, then copy it across the timeline</li>
						<li>Stamp drums / bass / melody — submit and vote blind</li>
					</ul>
				</section>
			</div>
		);
	}

	if (!state) {
		return (
			<div className="shell loading">
				<div className="atmosphere" aria-hidden />
				<p className="pulse">
					{status === "connecting" ? "Linking lobby…" : "Waiting for state…"}
				</p>
				{error && <p className="error">{error}</p>}
				<button
					type="button"
					className="btn ghost"
					onClick={() => {
						setScreen("home");
						setCode(null);
					}}
				>
					Back
				</button>
			</div>
		);
	}

	const me = state.players.find((p) => p.id === you);
	const isHost = !!me?.isHost;

	return (
		<div className={`shell room phase-${state.phase}`}>
			<div className="atmosphere" aria-hidden />
			<header className="topbar">
				<div>
					<span className="brand-mini">Mouth Ranked</span>
					<span className="code">Lobby {state.code}</span>
				</div>
				<div className="meta">
					<span>Round {state.round || "—"}</span>
					<span className="phase-pill">{state.phase}</span>
					{me && <span>{me.name}</span>}
				</div>
			</header>
			{error && <p className="error banner">{error}</p>}

			{state.phase === "lobby" && (
				<LobbyView
					state={state}
					you={you}
					isHost={isHost}
					ready={!!me?.ready}
					send={send}
					onLeave={() => {
						setScreen("home");
						setCode(null);
					}}
				/>
			)}
			{state.phase === "cookup" && state.challenge && (
				<CookupView
					key={state.challenge.seed}
					state={state}
					you={you}
					send={send}
				/>
			)}
			{state.phase === "voting" && state.challenge && (
				<VotingView state={state} you={you} send={send} />
			)}
			{state.phase === "results" && (
				<ResultsView state={state} isHost={isHost} send={send} />
			)}
		</div>
	);
}

function LobbyView({
	state,
	you,
	isHost,
	ready,
	send,
	onLeave,
}: {
	state: NonNullable<ReturnType<typeof useLobby>["state"]>;
	you: string | null;
	isHost: boolean;
	ready: boolean;
	send: ReturnType<typeof useLobby>["send"];
	onLeave: () => void;
}) {
	return (
		<main className="lobby">
			<section className="players">
				<h2>Voices</h2>
				<ul>
					{state.players.map((p) => (
						<li key={p.id} className={p.id === you ? "you" : ""}>
							<span>
								{p.name}
								{p.isHost ? " · host" : ""}
								{!p.connected ? " · offline" : ""}
							</span>
							<span className={`rdy ${p.ready ? "on" : ""}`}>
								{p.ready ? "ready" : "idle"}
							</span>
							<span className="wins">{p.wins}W</span>
						</li>
					))}
				</ul>
			</section>

			<section className="settings">
				<h2>Heat & clock</h2>
				<label>
					Cook time (sec)
					<input
						type="number"
						min={60}
						max={900}
						value={state.settings.roundSeconds}
						disabled={!isHost}
						onChange={(e) =>
							send({
								type: "update_settings",
								settings: { roundSeconds: Number(e.target.value) },
							})
						}
					/>
				</label>
				<label>
					Vote time (sec)
					<input
						type="number"
						min={20}
						max={300}
						value={state.settings.voteSeconds}
						disabled={!isHost}
						onChange={(e) =>
							send({
								type: "update_settings",
								settings: { voteSeconds: Number(e.target.value) },
							})
						}
					/>
				</label>
				<label>
					Heat
					<input
						type="range"
						min={1}
						max={5}
						value={state.settings.heat}
						disabled={!isHost}
						onChange={(e) =>
							send({
								type: "update_settings",
								settings: { heat: Number(e.target.value) as Heat },
							})
						}
					/>
					<span className="heat-val">{state.settings.heat}</span>
				</label>
				<label>
					Genre
					<select
						value={state.settings.genreMode}
						disabled={!isHost}
						onChange={(e) =>
							send({
								type: "update_settings",
								settings: {
									genreMode: e.target.value as "random" | Genre,
								},
							})
						}
					>
						<option value="random">Random</option>
						{GENRES.map((g) => (
							<option key={g} value={g}>
								{g}
							</option>
						))}
					</select>
				</label>

				<div className="lobby-actions">
					<button
						type="button"
						className={`btn ${ready ? "active" : "primary"}`}
						onClick={() => send({ type: "set_ready", ready: !ready })}
					>
						{ready ? "Unready" : "Ready up"}
					</button>
					{isHost && (
						<button
							type="button"
							className="btn primary"
							onClick={() => send({ type: "start_round" })}
						>
							Start round
						</button>
					)}
					<button type="button" className="btn ghost" onClick={onLeave}>
						Leave
					</button>
				</div>
				<p className="hint">
					Share code <strong>{state.code}</strong> — higher heat means more
					required voice layers.
				</p>
			</section>
		</main>
	);
}

function CookupView({
	state,
	you,
	send,
}: {
	state: NonNullable<ReturnType<typeof useLobby>["state"]>;
	you: string | null;
	send: ReturnType<typeof useLobby>["send"];
}) {
	const challenge = state.challenge!;
	const me = state.players.find((p) => p.id === you);
	const [project, setProject] = useState<Project>(() => EMPTY_PROJECT(challenge));
	const [submitError, setSubmitError] = useState<string | null>(null);
	const seconds = useCountdown(state.phaseEndsAt, state.serverNow);
	const missing = missingVoiceRoles(challenge, project);

	const submit = () => {
		if (me?.submitted) return;
		if (missing.length > 0) {
			setSubmitError(`Still need voice for: ${missing.join(", ")}`);
			return;
		}
		setSubmitError(null);
		send({ type: "submit", project: normalizeProject(project) });
	};

	return (
		<main className="cookup">
			<div className="cook-header">
				<div>
					<h2>Remake the clip</h2>
					<p>
						Heat {challenge.heat} · one-shots you stamp · no sample packs
					</p>
				</div>
				<div className={`timer ${seconds != null && seconds < 30 ? "urgent" : ""}`}>
					{seconds != null ? formatTime(seconds) : "--:--"}
				</div>
				<button
					type="button"
					className="btn primary"
					disabled={!!me?.submitted}
					onClick={submit}
				>
					{me?.submitted ? "Submitted" : "Submit remake"}
				</button>
			</div>
			{submitError && <p className="error banner">{submitError}</p>}
			<div className="submit-status">
				{state.players
					.filter((p) => p.connected)
					.map((p) => (
						<span key={p.id} className={p.submitted ? "done" : ""}>
							{p.name}
						</span>
					))}
			</div>
			<AcapellaStudio
				challenge={challenge}
				project={project}
				onChange={setProject}
				locked={!!me?.submitted}
			/>
		</main>
	);
}

function VotingView({
	state,
	you,
	send,
}: {
	state: NonNullable<ReturnType<typeof useLobby>["state"]>;
	you: string | null;
	send: ReturnType<typeof useLobby>["send"];
}) {
	const challenge = state.challenge!;
	const seconds = useCountdown(state.phaseEndsAt, state.serverNow);
	const [listening, setListening] = useState<string | null>(null);
	const [engine, setEngine] = useState<AcapellaEngine | null>(null);

	useEffect(() => {
		return () => {
			engine?.dispose();
		};
	}, [engine]);

	const playSub = async (id: string, project: Project) => {
		engine?.dispose();
		const e = new AcapellaEngine(project);
		await e.setChallenge(challenge);
		await e.setProject(project);
		await e.playRemake();
		setEngine(e);
		setListening(id);
	};

	const playRef = async () => {
		engine?.dispose();
		const e = new AcapellaEngine(EMPTY_PROJECT(challenge));
		await e.setChallenge(challenge);
		await e.playReference();
		setEngine(e);
		setListening("ref");
	};

	const stop = () => {
		engine?.stop();
		setListening(null);
	};

	return (
		<main className="voting">
			<div className="cook-header">
				<div>
					<h2>Vote blind</h2>
					<p>
						{challenge.title} · whose mouth remake hits hardest?
					</p>
				</div>
				<div className="timer">
					{seconds != null ? formatTime(seconds) : "--:--"}
				</div>
			</div>
			<div className="vote-ref">
				<button
					type="button"
					className="btn"
					onClick={() =>
						listening === "ref" ? stop() : void playRef()
					}
				>
					{listening === "ref" ? "Stop original" : "Replay song clip"}
				</button>
			</div>
			{state.submissions.length === 0 ? (
				<p className="hint">No submissions this round — wait for results.</p>
			) : (
				<ul className="vote-list">
					{state.submissions.map((s) => {
						const isMine = s.id === you;
						const kit = s.project.clips?.length ?? 0;
						const stamps = s.project.placements?.length ?? 0;
						return (
							<li key={s.id} className={state.myVote === s.id ? "voted" : ""}>
								<div>
									<strong>{s.label}</strong>
									{isMine && <em> (yours — can't vote)</em>}
									<span className="tag-badge">
										{" "}
										{kit} sound{kit === 1 ? "" : "s"} · {stamps} stamps
									</span>
								</div>
								<div className="vote-actions">
									<button
										type="button"
										className="btn"
										onClick={() =>
											listening === s.id
												? stop()
												: void playSub(s.id, s.project)
										}
									>
										{listening === s.id ? "Stop" : "Play remake"}
									</button>
									<button
										type="button"
										className={`btn primary ${state.myVote === s.id ? "active" : ""}`}
										disabled={isMine}
										onClick={() => send({ type: "vote", submissionId: s.id })}
									>
										{state.myVote === s.id ? "Voted" : "Vote"}
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</main>
	);
}

function ResultsView({
	state,
	isHost,
	send,
}: {
	state: NonNullable<ReturnType<typeof useLobby>["state"]>;
	isHost: boolean;
	send: ReturnType<typeof useLobby>["send"];
}) {
	const winner = state.players.find((p) => p.id === state.winnerId);
	const ranked = [...state.submissions].sort((a, b) => b.votes - a.votes);

	return (
		<main className="results">
			<h2>Round results</h2>
			{winner ? (
				<p className="winner-line">
					Winner: <strong>{winner.name}</strong>
				</p>
			) : (
				<p className="winner-line">No winner this round.</p>
			)}
			<ol>
				{ranked.map((s) => (
					<li key={s.id}>
						<span>{s.label}</span>
						<span>
							{s.votes} vote{s.votes === 1 ? "" : "s"}
						</span>
					</li>
				))}
			</ol>
			<ul className="standings">
				{state.players
					.slice()
					.sort((a, b) => b.wins - a.wins)
					.map((p) => (
						<li key={p.id}>
							{p.name} — {p.wins} win{p.wins === 1 ? "" : "s"}
						</li>
					))}
			</ul>
			{isHost && (
				<button
					type="button"
					className="btn primary"
					onClick={() => send({ type: "next_round" })}
				>
					Back to lobby
				</button>
			)}
		</main>
	);
}
