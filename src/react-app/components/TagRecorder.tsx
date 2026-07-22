import { useEffect, useRef, useState } from "react";

const MAX_MS = 2500;

type Props = {
	tagAudio?: string;
	tagMime?: string;
	locked?: boolean;
	onChange: (tag: { tagAudio?: string; tagMime?: string }) => void;
};

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

export function TagRecorder({ tagAudio, tagMime, locked, onChange }: Props) {
	const [recording, setRecording] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [level, setLevel] = useState(0);
	const mediaRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const streamRef = useRef<MediaStream | null>(null);
	const timerRef = useRef<number | null>(null);
	const rafRef = useRef<number | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) window.clearTimeout(timerRef.current);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			streamRef.current?.getTracks().forEach((t) => t.stop());
		};
	}, []);

	const stopMeter = () => {
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
		setLevel(0);
	};

	const start = async () => {
		if (locked || recording) return;
		setError(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
				},
			});
			streamRef.current = stream;

			const ctx = new AudioContext();
			const source = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);
			const data = new Uint8Array(analyser.frequencyBinCount);
			const tick = () => {
				analyser.getByteTimeDomainData(data);
				let sum = 0;
				for (let i = 0; i < data.length; i++) {
					const v = (data[i]! - 128) / 128;
					sum += v * v;
				}
				setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
				rafRef.current = requestAnimationFrame(tick);
			};
			tick();

			const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
				? "audio/webm;codecs=opus"
				: MediaRecorder.isTypeSupported("audio/webm")
					? "audio/webm"
					: "";
			const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
			chunksRef.current = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};
			recorder.onstop = async () => {
				stopMeter();
				stream.getTracks().forEach((t) => t.stop());
				void ctx.close();
				const blob = new Blob(chunksRef.current, {
					type: recorder.mimeType || "audio/webm",
				});
				if (blob.size < 200) {
					setError("Too quiet — try again louder");
					setRecording(false);
					return;
				}
				const b64 = await blobToBase64(blob);
				onChange({ tagAudio: b64, tagMime: blob.type });
				setRecording(false);
			};
			mediaRef.current = recorder;
			recorder.start();
			setRecording(true);
			timerRef.current = window.setTimeout(() => {
				if (recorder.state === "recording") recorder.stop();
			}, MAX_MS);
		} catch {
			setError("Mic blocked — allow microphone access");
			stopMeter();
		}
	};

	const stop = () => {
		if (timerRef.current) window.clearTimeout(timerRef.current);
		if (mediaRef.current?.state === "recording") mediaRef.current.stop();
	};

	const clear = () => {
		onChange({ tagAudio: undefined, tagMime: undefined });
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.src = "";
		}
	};

	const preview = () => {
		if (!tagAudio) return;
		const mime = tagMime || "audio/webm";
		const url = `data:${mime};base64,${tagAudio}`;
		if (!audioRef.current) audioRef.current = new Audio();
		audioRef.current.src = url;
		void audioRef.current.play();
	};

	return (
		<div className={`tag-recorder ${tagAudio ? "has-tag" : ""}`}>
			<div className="tag-head">
				<strong>Producer tag</strong>
				<span>plays at the start · max 2.5s</span>
			</div>
			<div className="tag-meter" aria-hidden>
				<div style={{ width: `${Math.round(level * 100)}%` }} />
			</div>
			<div className="tag-actions">
				{!recording ? (
					<button
						type="button"
						className="btn primary"
						disabled={locked}
						onClick={() => void start()}
					>
						{tagAudio ? "Re-record tag" : "Hold mic — record tag"}
					</button>
				) : (
					<button type="button" className="btn play active" onClick={stop}>
						Stop ({(MAX_MS / 1000).toFixed(1)}s max)
					</button>
				)}
				{tagAudio && (
					<>
						<button type="button" className="btn" onClick={preview} disabled={locked && false}>
							Preview tag
						</button>
						<button type="button" className="btn ghost" disabled={locked} onClick={clear}>
							Clear
						</button>
					</>
				)}
			</div>
			{tagAudio ? (
				<p className="tag-ok">Tag locked in — voters hear it first.</p>
			) : (
				<p className="tag-hint">Say your name weird. “Yo it’s ___.” Go.</p>
			)}
			{error && <p className="error">{error}</p>}
		</div>
	);
}
