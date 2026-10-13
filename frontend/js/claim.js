// frontend/js/claim.js: one place for the claim flow (browse cards and the detail page).
import { api } from "./api.js";
import { ensureProfile } from "./profile.js";
import { confirmDialog, toast, withLoading, fmtDateTime, fmtTime } from "./ui.js";

let redirecting = false;

/** Confirm, claim, then go to My claims. `onConflict` runs if someone else got there first. */
export async function claimListing(l, btn, { onConflict } = {}) {
  if (redirecting) return false;
  const ok = await confirmDialog({
    title: "Claim this food?",
    message: `You are committing to collect "${l.title}" from ${l.donorName} between ${fmtDateTime(l.pickupStart)} and ${fmtTime(l.pickupEnd)}. If your plans change, cancel from My claims so someone else can have it.`,
    confirmLabel: "Yes, claim it",
  });
  if (!ok) return false;
  return withLoading(btn, async () => {
    const url = `/listings/${encodeURIComponent(l.listingId)}/claim`;
    try {
      try {
        await api.post(url);
      } catch (e) {
        if (e.status === 409 && /profile/i.test(e.message)) { await ensureProfile(); await api.post(url); }
        else throw e;
      }
      redirecting = true;
      toast.success("Claimed! We emailed you the pickup details.");
      setTimeout(() => location.assign("claims.html?new=1"), 900);
      return true;
    } catch (e) {
      toast.error(e.message); // e.g. "Someone just claimed this listing"
      if (onConflict && (e.status === 409 || e.status === 410)) onConflict();
      return false;
    }
  });
}