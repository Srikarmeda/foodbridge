// frontend/js/api.js: API client with auth header, error mapping and photo upload.
import { CONFIG } from "./config.js";
import { getIdToken, logout } from "./auth.js";

export class ApiError extends Error {
  constructor(status, message) { super(message); this.name = "ApiError"; this.status = status; }
}

async function request(method, path, { query, body, auth = true } = {}) {
  const url = new URL(CONFIG.apiBaseUrl + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getIdToken();
    if (!token) { logout(true); throw new ApiError(401, "Please log in again."); }
    headers.Authorization = "Bearer " + token;
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Network error. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) { logout(true); throw new ApiError(401, "Your session expired. Please log in again."); }
  if (!res.ok) throw new ApiError(res.status, data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path, opts) => request("GET", path, opts),
  post: (path, body, opts) => request("POST", path, { ...opts, body }),
  del: (path, opts) => request("DELETE", path, opts),
};

/** First-login bootstrap: creates or updates the profile row (and the Cognito group). */
export const bootstrapProfile = (extra = {}) => api.post("/profile", extra);

export async function getProfile() {
  try {
    return (await api.get("/profile")).profile;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/** Presigned POST upload. Returns { key, publicUrl } to send with the listing. */
export async function uploadPhoto(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new ApiError(400, "Photo must be a JPEG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new ApiError(400, "Photo must be smaller than 5 MB.");
  const { upload, key, publicUrl } = await api.post("/uploads/presign", { contentType: file.type });
  const form = new FormData();
  Object.entries(upload.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", file); // the file field must come last
  let res;
  try {
    res = await fetch(upload.url, { method: "POST", body: form });
  } catch {
    throw new ApiError(0, "Upload failed. Check your connection.");
  }
  if (!res.ok) throw new ApiError(res.status, "The photo upload was rejected. Try a smaller image.");
  return { key, publicUrl };
}