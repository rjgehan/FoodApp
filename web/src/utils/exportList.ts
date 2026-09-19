/**
 * Getting the list out of the app and into somewhere else — in practice, Apple Notes.
 *
 * Notes will not accept checkboxes from a paste. It throws away `<input type="checkbox">`, and
 * any list markup becomes plain bullets, because its checklists live in a private attributed
 * -string format no web page can put on the clipboard. What it does do well is convert: paste
 * plain lines, select them, tap the checklist button, and every line becomes a checkbox at once.
 *
 * So the text is written for that conversion: one item per line, nothing else. No title, no aisle
 * headings — anything that is not an item would become a checkbox too. Aisle *order* is kept,
 * so the list still walks the store.
 */
export function listAsText(items: { name: string; quantity?: number | null; unit?: string | null }[]): string {
  return items
    .map((item) => [item.quantity ?? '', item.unit ?? '', item.name].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * True when the text reached the clipboard. The modern API needs a secure context, which the
 * kiosk on the house network does not have, so there is a fallback — and a false return so the
 * caller can show the text and let someone copy it by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or unavailable — try the old way before giving up.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Off-screen but focusable; `display: none` cannot be selected.
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);

    // Safari on iOS ignores .select() on a readonly field; a range over its contents works.
    const range = document.createRange();
    range.selectNodeContents(area);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    area.setSelectionRange(0, text.length);

    const copied = document.execCommand('copy');
    selection?.removeAllRanges();
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
