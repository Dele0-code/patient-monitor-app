/** Resolve backend URL for API + WebSocket (works on Pi kiosk and LAN browsers). */

function stripTrailingSlash(url) {
  return url.replace(/\/$/, "");
}

export function getApiBase() {
  const envBase = import.meta.env.VITE_API_BASE;

  // Dev: Vite proxies /api and /ws to the backend on the same host:port as the page.
  if (import.meta.env.DEV) {
    return "";
  }

  if (envBase) {
    return stripTrailingSlash(envBase);
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
}

export function getWsUrl(patientId) {
  const base = getApiBase();

  if (!base) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/${encodeURIComponent(patientId)}`;
  }

  return `${base.replace(/^http/, "ws")}/ws/${encodeURIComponent(patientId)}`;
}
