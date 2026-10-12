import { mountShell } from "../shell.js";
import { homeFor } from "../auth.js";
import { hydrateIcons } from "../helpers.js";
import { h, icon, listingCard, revealOnScroll } from "../ui.js";

const user = mountShell({ active: "index.html" });
hydrateIcons();

// Illustrative hero card (clearly labelled as an example)
document.getElementById("hero-visual").append(
  listingCard({
    title: "Veg biryani, 20 servings", dietary: "veg", servings: 20, quantityKg: 6,
    address: "Anna Nagar, Chennai", distanceKm: 3.2, donorName: "Example Kitchen",
    expiresAt: new Date(Date.now() + 55 * 60000).toISOString(), status: "AVAILABLE",
  }, { footer: h("span", { class: "btn btn-primary btn-block" }, "Claim this food") }),
  h("span", { class: "float-chip float-chip--1" }, icon("check", 16), "Claimed by Hope NGO"),
  h("span", { class: "float-chip float-chip--2" }, icon("pin", 16), "3.2 km away"),
  h("p", { class: "hero-visual__caption" }, "Illustrative example"),
);

// Signed-in visitors get a dashboard button instead of the sign-up CTAs
if (user) {
  const go = (cls) => h("a", { class: `btn ${cls} btn-lg`, href: homeFor(user.role) }, "Go to my dashboard");
  document.getElementById("hero-actions").replaceChildren(go("btn-primary"));
  document.getElementById("cta-actions").replaceChildren(go("btn-light"));
}

revealOnScroll();