import { api } from "../api.js";
import { mountShell } from "../shell.js";
import { hydrateIcons } from "../helpers.js";
import { h, toast, withLoading, emptyState, errorState, statusBadge, confirmDialog, fmtDateTime } from "../ui.js";

const user = mountShell({ active: "admin.html", roles: ["ADMIN"] });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const dateOnly = (iso) => (iso ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "");
const ROLE_LABEL = { DONOR: "Donor", RECEIVER: "Receiver", ADMIN: "Admin" };
let stats = null, listings = [], lcounts = {}, users = [], ucounts = {}, tab = "listings";

const statCard = (value, label, sub) => h("div", { class: "card stat" },
  h("div", { class: "stat__value" }, String(value)), h("div", { class: "stat__label" }, label),
  sub ? h("div", { class: "text-sm text-muted" }, sub) : null);

function renderStats() {
  const live = (lcounts.AVAILABLE || 0) + (lcounts.CLAIMED || 0) + (lcounts.PICKED_UP || 0);
  $("stats").replaceChildren(
    statCard(fmt((ucounts.DONOR || 0) + (ucounts.RECEIVER || 0)), "Registered users", `${fmt(ucounts.DONOR)} donors, ${fmt(ucounts.RECEIVER)} receivers`),
    statCard(fmt(live), "Live listings", `${fmt(lcounts.AVAILABLE)} available now`),
    statCard(fmt(stats.donations), "Completed donations"),
    statCard(fmt(stats.meals), "Meals saved"),
    statCard(fmt(stats.kg, 1), "Food rescued (kg)"),
    statCard(fmt(stats.co2), "CO\u2082e avoided (kg, estimate)"));
}

// ---------- tabs ----------
function renderTabs() {
  const defs = [["listings", `Listings (${listings.length})`], ["users", `Users (${users.length})`]];
  $("tabs").replaceChildren(...defs.map(([key, label]) => h("button", {
    class: "tab", type: "button", role: "tab", id: `tab-${key}`, "aria-selected": String(tab === key),
    "aria-controls": `panel-${key}`, tabindex: tab === key ? "0" : "-1",
    onclick: () => selectTab(key),
    onkeydown: (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); selectTab(key === "listings" ? "users" : "listings", true); } },
  }, label)));
  $("panel-listings").hidden = tab !== "listings";
  $("panel-users").hidden = tab !== "users";
}
function selectTab(key, focus = false) { tab = key; renderTabs(); if (focus) $(`tab-${key}`).focus(); }

// ---------- listings ----------
async function removeListing(l, btn) {
  const ok = await confirmDialog({
    title: "Remove this listing?",
    message: `"${l.title}" from ${l.donorName} will be deleted for everyone. This cannot be undone.`,
    confirmLabel: "Remove", danger: true,
  });
  if (!ok) return;
  await withLoading(btn, async () => {
    try { await api.del(`/admin/listings/${encodeURIComponent(l.listingId)}`); toast.success("Listing removed."); await load({ quiet: true }); }
    catch (e) { toast.error(e.message); }
  });
}

function listingRow(l) {
  return h("tr", {},
    h("td", {}, h("div", { class: "cell-title" }, h("strong", {}, l.title), h("small", {}, `by ${l.donorName} \u00B7 ${l.address}`))),
    h("td", {}, statusBadge(l.status)),
    h("td", { class: "num" }, `${l.servings} servings`, h("br"), h("small", { class: "text-muted" }, `${l.quantityKg} kg`)),
    h("td", {}, fmtDateTime(l.expiresAt)),
    h("td", {}, h("div", { class: "cluster", style: "--gap:var(--space-2)" },
      h("a", { class: "btn btn-secondary btn-sm", href: `listing.html?id=${encodeURIComponent(l.listingId)}` }, "View"),
      l.status === "AVAILABLE" ? h("button", { class: "btn btn-danger btn-sm", type: "button", onclick: (e) => removeListing(l, e.currentTarget) }, "Remove") : null)));
}

function renderListings() {
  const term = $("l-q").value.trim().toLowerCase(), st = $("l-status").value;
  const rows = listings.filter((l) => (!st || l.status === st) && (!term || `${l.title} ${l.donorName}`.toLowerCase().includes(term)));
  $("l-count").textContent = `Showing ${rows.length} of ${listings.length} listings`;
  if (!rows.length) { $("listings-table").replaceChildren(emptyState({ icon: "inbox", title: "No listings match", text: "Try a different search or status." })); return; }
  $("listings-table").replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "table" },
    h("thead", {}, h("tr", {}, ["Listing", "Status", "Quantity", "Expires", "Actions"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", {}, rows.map(listingRow)))));
}

// ---------- users ----------
function userRow(u) {
  const alerts = u.role === "RECEIVER" ? (u.hasLocation ? "On" : "Off (no location)") : "\u2014";
  return h("tr", {},
    h("td", {}, h("div", { class: "cell-title" }, h("strong", {}, u.name || "(no name)"), u.orgName ? h("small", {}, u.orgName) : null)),
    h("td", {}, u.email),
    h("td", {}, h("span", { class: `badge badge--${u.role.toLowerCase()}` }, ROLE_LABEL[u.role] || u.role)),
    h("td", {}, alerts),
    h("td", {}, dateOnly(u.createdAt)));
}

function renderUsers() {
  const term = $("u-q").value.trim().toLowerCase(), role = $("u-role").value;
  const rows = users.filter((u) => (!role || u.role === role) && (!term || `${u.name} ${u.email} ${u.orgName}`.toLowerCase().includes(term)));
  $("u-count").textContent = `Showing ${rows.length} of ${users.length} users`;
  if (!rows.length) { $("users-table").replaceChildren(emptyState({ icon: "inbox", title: "No users match", text: "Try a different search or role." })); return; }
  $("users-table").replaceChildren(h("div", { class: "table-wrap" }, h("table", { class: "table" },
    h("thead", {}, h("tr", {}, ["Name", "Email", "Role", "Nearby alerts", "Joined"].map((t) => h("th", { scope: "col" }, t)))),
    h("tbody", {}, rows.map(userRow)))));
}

// ---------- load ----------
async function load({ quiet = false } = {}) {
  if (!quiet) {
    $("stats").replaceChildren(...[0, 1, 2, 3, 4, 5].map(() => h("div", { class: "card stat", "aria-hidden": "true" },
      h("div", { class: "skeleton sk-title" }), h("div", { class: "skeleton sk-line", style: "margin-top:10px;width:60%" }))));
    for (const id of ["listings-table", "users-table"]) $(id).replaceChildren(h("div", { class: "skeleton", style: "height:240px;border-radius:16px", "aria-hidden": "true" }));
  }
  try {
    const [s, l, u] = await Promise.all([api.get("/stats"), api.get("/admin/listings"), api.get("/admin/users")]);
    stats = s.stats; listings = l.listings; lcounts = l.counts; users = u.users; ucounts = u.counts;
    renderStats(); renderTabs(); renderListings(); renderUsers();
  } catch (e) {
    $("stats").replaceChildren();
    for (const id of ["listings-table", "users-table"]) $(id).replaceChildren(errorState({ message: e.message, onRetry: () => load() }));
  }
}

if (user) {
  ["l-q", "l-status"].forEach((id) => $(id).addEventListener("input", renderListings));
  ["u-q", "u-role"].forEach((id) => $(id).addEventListener("input", renderUsers));
  $("refresh").addEventListener("click", (e) => withLoading(e.currentTarget, () => load({ quiet: true })));
  load();
}