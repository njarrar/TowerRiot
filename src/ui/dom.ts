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
