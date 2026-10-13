import { api } from "../api.js";
import { CONFIG } from "../config.js";
import { mountShell } from "../shell.js";
import { computeImpact } from "../impact.js";
import { osmLink } from "../maps.js";
import { hydrateIcons } from "../helpers.js";
import { h, icon, toast, withLoading, skeletonGrid, emptyState, errorState, statusBadge, confirmDialog, fmtDateTime, fmtTime } from "../ui.js";

const user = mountShell({ active: "claims.html", roles: ["RECEIVER"] });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const ACTIVE = ["CLAIMED", "PICKED_UP"];
const fmt = (n, d = 0) => Number(n.toFixed(d)).toLocaleString();
let claims = [], tab = "active", justClaimed = new URLSearchParams(location.search).get("new") === "1", highlightId = null;

function human(min) {
  if (min < 60) return `${min} min`;
  const hh = Math.floor(min / 60);
  if (hh < 24) return min % 60 ? `${hh}h ${min % 60}m` : `${hh}h`;
  return `${Math.floor(hh / 24)}d ${hh % 24}h`;
}
function pickupHint(c) {
  const now = Date.now(), s = new Date(c.pickupStart).getTime(), e = new Date(c.pickupEnd).getTime();
  if (now < s) return { text: `Pickup opens in ${human(Math.ceil((s - now) / 60000))}`, cls: "" };
  if (now <= e) return { text: `Pickup is open now, until ${fmtTime(c.pickupEnd)}`, cls: "hint-ok" };
  return { text: "The pickup window has ended. Contact the donor, or cancel this claim.", cls: "hint-late" };
}

function stepper(status) {
  const at = { CLAIMED: 0, PICKED_UP: 1, COMPLETED: 2 }[status];
  return h("ol", { class: "stepper", "aria-label": "Claim progress" }, ["Claimed", "Picked up", "Completed"].map((label, i) => {
    const done = i < at || status === "COMPLETED";
    const current = i === at && !done;
    return h("li", { class: done ? "done" : current ? "current" : "", "aria-current": current ? "step" : null },
      h("span", { class: "stepper__dot", "aria-hidden": "true" }, done ? "\u2713" : String(i + 1)), label);
  }));
}

const metaItem = (name, ...kids) => h("li", {}, icon(name, 16), h("span", {}, ...kids));

async function markPicked(c, btn) {
  const ok = await confirmDialog({
    title: "Mark as picked up?",
    message: `Confirm you collected "${c.listingTitle}" from ${c.donorName}. The donor will then confirm the handover.`,
    confirmLabel: "Yes, I collected it",
  });
  if (!ok) return;
  await withLoading(btn, async () => {
    try { await api.post(`/claims/${c.claimId}/pickup`); toast.success("Marked as picked up. The donor will confirm the handover."); await load(); }
    catch (e) { toast.error(e.message); }
  });
}
async function cancelClaim(c, btn) {
  const ok = await confirmDialog({
    title: "Cancel this claim?",
    message: "The food goes back to other receivers. Please only cancel if you cannot collect it.",
    confirmLabel: "Yes, cancel claim", cancelLabel: "Keep claim", danger: true,
  });
  if (!ok) return;
  await withLoading(btn, async () => {
    try { await api.post(`/claims/${c.claimId}/cancel`); toast.success("Claim cancelled. The listing is available again."); await load(); }
    catch (e) { toast.error(e.message); }
  });
}

function actionsFor(c) {
  if (c.status === "CLAIMED") {
    return [
      h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: (e) => markPicked(c, e.currentTarget) }, icon("check", 16), "I've picked it up"),
      h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: (e) => cancelClaim(c, e.currentTarget) }, "Cancel claim"),
    ];
  }
  const text = {
    PICKED_UP: "Waiting for the donor to confirm the handover.",
    COMPLETED: `Thank you for rescuing about ${fmt(Number(c.servings) || 0)} meals!`,
    CANCELLED: "You cancelled this claim.",
  }[c.status];
  return [h("span", { class: "text-sm text-muted" }, text)];
}

function claimCard(c) {
  const thumb = h("div", { class: "claim-card__thumb" });
  if (c.photoKey) {
    const img = h("img", { src: `${CONFIG.imagesBucketUrl}/${c.photoKey}`, alt: "", loading: "lazy" });
    img.addEventListener("error", () => img.replaceWith(icon("image", 32)));
    thumb.append(img);
  } else thumb.append(icon("image", 32));

  const hint = c.status === "CLAIMED" ? pickupHint(c) : null;
  return h("article", { class: "card claim-card" + (c.claimId === highlightId ? " is-new" : "") },
    thumb,
    h("div", { class: "claim-card__body" },
      h("div", { class: "claim-card__head",
      }, h("h3", {}, h("a", { href: `listing.html?id=${encodeURIComponent(c.listingId)}` }, c.listingTitle)), statusBadge(c.status)),
      h("p", { class: "text-sm text-muted", style: "margin:0" }, `from ${c.donorName}`),
      h("ul", { class: "meta" },
        metaItem("pin", c.address, " ", h("a", { href: osmLink(c.lat, c.lng), target: "_blank", rel: "noopener noreferrer" }, "Open map")),
        metaItem("clock", `Pickup ${fmtDateTime(c.pickupStart)} to ${fmtTime(c.pickupEnd)}`)),
      c.status === "CANCELLED" ? null : stepper(c.status),
      hint ? h("p", { class: hint.cls, style: "margin:0" }, hint.text) : null),
    h("div", { class: "claim-card__actions" }, actionsFor(c)));
}

function renderStats() {
  const imp = computeImpact(claims);
  const open = claims.filter((c) => ACTIVE.includes(c.status)).length;
  const items = [["Open claims", open], ["Meals rescued", fmt(imp.meals)], ["Food rescued (kg)", fmt(imp.kg, 1)], ["CO\u2082e avoided (kg, estimate)", fmt(imp.co2)]];
  $("stats").replaceChildren(...items.map(([label, val]) =>
    h("div", { class: "card stat" }, h("div", { class: "stat__value" }, String(val)), h("div", { class: "stat__label" }, label))));
}

function renderTabs() {
  const active = claims.filter((c) => ACTIVE.includes(c.status)).length;
  const tabs = [["active", `Active (${active})`], ["history", `History (${claims.length - active})`]];
  $("tabs").replaceChildren(...tabs.map(([key, label]) =>
    h("button", { type: "button", "aria-pressed": String(tab === key), onclick: () => { tab = key; renderTabs(); renderList(); } }, label)));
}

function renderList() {
  const rows = claims.filter((c) => (tab === "active") === ACTIVE.includes(c.status));
  if (!rows.length) {
    $("list").replaceChildren(tab === "active"
      ? emptyState({ icon: "search", title: "No active claims", text: "Find surplus food near you and claim it before it expires.", action: { label: "Browse food", href: "browse.html" } })
      : emptyState({ icon: "inbox", title: "No history yet", text: "Completed and cancelled claims will appear here." }));
    return;
  }
  $("list").replaceChildren(h("div", { class: "claim-list" }, rows.map(claimCard)));
}

async function load() {
  $("list").replaceChildren(skeletonGrid(2));
  try {
    claims = (await api.get("/claims/mine")).claims;
    if (justClaimed) {
      highlightId = (claims.find((c) => c.status === "CLAIMED") || {}).claimId || null;
      $("banner").replaceChildren(icon("check", 18), h("div", {}, "Claim confirmed. Collect it during the pickup window below. We also emailed you the details."));
      $("banner").hidden = false;
      history.replaceState(null, "", "claims.html");
      justClaimed = false;
    }
    tab = "active";
    renderStats(); renderTabs(); renderList();
    if (highlightId) document.querySelector(".claim-card.is-new")?.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (e) {
    $("stats").replaceChildren();
    $("list").replaceChildren(errorState({ message: e.message, onRetry: load }));
  }
}

if (user) {
  load();
  setInterval(() => { if (claims.length) renderList(); }, 60000); // keep pickup hints fresh
}