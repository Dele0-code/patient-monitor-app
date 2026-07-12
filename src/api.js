const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function parseApiResponse(response) {
  const text = await response.text();
  const content = text ? text : null;
  if (!response.ok) {
    let message = response.statusText;
    if (content) {
      try {
        const payload = JSON.parse(content);
        message = payload.detail || payload.message || JSON.stringify(payload);
      } catch {
        message = content;
      }
    }
    throw new Error(`${response.status} ${message}`);
  }
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export async function searchPatients(query = "") {
  const url = `${API_BASE}/api/patients/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  return parseApiResponse(response);
}

export async function getPatientLatest(patientId) {
  const response = await fetch(`${API_BASE}/api/patients/${encodeURIComponent(patientId)}/latest`);
  return parseApiResponse(response);
}

export async function getWardTriage() {
  const response = await fetch(`${API_BASE}/api/ward/triage`);
  return parseApiResponse(response);
}
