// frontend/js/shell.js: header, nav and footer shared by every page.
import { getUser, requireAuth, signOut } from "./auth.js";
import { h, icon } from "./ui.js";

const LOGO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 17h20"/><path d="M4 17c0-6 3.6-9 8-9s8 3 8 9"/><path d="M8 17v-6M12 17V8M16 17v-6"/></svg>';

const LINKS = {
  guest: [["Home", "index.html"], ["How it works", "index.html#how"]],
  DONOR: [["Dashboard", "donor.html"], ["Post food", "post.html"], ["Impact", "impact.html"]],
  RECEIVER: [["Browse food", "browse.html"], ["My claims", "claims.html"], ["Impact", "impact.html"]],
  ADMIN: [["Admin", "admin.html"], ["Impact", "impact.html"]],
};

/** mountShell({ active: "browse.html", roles: ["RECEIVER"] })
 *  Pass `roles` to protect the page. Returns the user, or null if redirecting (stop rendering). */
export function mountShell({ active = "", roles = null } = {}) {
  const user = roles ? requireAuth(roles) : getUser();
  if (roles && !user) return null;

  document.body.prepend(h("a", { class: "skip-link", href: "#main" }, "Skip to content"));

  const links = (LINKS[user?.role] || LINKS.guest).map(([label, href]) =>
    h("a", { class: "nav__link", href, "aria-current": href === active ? "page" : null }, label));

  const account = user
    ? h("div", { class: "nav__user" },
        h("span", { class: "nav__who" }, user.name),
        h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: signOut }, icon("logout", 16), "Log out"))
    : h("div", { class: "nav__user" },
        h("a", { class: "btn btn-ghost btn-sm", href: "login.html" }, "Log in"),
        h("a", { class: "btn btn-primary btn-sm", href: "signup.html" }, "Sign up"));

  const menu = h("nav", { class: "nav__menu", id: "nav-menu", "aria-label": "Main" }, links, account);
  const toggle = h("button", { class: "nav-toggle", type: "button", "aria-label": "Menu", "aria-expanded": "false", "aria-controls": "nav-menu" }, icon("menu", 22));
  const setOpen = (open) => { menu.classList.toggle("is-open", open); toggle.setAttribute("aria-expanded", String(open)); };
  toggle.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });

  const header = document.getElementById("site-header");
  if (header) {
    header.replaceChildren(h("div", { class: "nav container" },
      h("a", { class: "brand", href: user ? (LINKS[user.role]?.[0]?.[1] || "index.html") : "index.html" },
        h("span", { class: "brand__mark", html: LOGO }), "FoodBridge"),
      toggle, menu));
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.replaceChildren(h("div", { class: "container" },
      h("span", {}, "FoodBridge: from extra to essential"),
      h("span", {}, "Meal and CO2 figures are estimates. Built on AWS serverless.")));
  }
  return user;
}