// frontend/js/helpers.js: inline form errors, password toggle, icon hydration.
import { h, icon } from "./ui.js";

export function clearError(input) {
  const field = input.closest(".field");
  if (!field) return;
  field.classList.remove("has-error");
  input.removeAttribute("aria-invalid");
  field.querySelector(`#${input.id}-err`)?.remove();
  const rest = (input.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== `${input.id}-err`).join(" ");
  if (rest) input.setAttribute("aria-describedby", rest);
  else input.removeAttribute("aria-describedby");
}

export function setError(input, message) {
  clearError(input);
  const field = input.closest(".field");
  if (!field || !message) return;
  field.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
  const id = `${input.id}-err`;
  field.append(h("span", { class: "error-text", id }, icon("alert", 16), message));
  const prev = input.getAttribute("aria-describedby");
  input.setAttribute("aria-describedby", prev ? `${prev} ${id}` : id);
}

export function passwordToggle(input, btn) {
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.textContent = show ? "Hide" : "Show";
  });
}

/** Replace <span data-icon="pin" data-size="20"> placeholders with real SVG icons. */
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => el.replaceWith(icon(el.dataset.icon, Number(el.dataset.size) || 20)));
}