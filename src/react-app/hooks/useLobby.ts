import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ClientMessage,
	LobbyState,
	ServerMessage,
} from "../../shared/types";

type Status = "idle" | "connecting" | "connected" | "error";

export function useLobby(code: string | null, playerName: string | null) {
	const [status, setStatus] = useState<Status>(code && playerName ? "connecting" : "idle");
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<LobbyState | null>(null);
	const [you, setYou] = useState<string | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	const send = useCallback((msg: ClientMessage) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}, []);

	useEffect(() => {
		if (!code || !playerName) {
			return;
		}

		const proto = location.protocol === "https:" ? "wss" : "ws";
		const ws = new WebSocket(`${proto}://${location.host}/ws/${code}`);
		wsRef.current = ws;

		ws.onopen = () => {
			setStatus("connected");
			setError(null);
			ws.send(
				JSON.stringify({ type: "join", name: playerName } satisfies ClientMessage),
			);
		};

		ws.onmessage = (ev) => {
			const msg = JSON.parse(ev.data as string) as ServerMessage;
			if (msg.type === "state") {
				setState(msg.state);
				setYou(msg.you);
			} else if (msg.type === "error") {
				setError(msg.message);
			}
		};

		ws.onerror = () => {
			setStatus("error");
			setError("Connection failed");
		};

		ws.onclose = () => {
			setStatus("idle");
		};

		const ping = window.setInterval(() => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
			}
		}, 20000);

		return () => {
			clearInterval(ping);
			ws.close();
			wsRef.current = null;
		};
	}, [code, playerName]);

	return { status, error, state, you, send };
}
