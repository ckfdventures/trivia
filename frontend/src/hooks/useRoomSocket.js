import { useEffect, useRef, useState } from "react";
import { roomWsUrl } from "../lib/api";

export function useRoomSocket({ pin, role, token, enabled = true }) {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!enabled || !pin || !token) return undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(roomWsUrl(pin, { role, token }));
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, 1500);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch (e) {
          /* noop */
        }
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "room_state") {
            setState(msg.data);
          }
          setLastEvent(msg);
        } catch (e) {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          /* noop */
        }
      }
    };
  }, [pin, role, token, enabled]);

  return { connected, state, lastEvent };
}
