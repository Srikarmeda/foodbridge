// frontend/js/impact.js: impact maths shared by the dashboard and the impact page.
import { CONFIG } from "./config.js";

/** Only donor-confirmed (COMPLETED) claims count. Meals = servings, falling back to kg x mealsPerKg. */
export function computeImpact(claims) {
  const done = claims.filter((c) => c.status === "COMPLETED");
  const kg = done.reduce((s, c) => s + Number(c.kg || 0), 0);
  const meals = done.reduce((s, c) => s + (Number(c.servings) || Number(c.kg || 0) * CONFIG.impact.mealsPerKg), 0);
  return { count: done.length, kg, meals, co2: kg * CONFIG.impact.co2PerKg };
}