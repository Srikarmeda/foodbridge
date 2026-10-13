import { api } from "../api.js";
import { mountShell } from "../shell.js";
import { ensureProfile } from "../profile.js";
import { computeImpact } from "../impact.js";
import { hydrateIcons } from "../helpers.js";
import { h, icon, toast, withLoading, skeletonGrid, emptyState, errorState, listingCard, statusBadge, confirmDialog, fmtDateTime, fmtTime } from "../ui.js";

const user = mountShell({ active: "donor.html", roles: ["DONOR"] });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const ACTIVE = ["AVAILABLE", "CLAIMED", "PICKED_UP"];
const PAST = ["COMPLETED", "EXPIRED"];
const FILTERS = [["all", "All"], ["active", "Active"], ["past", "Past"]];
const fmt = (n, d = 0) => Number(n.toFixed(d)).toLocaleString();
let listings = [], claims = [], filter = "all";

async function load() {
  $("stats").replaceChildren(...[0, 1, 2, 3].map(() => h("div", { class: "card stat", "aria-hidden": "true" },
    h("div", { class: "skeleton sk-title" }), h("div", { class: "skeleton sk-line", style: "margin-top:10px;width:60%" }))));
  $("attention").replaceChildren();
  $("listings").replaceChildren(skeletonGrid(3));
  try {
    try { await ensureProfile(); } catch (e) { console.warn("Profile setup deferred:", e); }
    const [l, c] = await Promise.all([api.get("/listings/mine"), api.get("/claims/incoming")]);
    listings = l.listings;
    claims = c.claims;
    render();
  } catch (e) {
    $("stats").replaceChildren();
    $("listings").replaceChildren(errorState({ message: e.message, onRetry: load }));
  }
}

function render() { renderStats(); renderAttention(); renderFilters(); renderListings(); }

function renderStats() {
  const imp = computeImpact(claims);
  const live = listings.filter((l) => ACTIVE.includes(l.status)).length;
  const items = [["Live listings", live], ["Meals rescued", fmt(imp.meals)], ["Food rescued (kg)", fmt(imp.kg, 1)], ["CO\u2082e avoided (kg, estimate)", fmt(imp.co2)]];
  $("stats").replaceChildren(...items.map(([label, val]) =>
    h("div", { class: "card stat" }, h("div", { class: "stat__value" }, String(val)), h("div", { class: "stat__label" }, label))));
}

function claimRow(c) {
  const action = c.status === "PICKED_UP"
    ? h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: (e) => confirmHandover(c, e.currentTarget) }, icon("check", 16), "Confirm handover")
    : h("span", { class: "text-sm text-muted" }, "Waiting for pickup");
  return h("div", { class: "card claim-row" },
    h("div", { class: "claim-row__main" },
      h("strong", {}, c.listingTitle),
      h("p", { class: "text-sm text-muted" }, `${c.receiverName} \u00B7 pickup ${fmtDateTime(c.pickupStart)} to ${fmtTime(c.pickupEnd)}`)),
    h("div", { class: "cluster" }, statusBadge(c.status), action));
}

function renderAttention() {
  const todo = claims.filter((c) => c.status === "CLAIMED" || c.status === "PICKED_UP");
  $("attention").replaceChildren(...(todo.length ? [
    h("div", { class: "section-title" }, h("h2", {}, "Needs your attention"), h("span", { class: "badge badge--urgent" }, `${todo.length} open`)),
    h("div", { class: "claim-list" }, todo.map(claimRow)),
  ] : []));
}

async function confirmHandover(c, btn) {
  const ok = await confirmDialog({
    title: "Confirm handover?",
    message: `Confirm that ${c.receiverName} collected "${c.listingTitle}". This counts toward your impact.`,
    confirmLabel: "Yes, collected",
  });
  if (!ok) return;
  await withLoading(btn, async () => {
    try {
      await api.post(`/claims/${c.claimId}/complete`);
      toast.success("Handover confirmed. Thank you for rescuing food!");
      await load();
    } catch (e) { toast.error(e.message); }
  });
}

function renderFilters() {
  $("filters").replaceChildren(...FILTERS.map(([key, label]) =>
    h("button", { type: "button", "aria-pressed": String(filter === key), onclick: () => { filter = key; renderFilters(); renderListings(); } }, label)));
}

async function withdraw(l) {
  const ok = await confirmDialog({ title: "Withdraw this listing?", message: `"${l.title}" will disappear for receivers. This cannot be undone.`, confirmLabel: "Withdraw", danger: true });
  if (!ok) return;
  try {
    await api.del(`/listings/${l.listingId}`);
    listings = listings.filter((x) => x.listingId !== l.listingId);
    toast.success("Listing withdrawn.");
    render();
  } catch (e) { toast.error(e.message); }
}

function cardFooter(l, claim) {
  if (l.status === "AVAILABLE") return h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: () => withdraw(l) }, "Withdraw listing");
  if (claim) return h("p", { class: "text-sm text-muted", style: "margin:0" }, `${claim.status === "COMPLETED" ? "Collected by" : "Claimed by"} ${claim.receiverName}`);
  return null;
}

function renderListings() {
  const box = $("listings");
  if (!listings.length) {
    box.replaceChildren(emptyState({ icon: "leaf", title: "Post your first donation", text: "Add the food you have left over. Receivers nearby are emailed straight away.", action: { label: "Post food", href: "post.html" } }));
    return;
  }
  const byListing = new Map(); // newest non-cancelled claim per listing (claims arrive newest first)
  for (const c of claims) if (c.status !== "CANCELLED" && !byListing.has(c.listingId)) byListing.set(c.listingId, c);
  const list = listings.filter((l) => filter === "all" || (filter === "active" ? ACTIVE.includes(l.status) : PAST.includes(l.status)));
  if (!list.length) { box.replaceChildren(emptyState({ icon: "inbox", title: "Nothing here yet", text: "No listings match this filter." })); return; }
  box.replaceChildren(h("div", { class: "grid grid-cards" }, list.map((l) => listingCard(l, { href: `listing.html?id=${encodeURIComponent(l.listingId)}`, footer: cardFooter(l, byListing.get(l.listingId)) }))));
}

if (user) {
  $("greeting").textContent = `Hi, ${user.name.split(" ")[0]}`;
  load();
  setInterval(() => { if (listings.length) renderListings(); }, 60000); // keep "time left" fresh
}