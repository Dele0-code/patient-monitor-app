import { getApiBase } from "./apiConfig.js";

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

function apiUrl(path) {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

export async function searchPatients(query = "") {
  const url = `${apiUrl("/api/patients/search")}?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  return parseApiResponse(response);
}

export async function getPatientLatest(patientId) {
  const response = await fetch(apiUrl(`/api/patients/${encodeURIComponent(patientId)}/latest`));
  return parseApiResponse(response);
}

export async function getWardTriage() {
  const response = await fetch(apiUrl("/api/ward/triage"));
  return parseApiResponse(response);
}
