import type { ThemeTokens } from '../shared/themes';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The store's colours as CSS variables, so the first paint is already in the owner's theme (no flash of the default look). */
export const themeCss = (t: ThemeTokens, display = 'Cormorant Garamond') =>
  `:root{--bg:${t.bg};--bg2:${t.bg2};--bg3:${t.bg3};--ink:${t.ink};--mut:${t.mut};--hair:${t.hair};--accent:${t.accent};--on-accent:${t.onAccent};--up:${t.up};--dn:${t.dn};--btn:${t.btn};--on-btn:${t.onBtn};--display:'${display}'}`;

export function renderIndex(html: string, o: { name?: string; tokens?: ThemeTokens; display?: string; duo?: boolean }) {
  let out = html;
  if (o.name) out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(o.name)} · Live rates</title>`);
  if (o.tokens) out = out.replace('</head>', `<style id="store-theme">${themeCss(o.tokens, o.display)}</style><meta name="theme-color" content="${o.tokens.bg}"></head>`);
  if (o.duo) out = out.replace(/<html([^>]*)>/, '<html$1 data-duo>');
  return out;
}
