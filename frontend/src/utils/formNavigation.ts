import type { KeyboardEvent } from "react";

// select and textarea are listed so they can be *destinations*; Enter pressed
// inside a textarea is left alone (it means "new line"). Buttons are excluded
// deliberately — Enter should never skip focus onto "Create invoice".
const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])';

/**
 * Enter moves to the next field, the way it does in a spreadsheet.
 *
 * Attach to a container's onKeyDown; it walks that container's fields in DOM
 * order, so the order you see is the order you get. A field that owns Enter
 * for itself (the service/customer search, which uses it to pick a result)
 * stops the event before it reaches here.
 *
 * On the last field it blurs rather than wrapping around — landing back at
 * the top of a long invoice with no visible cause is worse than stopping.
 */
export function advanceOnEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

  const target = e.target as HTMLElement;
  if (target instanceof HTMLTextAreaElement) return;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

  const fields = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // offsetParent is null for anything display:none — the fee columns that
    // only exist for HASSAS, for instance — so hidden fields are skipped
    // rather than focused invisibly.
    (el) => el.offsetParent !== null,
  );
  const index = fields.indexOf(target);
  if (index === -1) return;

  // Past this point Enter is handled here, so stop it submitting the form.
  e.preventDefault();

  const next = fields[index + 1];
  if (!next) {
    target.blur();
    return;
  }
  next.focus();
  // Select the existing text so typing replaces it — the common case is
  // correcting a pre-filled value, not appending to it. Not every input
  // supports selection (date/checkbox/radio throw InvalidStateError).
  if (next instanceof HTMLInputElement && SELECTABLE.has(next.type)) next.select();
}

const SELECTABLE = new Set(["text", "search", "url", "tel", "password", "number"]);
