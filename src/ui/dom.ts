/** Tiny DOM helpers. Text always goes in through textContent, never innerHTML, so no string here is parsed as markup. */
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const clear = (el: Element) => { while (el.firstChild) el.firstChild.remove(); };

export function setText(el: Element | null, text: string) { if (el && el.textContent !== text) el.textContent = text; }

/** A fixed SVG icon from icons.ts, wrapped in a span. Only pass the constant markup defined there, never text from data or players. */
export function icon(markup: string, cls = 'svg-ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = markup;
  return s;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab inside `box` while it is on screen (a modal card), and call `onEscape` on Esc.
 * Returns a function that lets go. It also lets go by itself once `box` leaves the page.
 */
export function trapFocus(box: HTMLElement, onEscape?: () => void): () => void {
  const release = () => document.removeEventListener('keydown', onKey, true);
  const onKey = (e: KeyboardEvent) => {
    if (!box.isConnected) { release(); return; }
    if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], cur = document.activeElement;
    const inside = !!cur && box.contains(cur);
    if (e.shiftKey ? (!inside || cur === first) : (!inside || cur === last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  return release;
}
