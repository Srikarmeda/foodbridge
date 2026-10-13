import { api } from "../api.js";
import { mountShell } from "../shell.js";
import { hydrateIcons } from "../helpers.js";
import { h, icon, emptyState, errorState } from "../ui.js";

const user = mountShell({ active: "impact.html", roles: ["DONOR", "RECEIVER", "ADMIN"] });
hydrateIcons();

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n, d = 0) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function countUp(el, target, decimals = 0) {
  if (reduceMotion || !target) { el.textContent = fmt(target, decimals); return; }
  const t0 = performance.now(), dur = 900;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)), decimals);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderTotals(s) {
  const items = [
    ["package", "Meals saved", s.meals, 0],
    ["leaf", "Food rescued (kg)", s.kg, 1],
    ["chart", "CO\u2082e avoided (kg, estimate)", s.co2, 0],
    ["check", "Donations completed", s.donations, 0],
  ];
  $("totals").replaceChildren(...items.map(([ic, label, value, dec]) => {
    const num = h("div", { class: "big-stat__value" }, "0");
    countUp(num, value, dec);
    return h("div", { class: "card big-stat" }, h("div", { class: "icon-tile" }, icon(ic, 22)), num, h("div", { class: "big-stat__label" }, label));
  }));
  $("assumptions").textContent = `Estimates: 1 kg of food is about ${s.mealsPerKg} meals and about ${s.co2PerKg} kg CO\u2082e avoided. Meals use the servings donors enter. Only handovers confirmed by the donor are counted.`;
}

function lbRow(r, max) {
  const pct = max > 0 ? Math.max(4, Math.round((r.kg / max) * 100)) : 0;
  return h("li", { class: "lb__row" + (r.isYou ? " is-you" : "") },
    h("span", { class: `lb__rank lb__rank--${r.rank <= 3 ? r.rank : "n"}`, "aria-label": `Rank ${r.rank}` }, String(r.rank)),
    h("div", {},
      h("div", { class: "lb__name" }, r.donorName, r.isYou ? h("span", { class: "badge badge--available" }, "You") : null),
      h("div", { class: "lb__meta" }, `${r.donations} donation${r.donations === 1 ? "" : "s"} \u00B7 ${fmt(r.meals)} meals \u00B7 ${fmt(r.co2)} kg CO\u2082e`),
      h("div", { class: "lb__bar", "aria-hidden": "true" }, h("span", { "data-w": String(pct) }))),
    h("div", { class: "lb__kg" }, fmt(r.kg, 1), h("small", {}, "kg rescued")));
}

function renderBoard(data) {
  const rows = data.leaderboard;
  if (!rows.length) {
    const action = user.role === "DONOR" ? { label: "Post food", href: "post.html" } : user.role === "RECEIVER" ? { label: "Find food", href: "browse.html" } : undefined;
    $("board").replaceChildren(emptyState({ icon: "leaf", title: "No rescues completed yet", text: "The leaderboard fills up as donors confirm handovers.", action }));
    return;
  }
  const max = rows[0].kg;
  const items = rows.map((r) => lbRow(r, max));
  if (data.you) items.push(h("li", { class: "lb__gap", "aria-hidden": "true" }, "\u00B7\u00B7\u00B7"), lbRow(data.you, max));
  const children = [h("ol", { class: "lb", "aria-label": "Top donors" }, items)];
  if (user.role === "DONOR" && !rows.some((r) => r.isYou) && !data.you) {
    children.push(h("p", { class: "text-sm text-muted", style: "margin:var(--space-4) 0 0" }, "Complete your first donation to join the leaderboard."));
  }
  $("board").replaceChildren(...children);
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll(".lb__bar span").forEach((s) => { s.style.width = s.dataset.w + "%"; })));
}

async function load() {
  $("totals").replaceChildren(...[0, 1, 2, 3].map(() => h("div", { class: "card big-stat", "aria-hidden": "true" },
    h("div", { class: "skeleton", style: "width:44px;height:44px;border-radius:12px" }), h("div", { class: "skeleton sk-title" }), h("div", { class: "skeleton sk-line", style: "width:60%" }))));
  $("board").replaceChildren(h("div", { class: "skeleton", style: "height:220px;border-radius:16px", "aria-hidden": "true" }));
  try {
    const [s, lb] = await Promise.all([api.get("/stats"), api.get("/leaderboard")]);
    renderTotals(s.stats);
    renderBoard(lb);
  } catch (e) {
    $("totals").replaceChildren();
    $("board").replaceChildren(errorState({ message: e.message, onRetry: load }));
  }
}

if (user) load();