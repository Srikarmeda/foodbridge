import { api } from "../api.js";
import { mountShell } from "../shell.js";
import { homeFor } from "../auth.js";
import { claimListing } from "../claim.js";
import { hasLeaflet, pinIcon, tileLayer, osmLink } from "../maps.js";
import { h, icon, emptyState, errorState, statusBadge, dietBadge, timeLeft, fmtDateTime, fmtTime } from "../ui.js";

const user = mountShell({ roles: ["RECEIVER", "DONOR", "ADMIN"] });
const $ = (id) => document.getElementById(id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = new URLSearchParams(location.search).get("id") || "";
let map = null, timer = null;

function skeleton() {
  return h("div", { class: "detail", "aria-busy": "true", "aria-label": "Loading" },
    h("div", { class: "stack" }, h("div", { class: "skeleton", style: "aspect-ratio:16/10;border-radius:16px" }),
      h("div", { class: "skeleton sk-title" }), h("div", { class: "skeleton sk-line" }), h("div", { class: "skeleton sk-line", style: "width:70%" })),
    h("div", { class: "skeleton", style: "height:240px;border-radius:16px" }));
}

function claimPanel(l) {
  const t = timeLeft(l.expiresAt);
  const gone = l.status === "EXPIRED" || (l.status === "AVAILABLE" && t.expired);
  const box = h("div", { class: "stack", style: "--stack:var(--space-3)" });
  const note = (cls, ic, text) => h("div", { class: `alert ${cls}` }, icon(ic, 18), h("div", {}, text));

  if (user.role === "RECEIVER") {
    if (l.status === "AVAILABLE" && !gone) {
      box.append(
        h("button", { class: "btn btn-primary btn-lg btn-block", type: "button", onclick: (e) => claimListing(l, e.currentTarget, { onConflict: load }) }, "Claim this food"),
        h("p", { class: "text-sm text-muted", style: "margin:0" }, "You will get the pickup details by email. Cancel any time from My claims if your plans change."));
    } else if (l.claimedBy === user.id && ["CLAIMED", "PICKED_UP", "COMPLETED"].includes(l.status)) {
      box.append(note("alert--success", "check", "You claimed this listing."), h("a", { class: "btn btn-secondary btn-block", href: "claims.html" }, "Go to my claims"));
    } else {
      box.append(note("alert--info", "info", gone ? "This listing has expired." : "Another receiver has already claimed this food."),
        h("a", { class: "btn btn-secondary btn-block", href: "browse.html" }, "Find other food"));
    }
  } else if (l.donorId === user.id) {
    box.append(note("alert--info", "info", "This is your listing."), h("a", { class: "btn btn-secondary btn-block", href: "donor.html" }, "Back to my dashboard"));
  } else if (user.role === "ADMIN") {
    box.append(note("alert--info", "info", "Admin view. Only receivers can claim food."));
  } else {
    box.append(note("alert--info", "info", "Only receivers can claim food."));
  }
  return box;
}

const fact = (label, value) => h("div", {}, h("dt", {}, label), h("dd", {}, value));

function render(l) {
  document.title = `${l.title} | FoodBridge`;
  const left = timeLeft(l.expiresAt);

  const media = h("div", { class: "detail__media" });
  if (l.photoUrl) {
    const img = h("img", { src: l.photoUrl, alt: `Photo of ${l.title}` });
    img.addEventListener("error", () => img.replaceWith(icon("image", 56)));
    media.append(img);
  } else media.append(icon("image", 56));

  const countdown = h("div", { class: "countdown" });
  const paint = () => {
    const t = timeLeft(l.expiresAt);
    countdown.textContent = t.expired ? "Expired" : t.text;
    countdown.className = "countdown" + (t.expired ? " countdown--over" : t.urgent ? " countdown--urgent" : "");
  };
  paint();
  clearInterval(timer);
  timer = setInterval(paint, 30000);

  const lat = Number(l.lat), lng = Number(l.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const mapBox = hasLeaflet() && hasCoords
    ? h("div", { class: "detail__map", role: "application", "aria-label": "Map showing the pickup location" }) : null;

  const main = h("div", { class: "stack", style: "--stack:var(--space-5)" },
    media,
    h("div", { class: "stack", style: "--stack:var(--space-3)" },
      h("div", { class: "cluster" }, dietBadge(l.dietary), statusBadge(l.status)),
      h("h1", { style: "margin:0" }, l.title),
      h("p", { class: "text-muted", style: "margin:0" }, `Shared by ${l.donorName}`),
      l.description ? h("p", { style: "margin:0;white-space:pre-line" }, l.description) : null),
    h("dl", { class: "facts card card-pad" },
      fact("Food type", l.foodType),
      fact("Quantity", `${l.quantityKg} kg, about ${l.servings} servings`),
      fact("Pickup window", `${fmtDateTime(l.pickupStart)} to ${fmtTime(l.pickupEnd)}`),
      fact("Expires", fmtDateTime(l.expiresAt)),
      fact("Pickup address", l.address),
      fact("Posted", fmtDateTime(l.createdAt))),
    mapBox,
    hasCoords ? h("a", { href: osmLink(lat, lng), target: "_blank", rel: "noopener noreferrer" }, "Open in OpenStreetMap") : null);

  const aside = h("aside", { class: "detail__aside", "aria-label": "Claim" },
    h("div", { class: "card card-pad stack", style: "--stack:var(--space-4)" },
      h("div", {}, h("p", { class: "text-sm text-muted", style: "margin:0" }, "Time left"), countdown),
      claimPanel(l)));

  $("content").replaceChildren(h("div", { class: "detail" }, main, aside));

  if (mapBox) {
    if (map) map.remove();
    map = L.map(mapBox, { scrollWheelZoom: false }).setView([lat, lng], 15);
    tileLayer().addTo(map);
    L.marker([lat, lng], { icon: pinIcon(left.urgent ? "urgent" : "listing"), title: l.address }).addTo(map);
  }
}

async function load() {
  $("content").replaceChildren(skeleton());
  try {
    const { listing } = await api.get(`/listings/${encodeURIComponent(id)}`);
    render(listing);
  } catch (e) {
    $("content").replaceChildren(e.status === 404
      ? emptyState({ icon: "search", title: "Listing not found", text: "It may have been withdrawn by the donor.", action: { label: "Back", href: homeFor(user.role) } })
      : errorState({ message: e.message, onRetry: load }));
  }
}

if (user) {
  const back = $("back");
  back.href = homeFor(user.role);
  back.textContent = user.role === "RECEIVER" ? "\u2190 Back to browse" : "\u2190 Back to dashboard";
  if (!UUID.test(id)) {
    $("content").replaceChildren(emptyState({ icon: "search", title: "Listing not found", text: "This link looks incomplete or incorrect.", action: { label: "Go back", href: homeFor(user.role) } }));
  } else load();
}