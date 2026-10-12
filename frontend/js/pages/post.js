import { api, uploadPhoto, bootstrapProfile } from "../api.js";
import { CONFIG } from "../config.js";
import { mountShell } from "../shell.js";
import { ensureProfile } from "../profile.js";
import { setError, clearError, hydrateIcons } from "../helpers.js";
import { toast, withLoading } from "../ui.js";

const user = mountShell({ active: "post.html", roles: ["DONOR"] });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const form = $("post-form");
const hasMap = typeof window.L !== "undefined";
let map = null, marker = null, pin = null, photoFile = null, posted = false;
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ---------- defaults ----------
function setupDefaults() {
  const start = new Date(Date.now() + 3600e3);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  $("pickupStart").value = toLocalInput(start);
  $("pickupEnd").value = toLocalInput(new Date(start.getTime() + 2 * 3600e3));
  $("expiresAt").value = toLocalInput(new Date(start.getTime() + 5 * 3600e3));
  const now = toLocalInput(new Date());
  ["pickupStart", "pickupEnd", "expiresAt"].forEach((id) => ($(id).min = now));
  $("description").addEventListener("input", () => ($("desc-count").textContent = `${$("description").value.length}/300`));
}

// ---------- photo ----------
function photoError(msg) { const el = $("photo-error"); el.textContent = msg || ""; el.hidden = !msg; }
function clearPhoto() {
  if (photoFile) URL.revokeObjectURL($("photo-img").src);
  photoFile = null; $("photo").value = "";
  $("photo-preview").hidden = true; $("photo-drop").hidden = false; photoError("");
}
function setPhoto(file) {
  photoError("");
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { photoError("Use a JPEG, PNG or WebP image."); $("photo").value = ""; return; }
  if (file.size > 5 * 1024 * 1024) { photoError("Photo must be smaller than 5 MB."); $("photo").value = ""; return; }
  photoFile = file;
  $("photo-img").src = URL.createObjectURL(file);
  $("photo-preview").hidden = false; $("photo-drop").hidden = true;
}
function setupPhoto() {
  $("photo").addEventListener("change", (e) => setPhoto(e.target.files[0]));
  $("photo-remove").addEventListener("click", clearPhoto);
  const drop = $("photo-drop");
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) { $("photo").files = e.dataTransfer.files; setPhoto(e.dataTransfer.files[0]); } });
}

// ---------- map ----------
function getPin() {
  if (hasMap) return pin;
  const la = parseFloat($("lat").value), ln = parseFloat($("lng").value);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? { lat: la, lng: ln } : null;
}
function setPin(lat, lng, pan = true) {
  pin = { lat, lng };
  $("map-error").hidden = true;
  $("coords").textContent = `Pin set at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag it to adjust.`;
  if (!hasMap) { $("lat").value = lat; $("lng").value = lng; return; }
  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true, title: "Pickup location" }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); setPin(p.lat, p.lng, false); });
  } else marker.setLatLng([lat, lng]);
  if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 15));
}
async function findAddress() {
  const q = $("address").value.trim();
  if (q.length < 3) { setError($("address"), "Type an address first."); $("address").focus(); return; }
  await withLoading($("find-address"), async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!data.length) toast.info("No match found. Click the map to drop a pin instead.");
      else setPin(parseFloat(data[0].lat), parseFloat(data[0].lon));
    } catch { toast.error("Address search failed. Click the map to drop a pin instead."); }
  });
}
async function useMyLocation() {
  if (!navigator.geolocation) { toast.error("Your browser cannot share its location. Search an address instead."); return; }
  await withLoading($("use-location"), () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPin(pos.coords.latitude, pos.coords.longitude); resolve(); },
      (err) => { toast.error(err.code === 1 ? "Location permission was denied. Search an address or click the map instead." : "Could not get your location. Search an address or click the map instead."); resolve(); },
      { enableHighAccuracy: true, timeout: 10000 });
  }));
}
function setupMap() {
  $("find-address").addEventListener("click", findAddress);
  $("use-location").addEventListener("click", useMyLocation);
  if (!hasMap) { $("map").hidden = true; $("manual-coords").hidden = false; $("coords").textContent = "The map could not load. Enter the coordinates manually."; return; }
  map = L.map("map", { scrollWheelZoom: false }).setView(CONFIG.map.center, CONFIG.map.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng, false));
}

// ---------- validation (mirrors the Lambda rules) ----------
function validate() {
  let first = null;
  const check = (input, msg) => { if (msg) { setError(input, msg); first ||= input; } else clearError(input); };
  const v = (id) => $(id).value.trim();

  check($("title"), v("title").length < 3 || v("title").length > 80 ? "Enter a title of 3 to 80 characters." : "");
  const diet = form.querySelector('input[name="diet"]:checked');
  $("diet-error").hidden = !!diet;
  if (!diet) first ||= form.querySelector('input[name="diet"]');
  const kg = parseFloat($("quantityKg").value);
  check($("quantityKg"), Number.isFinite(kg) && kg >= 0.1 && kg <= 1000 ? "" : "Enter a quantity between 0.1 and 1000 kg.");
  const sv = Number($("servings").value);
  check($("servings"), Number.isInteger(sv) && sv >= 1 && sv <= 5000 ? "" : "Enter a whole number of servings from 1 to 5000.");
  check($("address"), v("address").length < 5 || v("address").length > 200 ? "Enter the pickup address (5 to 200 characters)." : "");
  if (!getPin()) { $("map-error").hidden = false; first ||= $("address"); } else $("map-error").hidden = true;

  const s = new Date($("pickupStart").value), e = new Date($("pickupEnd").value), x = new Date($("expiresAt").value), now = new Date();
  check($("pickupStart"), isNaN(s) ? "Choose when pickup starts." : "");
  check($("pickupEnd"), isNaN(e) ? "Choose when pickup ends." : !isNaN(s) && e <= s ? "Pickup must end after it starts." : "");
  check($("expiresAt"), isNaN(x) ? "Choose when the food expires."
    : x <= now ? "Expiry must be in the future."
    : x - now > 3 * 86400e3 ? "Expiry must be within 3 days from now."
    : !isNaN(e) && e > x ? "Food cannot expire before the pickup window ends." : "");
  if (first) first.focus();
  return { ok: !first, kg, sv, s, e, x, diet: diet?.value };
}

// ---------- submit ----------
async function onSubmit(ev) {
  ev.preventDefault();
  if (posted) return;
  const r = validate();
  if (!r.ok) { toast.error("Please fix the highlighted fields."); return; }
  const status = $("submit-status");
  await withLoading($("submit"), async () => {
    try {
      let photoKey = "";
      if (photoFile) { status.textContent = "Uploading photo..."; photoKey = (await uploadPhoto(photoFile)).key; }
      status.textContent = "Posting your listing...";
      const p = getPin();
      const body = {
        title: $("title").value.trim(), description: $("description").value.trim(),
        foodType: $("foodType").value, dietary: r.diet, quantityKg: r.kg, servings: r.sv,
        address: $("address").value.trim(), lat: p.lat, lng: p.lng, photoKey,
        pickupStart: r.s.toISOString(), pickupEnd: r.e.toISOString(), expiresAt: r.x.toISOString(),
      };
      try {
        await api.post("/listings", body);
      } catch (err) {
        if (err.status === 409 && /profile/i.test(err.message)) { await ensureProfile(); await api.post("/listings", body); }
        else throw err;
      }
      posted = true;
      if ($("remember").checked) bootstrapProfile({ address: body.address, lat: body.lat, lng: body.lng }).catch(() => {});
      toast.success("Listing posted! Nearby receivers are being notified.");
      status.textContent = "Done. Taking you to your dashboard...";
      setTimeout(() => location.assign("donor.html"), 1000);
    } catch (err) {
      status.textContent = "";
      toast.error(err.message);
    }
  });
}

async function prefill() {
  try {
    const profile = await ensureProfile();
    if (!profile) return;
    if (profile.address && !$("address").value) $("address").value = profile.address;
    if (profile.lat != null && profile.lng != null) setPin(Number(profile.lat), Number(profile.lng));
  } catch (e) { console.warn("Prefill skipped:", e); }
}

if (user) {
  setupDefaults(); setupPhoto(); setupMap();
  form.addEventListener("submit", onSubmit);
  ["title", "foodType", "quantityKg", "servings", "address", "pickupStart", "pickupEnd", "expiresAt"].forEach((id) =>
    $(id).addEventListener("input", () => clearError($(id))));
  form.querySelectorAll('input[name="diet"]').forEach((r) => r.addEventListener("change", () => ($("diet-error").hidden = true)));
  prefill();
}