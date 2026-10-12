// frontend/js/auth.js: Cognito sign-up, login, token refresh and route guards (no SDK).
import { CONFIG } from "./config.js";

const ENDPOINT = `https://cognito-idp.${CONFIG.region}.amazonaws.com/`;
const SESSION_KEY = "fb.session";

export class AuthError extends Error {
  constructor(code, message) { super(message); this.name = "AuthError"; this.code = code; }
}

const FRIENDLY = {
  UsernameExistsException: "An account with this email already exists. Try logging in.",
  InvalidPasswordException: "Password needs 8+ characters with upper case, lower case and a number.",
  CodeMismatchException: "That code is not correct. Check the email and try again.",
  ExpiredCodeException: "That code has expired. Request a new one.",
  NotAuthorizedException: "Incorrect email or password.",
  UserNotFoundException: "Incorrect email or password.",
  UserNotConfirmedException: "Please confirm your email first.",
  LimitExceededException: "Too many attempts. Please wait a few minutes and try again.",
  TooManyRequestsException: "Too many requests. Please wait a moment.",
};

async function idp(target, payload) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthError("Network", "Cannot reach the sign-in service. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(data.__type || "").split("#").pop();
    throw new AuthError(code, FRIENDLY[code] || data.message || "Something went wrong. Please try again.");
  }
  return data;
}

// ---------- storage (always guarded: it can be unavailable or full) ----------
function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } }

// ---------- token helpers ----------
export function decodeJwt(token) {
  const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function roleFromClaims(c) {
  const raw = c["cognito:groups"];
  const groups = Array.isArray(raw) ? raw : String(raw || "").replace(/[[\]]/g, "").split(/[\s,]+/).filter(Boolean);
  if (groups.includes("Admin")) return "ADMIN";
  if (groups.includes("Donor")) return "DONOR";
  if (groups.includes("Receiver")) return "RECEIVER";
  const requested = String(c["custom:requestedRole"] || "").toUpperCase();
  return requested === "DONOR" || requested === "RECEIVER" ? requested : null;
}

export function getUser() {
  const s = readSession();
  if (!s || !s.idToken) return null;
  try {
    const c = decodeJwt(s.idToken);
    return { id: c.sub, email: c.email || "", name: c.name || c.email || "Friend", role: roleFromClaims(c) };
  } catch {
    clearSession();
    return null;
  }
}

export const homeFor = (role) => ({ DONOR: "donor.html", RECEIVER: "browse.html", ADMIN: "admin.html" }[role] || "index.html");

/** Only allow a plain local .html file name as a post-login destination. */
export function safeNext(value) {
  return /^[A-Za-z0-9._-]+\.html(\?[A-Za-z0-9._=&%-]*)?(#[A-Za-z0-9_-]*)?$/.test(value || "") ? value : null;
}

// ---------- account actions ----------
export async function signUp({ email, password, name, role }) {
  if (!["DONOR", "RECEIVER"].includes(role)) throw new AuthError("InvalidRole", "Choose Donor or Receiver.");
  const e = email.trim().toLowerCase();
  await idp("SignUp", {
    ClientId: CONFIG.cognito.clientId,
    Username: e,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: e },
      { Name: "name", Value: name.trim() },
      { Name: "custom:requestedRole", Value: role },
    ],
  });
}

export async function confirmSignUp(email, code) {
  await idp("ConfirmSignUp", { ClientId: CONFIG.cognito.clientId, Username: email.trim().toLowerCase(), ConfirmationCode: code.trim() });
}

export async function resendCode(email) {
  await idp("ResendConfirmationCode", { ClientId: CONFIG.cognito.clientId, Username: email.trim().toLowerCase() });
}

export async function login(email, password) {
  const d = await idp("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CONFIG.cognito.clientId,
    AuthParameters: { USERNAME: email.trim().toLowerCase(), PASSWORD: password },
  });
  const r = d.AuthenticationResult;
  if (!r) throw new AuthError("Challenge", "This account needs extra steps. Please contact support.");
  saveSession({ idToken: r.IdToken, accessToken: r.AccessToken, refreshToken: r.RefreshToken, expiresAt: Date.now() + r.ExpiresIn * 1000 });
  return getUser();
}

let refreshing = null;
async function refresh() {
  if (refreshing) return refreshing; // share one refresh between concurrent calls
  refreshing = (async () => {
    const s = readSession();
    if (!s || !s.refreshToken) return false;
    try {
      const d = await idp("InitiateAuth", {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: CONFIG.cognito.clientId,
        AuthParameters: { REFRESH_TOKEN: s.refreshToken },
      });
      const r = d.AuthenticationResult;
      saveSession({ ...s, idToken: r.IdToken, accessToken: r.AccessToken, expiresAt: Date.now() + r.ExpiresIn * 1000 });
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Returns a valid ID token, refreshing silently if it is about to expire. */
export async function getIdToken() {
  const s = readSession();
  if (!s) return null;
  if (Date.now() < s.expiresAt - 60000) return s.idToken;
  return (await refresh()) ? readSession().idToken : null;
}

/** Explicit log out from the nav button. */
export function signOut() {
  clearSession();
  location.replace("index.html");
}

/** Session lost or expired: go to login and come back afterwards. */
export function logout(redirect = true) {
  clearSession();
  if (!redirect) return;
  const here = location.pathname.split("/").pop() || "index.html";
  const isPublic = ["index.html", "login.html", "signup.html", "styleguide.html"].includes(here);
  location.replace(isPublic ? "login.html" : `login.html?next=${encodeURIComponent(here + location.search)}`);
}

/** Page guard. Returns the user, or null after redirecting (callers must stop). */
export function requireAuth(roles = []) {
  const user = getUser();
  if (!user) { logout(true); return null; }
  if (roles.length && !roles.includes(user.role)) { location.replace(homeFor(user.role)); return null; }
  return user;
}