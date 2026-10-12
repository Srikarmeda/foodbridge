// frontend/js/profile.js: make sure the signed-in user has a profile row.
import { getUser } from "./auth.js";
import { getProfile, bootstrapProfile } from "./api.js";

const KEY = "fb.pendingProfile";

/** Remember the organisation name typed at signup until the first login. */
export function rememberPending(email, orgName) {
  try { localStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), orgName: orgName.trim() })); } catch { /* ignore */ }
}

export async function ensureProfile() {
  const user = getUser();
  if (!user) return null;
  const existing = await getProfile();
  if (existing) return existing;
  const extra = {};
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (p && p.email === user.email.toLowerCase() && p.orgName) extra.orgName = p.orgName;
  } catch { /* ignore */ }
  const res = await bootstrapProfile(extra);
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return res.profile;
}