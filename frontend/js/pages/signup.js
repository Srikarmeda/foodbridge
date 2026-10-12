import { signUp, confirmSignUp, resendCode, login, homeFor } from "../auth.js";
import { ensureProfile, rememberPending } from "../profile.js";
import { mountShell } from "../shell.js";
import { setError, clearError, passwordToggle } from "../helpers.js";
import { h, icon, toast, withLoading } from "../ui.js";

const $ = (id) => document.getElementById(id);
const existing = mountShell();
if (existing) location.replace(homeFor(existing.role));

const params = new URLSearchParams(location.search);
const alertBox = $("form-alert");
const fields = { name: $("name"), org: $("org"), email: $("email"), password: $("password"), code: $("code") };
let pending = { email: "", password: "" }; // password stays in memory only, for auto-login after confirmation

// Preselect role from ?role=donor|receiver
const roleParam = (params.get("role") || "").toUpperCase();
if (["DONOR", "RECEIVER"].includes(roleParam)) document.querySelector(`input[name="role"][value="${roleParam}"]`).checked = true;
document.querySelectorAll('input[name="role"]').forEach((r) => r.addEventListener("change", () => ($("role-err").hidden = true)));

// Password checklist
const RULES = [
  ["At least 8 characters", (v) => v.length >= 8],
  ["An upper case letter", (v) => /[A-Z]/.test(v)],
  ["A lower case letter", (v) => /[a-z]/.test(v)],
  ["A number", (v) => /\d/.test(v)],
];
function renderRules() {
  $("pw-rules").replaceChildren(...RULES.map(([label, test]) => {
    const ok = test(fields.password.value);
    return h("li", { class: ok ? "ok" : "" }, h("span", { class: "dot", "aria-hidden": "true" }, "\u2713"), h("span", { class: "sr-only" }, ok ? "Met: " : "Not met: "), label);
  }));
}
renderRules();
fields.password.addEventListener("input", renderRules);
passwordToggle(fields.password, $("toggle-pw"));
Object.values(fields).forEach((i) => i.addEventListener("input", () => { clearError(i); alertBox.hidden = true; }));

function showAlert(...children) { alertBox.replaceChildren(icon("alert", 18), h("div", {}, ...children)); alertBox.hidden = false; }

function showStep(n) {
  $("step-1").hidden = n !== 1;
  $("step-2").hidden = n !== 2;
  alertBox.hidden = true;
  (n === 1 ? fields.name : fields.code).focus();
}
function showConfirm(email) {
  $("confirm-email").textContent = email;
  showStep(2);
  startCooldown();
}

let cooldown = null;
function startCooldown(secs = 30) {
  const btn = $("resend");
  clearInterval(cooldown);
  let left = secs;
  btn.disabled = true;
  btn.textContent = `Resend code (${left}s)`;
  cooldown = setInterval(() => {
    left -= 1;
    btn.textContent = left > 0 ? `Resend code (${left}s)` : "Resend code";
    if (left <= 0) { clearInterval(cooldown); btn.disabled = false; }
  }, 1000);
}

// ---- Step 1: create account ----
$("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  alertBox.hidden = true;
  let first = null;
  const role = document.querySelector('input[name="role"]:checked')?.value;
  if (!role) { $("role-err").hidden = false; first = document.querySelector('input[name="role"]'); }
  if (fields.name.value.trim().length < 2) { setError(fields.name, "Enter your name."); first = first || fields.name; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) { setError(fields.email, "Enter a valid email address."); first = first || fields.email; }
  if (!RULES.every(([, test]) => test(fields.password.value))) { setError(fields.password, "Password must meet all the requirements below."); first = first || fields.password; }
  if (first) { first.focus(); return; }

  await withLoading($("submit"), async () => {
    const email = fields.email.value.trim().toLowerCase();
    try {
      await signUp({ email, password: fields.password.value, name: fields.name.value, role });
      rememberPending(email, fields.org.value);
      pending = { email, password: fields.password.value };
      toast.success("Account created. We emailed you a 6-digit code.");
      showConfirm(email);
    } catch (err) {
      if (err.code === "UsernameExistsException") {
        showAlert("An account with this email already exists. ",
          h("a", { href: "login.html" }, "Log in"), " or ",
          h("a", { href: `signup.html?confirm=${encodeURIComponent(email)}` }, "enter a confirmation code"), ".");
      } else if (err.code === "InvalidPasswordException") {
        setError(fields.password, err.message);
        fields.password.focus();
      } else {
        showAlert(err.message);
      }
    }
  });
});

// ---- Step 2: confirm ----
$("confirm-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!/^\d{6}$/.test(fields.code.value.trim())) { setError(fields.code, "Enter the 6-digit code from your email."); fields.code.focus(); return; }
  await withLoading($("confirm-submit"), async () => {
    try {
      await confirmSignUp(pending.email, fields.code.value);
      if (!pending.password) { location.replace("login.html?confirmed=1"); return; }
      const user = await login(pending.email, pending.password);
      try { await ensureProfile(); } catch (err) { console.warn("Profile setup deferred:", err); }
      location.replace(homeFor(user.role));
    } catch (err) {
      if (err.code === "CodeMismatchException" || err.code === "ExpiredCodeException") setError(fields.code, err.message);
      else showAlert(err.message);
    }
  });
});

$("resend").addEventListener("click", async () => {
  try { await resendCode(pending.email); toast.success("A new code is on its way."); startCooldown(); }
  catch (err) { toast.error(err.message); }
});
$("back").addEventListener("click", () => { clearInterval(cooldown); showStep(1); });

// Arriving from the login page (?confirm=email) jumps straight to step 2
const confirmParam = params.get("confirm");
if (confirmParam && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(confirmParam)) {
  pending.email = confirmParam.trim().toLowerCase();
  showConfirm(pending.email);
}