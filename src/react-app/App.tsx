import { useEffect, useState } from "react";
import {
	EMPTY_PROJECT,
	GENRES,
	missingMustUse,
	normalizeProject,
	type Genre,
	type Heat,
	type Project,
} from "../shared/types";
import { Daw } from "./components/Daw";
import { CookCard } from "./components/CookCard";
import { TagRecorder } from "./components/TagRecorder";
import { DawEngine } from "./audio/engine";
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
		screen === "room" ? name.trim() || "Producer" : null,
	);

	const createLobby = async () => {
		setBusy(true);
		setHomeError(null);
		try {
			localStorage.setItem("bb-name", name.trim() || "Producer");
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
		localStorage.setItem("bb-name", name.trim() || "Producer");
		setCode(c);
		setScreen("room");
	};

	if (screen === "home") {
		return (
			<div className="shell home">
				<div className="atmosphere" aria-hidden />
				<header className="brand-block">
					<p className="eyebrow">popped.dev · web beat battle</p>
					<h1 className="brand">Beat Ranked</h1>
					<p className="tagline">
						Same pack. Same clock. Browser DAW. Vote the cook.
					</p>
				</header>

				<section className="home-panel">
					<label>
						Producer name
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="your tag"
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
						<li>FL-style rack: patterns, playlist, graph editor, mixer inserts</li>
						<li>Cook card must-use sounds + starter grooves</li>
						<li>Record a producer tag · vote blind</li>
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
					<span className="brand-mini">Beat Ranked</span>
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
			{state.phase === "cookup" && state.pack && (
				<CookupView
					key={state.pack.seed}
					state={state}
					you={you}
					send={send}
				/>
			)}
			{state.phase === "voting" && state.pack && (
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
				<h2>Producers</h2>
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
					Share code <strong>{state.code}</strong> — higher heat = weirder
					seeded sounds.
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
	const pack = state.pack!;
	const me = state.players.find((p) => p.id === you);
	const [project, setProject] = useState<Project>(() => EMPTY_PROJECT(pack));
	const [submitError, setSubmitError] = useState<string | null>(null);
	const seconds = useCountdown(state.phaseEndsAt, state.serverNow);
	const missing = missingMustUse(pack, project);

	const submit = () => {
		if (me?.submitted) return;
		if (missing.length > 0) {
			setSubmitError(`Use required elements first: ${missing.join(", ")}`);
			return;
		}
		if (!project.tagAudio) {
			setSubmitError("Record a producer tag before submitting — it's half the bit.");
			return;
		}
		setSubmitError(null);
		send({ type: "submit", project: normalizeProject(project) });
	};

	return (
		<main className="cookup">
			<div className="cook-header">
				<div>
					<h2>
						{pack.brief.title} · {pack.genre}
					</h2>
					<p>
						Heat {pack.heat} · starter groove loaded · tag plays first
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
					{me?.submitted ? "Submitted" : "Submit beat"}
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
			<div className="cook-layout">
				<div className="cook-side">
					<CookCard pack={pack} project={project} />
					<TagRecorder
						tagAudio={project.tagAudio}
						tagMime={project.tagMime}
						locked={!!me?.submitted}
						onChange={(tag) => setProject({ ...project, ...tag })}
					/>
				</div>
				<Daw
					pack={pack}
					project={project}
					onChange={setProject}
					locked={!!me?.submitted}
				/>
			</div>
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
	const pack = state.pack!;
	const seconds = useCountdown(state.phaseEndsAt, state.serverNow);
	const [listening, setListening] = useState<string | null>(null);
	const [engine, setEngine] = useState<DawEngine | null>(null);

	useEffect(() => {
		return () => {
			engine?.dispose();
		};
	}, [engine]);

	const playSub = async (id: string, project: Project) => {
		engine?.dispose();
		const e = new DawEngine(project);
		await e.loadPack(pack);
		await e.setProject(project);
		await e.play();
		setEngine(e);
		setListening(id);
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
					<p>No self-votes. Pick the strongest cook.</p>
				</div>
				<div className="timer">
					{seconds != null ? formatTime(seconds) : "--:--"}
				</div>
			</div>
			{state.submissions.length === 0 ? (
				<p className="hint">No submissions this round — wait for results.</p>
			) : (
				<ul className="vote-list">
					{state.submissions.map((s) => {
						const isMine = s.id === you;
						return (
							<li key={s.id} className={state.myVote === s.id ? "voted" : ""}>
								<div>
									<strong>{s.label}</strong>
									{isMine && <em> (yours — can't vote)</em>}
									{s.project.tagAudio ? (
										<span className="tag-badge"> has tag</span>
									) : null}
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
										{listening === s.id ? "Stop" : "Play"}
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
						<span>{s.votes} vote{s.votes === 1 ? "" : "s"}</span>
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
