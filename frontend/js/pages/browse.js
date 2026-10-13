import { api, bootstrapProfile } from "../api.js";
import { CONFIG } from "../config.js";
import { mountShell } from "../shell.js";
import { ensureProfile } from "../profile.js";
import { claimListing } from "../claim.js";
import { hasLeaflet, pinIcon, tileLayer, geocode, locate } from "../maps.js";
import { hydrateIcons, setError, clearError } from "../helpers.js";
import { h, icon, toast, withLoading, skeletonGrid, emptyState, errorState, listingCard, timeLeft } from "../ui.js";

const user = mountShell({ active: "browse.html", roles: ["RECEIVER"] });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const RADII = [2, 5, 10, 25, 50];
const state = { lat: CONFIG.map.center[0], lng: CONFIG.map.center[1], label: "the default map area", saved: false, radius: 10, foodType: "", dietary: "", sort: "expiry", q: "" };
let listings = [], reqId = 0, map = null, youMarker = null, radiusCircle = null, pinsLayer = null;
const pinById = new Map();
const LOC_KEY = user ? `fb.browseLoc.${user.id}` : "fb.browseLoc";

// ---------- location ----------
function readStoredLocation() {
  try {
    const s = JSON.parse(localStorage.getItem(LOC_KEY) || "null");
    if (s && Number.isFinite(s.lat) && Number.isFinite(s.lng)) return s;
  } catch { /* ignore */ }
  return null;
}
function writeStoredLocation() {
  try { localStorage.setItem(LOC_KEY, JSON.stringify({ lat: state.lat, lng: state.lng, label: state.label })); } catch { /* ignore */ }
}
async function persistLocation() {
  writeStoredLocation();
  try {
    await bootstrapProfile({ address: state.label.slice(0, 200), lat: state.lat, lng: state.lng });
    state.saved = true;
    $("loc-hint").hidden = true;
    toast.success("Location saved. You'll get an email when food is posted within 10 km.");
  } catch {
    toast.info("Showing results for this location. We could not save it just now.");
  }
}
function setCenter(lat, lng, label, { save = false } = {}) {
  state.lat = lat; state.lng = lng; state.label = label;
  $("loc-label").textContent = label;
  updateYouMarker();
  if (save) persistLocation();
  refresh();
}

// ---------- map ----------
function popupNode(l) {
  return h("div", { class: "map-popup" },
    h("strong", {}, l.title),
    h("span", { class: "text-sm" }, `${l.servings} servings \u00B7 ${l.distanceKm != null ? l.distanceKm + " km" : l.address}`),
    h("span", { class: "text-sm text-muted" }, timeLeft(l.expiresAt).text),
    h("a", { href: `listing.html?id=${encodeURIComponent(l.listingId)}` }, "View details"));
}
function initMap() {
  if (!hasLeaflet()) { $("map").hidden = true; $("browse").dataset.nomap = "1"; document.querySelector(".view-toggle").hidden = true; return; }
  map = L.map("map", { scrollWheelZoom: false }).setView([state.lat, state.lng], 12);
  tileLayer().addTo(map);
  pinsLayer = L.layerGroup().addTo(map);
  radiusCircle = L.circle([state.lat, state.lng], { radius: state.radius * 1000, color: "#1F7A4D", weight: 1.5, fillOpacity: 0.05, interactive: false }).addTo(map);
  youMarker = L.marker([state.lat, state.lng], { icon: pinIcon("you"), draggable: true, title: "Your search location. Drag to move.", zIndexOffset: 1000 }).addTo(map);
  youMarker.on("dragend", () => { const p = youMarker.getLatLng(); setCenter(p.lat, p.lng, "your pinned location", { save: true }); });
}
function updateYouMarker() {
  if (!map) return;
  youMarker.setLatLng([state.lat, state.lng]);
  radiusCircle.setLatLng([state.lat, state.lng]).setRadius(state.radius * 1000);
}
function fitMap() {
  if (map && map.getSize().x > 0) map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
}
function renderMap() {
  if (!map) return;
  updateYouMarker();
  pinsLayer.clearLayers();
  pinById.clear();
  for (const l of listings) {
    const lat = Number(l.lat), lng = Number(l.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const m = L.marker([lat, lng], { icon: pinIcon(timeLeft(l.expiresAt).urgent ? "urgent" : "listing"), title: l.title, riseOnHover: true }).bindPopup(popupNode(l));
    m.addTo(pinsLayer);
    pinById.set(l.listingId, m);
  }
  fitMap();
}
function setView(v) {
  $("browse").dataset.view = v;
  document.querySelectorAll(".view-toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  if (v === "map" && map) requestAnimationFrame(() => { map.invalidateSize(); fitMap(); });
}
function focusOnMap(l) {
  setView("map");
  const m = pinById.get(l.listingId);
  if (!m) return;
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
    m.openPopup();
    $("map").scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

// ---------- results ----------
function cardFor(l) {
  const claimBtn = h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: (e) => claimListing(l, e.currentTarget, { onConflict: () => refresh({ silent: true }) }) }, "Claim");
  const mapBtn = map ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => focusOnMap(l) }, icon("pin", 16), "Show on map") : null;
  return listingCard(l, { href: `listing.html?id=${encodeURIComponent(l.listingId)}`, footer: h("div", { class: "cluster", style: "margin-top:auto" }, claimBtn, mapBtn) });
}
const hasFilters = () => !!(state.foodType || state.dietary || state.q.trim());
function clearFilters() {
  state.foodType = ""; state.dietary = ""; state.q = "";
  $("foodType").value = ""; $("q").value = "";
  document.querySelector('input[name="dietary"][value=""]').checked = true;
  refresh();
}
function setRadius(r) { state.radius = r; $("radius").value = String(r); refresh(); }

function renderResults() {
  const n = listings.length;
  $("count").textContent = n ? `${n} listing${n === 1 ? "" : "s"} within ${state.radius} km of ${state.label}` : "";
  if (!n) {
    const next = RADII.find((r) => r > state.radius);
    const action = next ? { label: `Widen search to ${next} km`, onClick: () => setRadius(next) } : hasFilters() ? { label: "Clear filters", onClick: clearFilters } : undefined;
    $("results").replaceChildren(emptyState({
      icon: "leaf", title: "No food available here right now",
      text: `Nothing matches within ${state.radius} km of ${state.label}. New donations appear as soon as they are posted.`, action,
    }));
    return;
  }
  $("results").replaceChildren(h("div", { class: "grid grid-cards" }, listings.map(cardFor)));
}

async function refresh({ silent = false } = {}) {
  const my = ++reqId;
  if (!silent) { $("results").replaceChildren(skeletonGrid(4)); $("count").textContent = "Loading..."; }
  try {
    const data = await api.get("/listings", { query: {
      lat: state.lat, lng: state.lng, radiusKm: state.radius,
      foodType: state.foodType, dietary: state.dietary, q: state.q.trim(),
      sort: state.sort === "distance" ? "distance" : "",
    } });
    if (my !== reqId) return; // a newer request superseded this one
    listings = data.listings;
    renderResults();
    renderMap();
  } catch (e) {
    if (my !== reqId || silent) return;
    listings = [];
    renderMap();
    $("count").textContent = "";
    $("results").replaceChildren(errorState({ message: e.message, onRetry: () => refresh() }));
  }
}

// ---------- wiring ----------
function wire() {
  let t;
  $("q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; refresh(); }, 350); });
  $("radius").addEventListener("change", (e) => { state.radius = Number(e.target.value); updateYouMarker(); refresh(); });
  $("foodType").addEventListener("change", (e) => { state.foodType = e.target.value; refresh(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; refresh(); });
  document.querySelectorAll('input[name="dietary"]').forEach((r) => r.addEventListener("change", () => { state.dietary = r.value; refresh(); }));
  $("filters").addEventListener("submit", (e) => e.preventDefault());
  document.querySelectorAll(".view-toggle button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  $("area").addEventListener("input", () => clearError($("area")));
  $("area-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("area").value.trim();
    if (q.length < 3) { setError($("area"), "Type an area or address first."); $("area").focus(); return; }
    await withLoading($("area-go"), async () => {
      try {
        const g = await geocode(q);
        if (!g) toast.info("No match found. Try a nearby landmark, or add the city name.");
        else setCenter(g.lat, g.lng, q.slice(0, 80), { save: true });
      } catch { toast.error("Area search failed. Try again, or use your location."); }
    });
  });
  $("use-location").addEventListener("click", (e) => withLoading(e.currentTarget, async () => {
    try {
      const p = await locate();
      setCenter(p.lat, p.lng, "your current location", { save: true });
    } catch (err) {
      toast.error(err.code === 1 ? "Location permission was denied. Search an area instead." : "Could not get your location. Search an area instead.");
    }
  }));
}

async function start() {
  initMap();
  wire();
  let profile = null;
  try { profile = await ensureProfile(); } catch (e) { console.warn("Profile setup deferred:", e); }
  const stored = readStoredLocation();
  if (profile && profile.lat != null && profile.lng != null) {
    Object.assign(state, { lat: Number(profile.lat), lng: Number(profile.lng), label: profile.address || "your saved location", saved: true });
  } else if (stored) {
    Object.assign(state, { lat: stored.lat, lng: stored.lng, label: stored.label || "your last location" });
  }
  $("loc-hint").hidden = state.saved;
  $("loc-label").textContent = state.label;
  updateYouMarker();
  refresh();
  setInterval(() => { if (!document.hidden) refresh({ silent: true }); }, 120000); // keep timers and availability fresh
}

if (user) start();