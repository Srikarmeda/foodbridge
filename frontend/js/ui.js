// frontend/js/ui.js: DOM helper, icons, toasts, skeletons, states, formatters, listing card.
document.documentElement.classList.add("js");

/** h("div", {class:"x", onclick: fn}, "text", childNode): children are TEXT, so it is XSS-safe.
 *  The `html` attribute is for trusted static strings only (never user data). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- icons (Feather-style paths) ----------
const NS = "http://www.w3.org/2000/svg";
const ICONS = {
  clock: ["M12 2a10 10 0 100 20 10 10 0 000-20z", "M12 6v6l4 2"],
  pin: ["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z", "M12 13a3 3 0 100-6 3 3 0 000 6z"],
  check: ["M20 6L9 17l-5-5"],
  x: ["M18 6L6 18M6 6l12 12"],
  alert: ["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", "M12 9v4", "M12 17h.01"],
  info: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 16v-4", "M12 8h.01"],
  menu: ["M3 12h18", "M3 6h18", "M3 18h18"],
  plus: ["M12 5v14M5 12h14"],
  user: ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 11a4 4 0 100-8 4 4 0 000 8z"],
  logout: ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  leaf: ["M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"],
  package: ["M16.5 9.4l-9-5.19", "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z", "M3.27 6.96L12 12.01l8.73-5.05", "M12 22.08V12"],
  search: ["M21 21l-4.35-4.35", "M11 19a8 8 0 100-16 8 8 0 000 16z"],
  refresh: ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"],
  image: ["M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z", "M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", "M21 15l-5-5L5 21"],
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"],
  heart: ["M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"],
  chart: ["M18 20V10", "M12 20V4", "M6 20v-6"],
};

export function icon(name, size = 20) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of ICONS[name] || ICONS.info) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

// ---------- toasts ----------
let region = null;
export function toast(message, { type = "info", duration = 4500 } = {}) {
  if (!region) {
    region = h("div", { class: "toast-region", role: "region", "aria-label": "Notifications", "aria-live": "polite" });
    document.body.append(region);
  }
  const el = h("div", { class: `toast toast--${type}`, role: type === "error" ? "alert" : "status" },
    icon(type === "success" ? "check" : type === "error" ? "alert" : "info", 20),
    h("p", { class: "toast__msg" }, message),
    h("button", { class: "toast__close", type: "button", "aria-label": "Dismiss", onclick: () => dismiss() }, icon("x", 16)));
  function dismiss() {
    if (!el.isConnected) return;
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }
  region.append(el);
  if (duration) setTimeout(dismiss, duration);
  return dismiss;
}
toast.success = (m, o) => toast(m, { ...o, type: "success" });
toast.error = (m, o) => toast(m, { ...o, type: "error", duration: 7000 });
toast.info = (m, o) => toast(m, { ...o, type: "info" });

// ---------- button loading state ----------
export async function withLoading(btn, fn) {
  btn.classList.add("is-loading");
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;
  try { return await fn(); }
  finally { btn.classList.remove("is-loading"); btn.removeAttribute("aria-busy"); btn.disabled = false; }
}

// ---------- skeletons, empty and error states ----------
export function skeletonCard() {
  return h("div", { class: "card", "aria-hidden": "true" },
    h("div", { class: "skeleton sk-media" }),
    h("div", { class: "listing-card__body" },
      h("div", { class: "skeleton sk-pill" }),
      h("div", { class: "skeleton sk-title" }),
      h("div", { class: "skeleton sk-line", style: "width:90%" }),
      h("div", { class: "skeleton sk-line", style: "width:60%" })));
}
export function skeletonGrid(n = 6) {
  const grid = h("div", { class: "grid grid-cards", "aria-busy": "true", "aria-label": "Loading" });
  for (let i = 0; i < n; i++) grid.append(skeletonCard());
  return grid;
}
export function emptyState({ icon: ic = "inbox", title, text, action }) {
  const btn = action && (action.href
    ? h("a", { class: "btn btn-primary", href: action.href }, action.label)
    : h("button", { class: "btn btn-primary", type: "button", onclick: action.onClick }, action.label));
  return h("div", { class: "state" },
    h("div", { class: "state__icon" }, icon(ic, 30)), h("h3", {}, title), text && h("p", {}, text), btn);
}
export function errorState({ title = "Something went wrong", message, onRetry }) {
  return h("div", { class: "state state--error", role: "alert" },
    h("div", { class: "state__icon" }, icon("alert", 30)), h("h3", {}, title),
    h("p", {}, message || "Please try again in a moment."),
    onRetry && h("button", { class: "btn btn-secondary", type: "button", onclick: onRetry }, icon("refresh", 18), "Try again"));
}

// ---------- formatters ----------
export const STATUS_LABEL = { AVAILABLE: "Available", CLAIMED: "Claimed", PICKED_UP: "Picked up", COMPLETED: "Completed", EXPIRED: "Expired", CANCELLED: "Cancelled" };
export function statusBadge(status) {
  return h("span", { class: `badge badge--${String(status).toLowerCase().replace(/_/g, "")}` }, STATUS_LABEL[status] || status);
}
export function dietBadge(d) {
  const map = { veg: ["Veg", "veg"], "non-veg": ["Non-veg", "nonveg"], vegan: ["Vegan", "vegan"] };
  const [label, cls] = map[d] || [d, "veg"];
  return h("span", { class: `diet diet--${cls}` }, h("span", { class: "diet__mark", "aria-hidden": "true" }), label);
}
export function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  if (!(ms > 0)) return { text: "Expired", urgent: false, expired: true };
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  const text = d > 0 ? `${d}d ${hh}h left` : hh > 0 ? `${hh}h ${mm}m left` : `${mm}m left`;
  return { text, urgent: ms < 3600000, expired: false };
}
export const fmtDateTime = (iso) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const fmtTime = (iso) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const fmtNumber = (n) => new Intl.NumberFormat().format(Math.round(n));

// ---------- listing card (reused by browse, dashboards, my claims) ----------
const metaItem = (name, text) => h("li", {}, icon(name, 16), h("span", {}, text));
export function listingCard(l, { href = null, footer = null } = {}) {
  const left = timeLeft(l.expiresAt);
  const urgent = l.status === "AVAILABLE" && left.urgent;
  const media = h("div", { class: "listing-card__media" });
  if (l.photoUrl) {
    const img = h("img", { src: l.photoUrl, alt: "", loading: "lazy" });
    img.addEventListener("error", () => img.replaceWith(icon("image", 40)));
    media.append(img);
  } else {
    media.append(icon("image", 40));
  }
  return h("article", { class: "card listing-card" },
    media,
    h("div", { class: "listing-card__body" },
      h("div", { class: "listing-card__top" }, dietBadge(l.dietary),
        urgent ? h("span", { class: "badge badge--urgent" }, left.text) : statusBadge(l.status)),
      h("h3", { class: "listing-card__title" }, href ? h("a", { href }, l.title) : l.title),
      h("ul", { class: "meta" },
        metaItem("package", `${l.servings} servings, ${l.quantityKg} kg`),
        metaItem("pin", l.distanceKm != null ? `${l.address} (${l.distanceKm} km)` : l.address),
        metaItem("clock", left.expired ? "Expired" : left.text)),
      h("p", { class: "listing-card__donor" }, `by ${l.donorName}`),
      footer));
}

// ---------- confirm dialog (native <dialog>: focus trap and Esc come free) ----------
export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "dialog", "aria-labelledby": "dlg-title" },
      h("div", { class: "dialog__body" },
        h("h2", { id: "dlg-title", style: "font-size:var(--text-xl);margin:0 0 .5rem" }, title),
        h("p", { class: "text-muted", style: "margin:0" }, message)),
      h("form", { method: "dialog", class: "dialog__actions" },
        h("button", { class: "btn btn-secondary", value: "cancel" }, cancelLabel),
        h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, value: "ok", autofocus: true }, confirmLabel)));
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "ok"); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// ---------- scroll reveal ----------
export function revealOnScroll(root = document) {
  const items = root.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { items.forEach((i) => i.classList.add("is-visible")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  items.forEach((i) => io.observe(i));
}