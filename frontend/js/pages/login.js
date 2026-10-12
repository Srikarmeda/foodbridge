import { login, homeFor, safeNext } from "../auth.js";
import { ensureProfile } from "../profile.js";
import { mountShell } from "../shell.js";
import { setError, clearError, passwordToggle } from "../helpers.js";
import { h, icon, toast, withLoading } from "../ui.js";

const $ = (id) => document.getElementById(id);
const existing = mountShell();
if (existing) location.replace(homeFor(existing.role));

const params = new URLSearchParams(location.search);
if (params.get("confirmed")) toast.success("Email confirmed. Log in to continue.");

const email = $("email"), password = $("password"), alertBox = $("form-alert");
passwordToggle(password, $("toggle-pw"));
[email, password].forEach((i) => i.addEventListener("input", () => { clearError(i); alertBox.hidden = true; }));

function showAlert(err) {
  const link = err.code === "UserNotConfirmedException"
    ? h("a", { href: `signup.html?confirm=${encodeURIComponent(email.value.trim())}` }, "Enter your confirmation code")
    : null;
  alertBox.replaceChildren(icon("alert", 18), h("div", {}, err.message, " ", link));
  alertBox.hidden = false;
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.hidden = true;
  let first = null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { setError(email, "Enter a valid email address."); first = email; }
  if (!password.value) { setError(password, "Enter your password."); first = first || password; }
  if (first) { first.focus(); return; }

  await withLoading($("submit"), async () => {
    try {
      const user = await login(email.value, password.value);
      try { await ensureProfile(); } catch (err) { console.warn("Profile setup deferred:", err); }
      location.replace(safeNext(params.get("next")) || homeFor(user.role));
    } catch (err) {
      showAlert(err);
    }
  });
});