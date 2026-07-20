import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "../apiConfig.js";

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 10000];
const LIVE_TIMEOUT_MS = 5000;

export function usePatientWebSocket(patientId) {
  const [liveEvent, setLiveEvent] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const backoffIndexRef = useRef(0);
  const lastMessageAtRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!patientId) return undefined;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      clearReconnectTimer();
      const delay = BACKOFF_STEPS_MS[Math.min(backoffIndexRef.current, BACKOFF_STEPS_MS.length - 1)];
      backoffIndexRef.current = Math.min(backoffIndexRef.current + 1, BACKOFF_STEPS_MS.length - 1);
      setConnectionStatus("offline");
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    const connect = () => {
      if (!mountedRef.current) return;
      clearReconnectTimer();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setConnectionStatus("connecting");
      const wsUrl = getWsUrl(patientId);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (!mountedRef.current) return;
        setConnectionStatus("connecting");
      });

      ws.addEventListener("message", (event) => {
        if (!mountedRef.current) return;
        backoffIndexRef.current = 0;
        lastMessageAtRef.current = Date.now();
        try {
          setLiveEvent(JSON.parse(event.data));
        } catch {
          setLiveEvent({ message: event.data });
        }
        setConnectionStatus("live");
      });

      ws.addEventListener("error", () => {
        if (!mountedRef.current) return;
        setConnectionStatus("offline");
      });

      ws.addEventListener("close", () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        scheduleReconnect();
      });
    };

    statusTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const ws = wsRef.current;
      const lastMessageAt = lastMessageAtRef.current;

      if (ws?.readyState === WebSocket.OPEN) {
        if (lastMessageAt && Date.now() - lastMessageAt <= LIVE_TIMEOUT_MS) {
          setConnectionStatus("live");
        } else {
          setConnectionStatus("connecting");
        }
        return;
      }

      if (ws?.readyState === WebSocket.CONNECTING) {
        setConnectionStatus("connecting");
        return;
      }

      if (!reconnectTimerRef.current) {
        setConnectionStatus("offline");
      }
    }, 500);

    connect();

    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      if (statusTimerRef.current) {
        clearInterval(statusTimerRef.current);
        statusTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [patientId]);

  return { liveEvent, connectionStatus };
}
