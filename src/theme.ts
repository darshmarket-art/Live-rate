import type { ThemeTokens } from '../shared/themes';

/** Puts a theme's tokens on the page (the server already painted the store's theme; this follows a change made while open). */
export function applyTheme(t: ThemeTokens, display?: string) {
  const r = document.documentElement.style;
  const set: Record<string, string> = { bg: t.bg, bg2: t.bg2, bg3: t.bg3, ink: t.ink, mut: t.mut, hair: t.hair, accent: t.accent, 'on-accent': t.onAccent, up: t.up, dn: t.dn, btn: t.btn, 'on-btn': t.onBtn };
  for (const [k, v] of Object.entries(set)) r.setProperty(`--${k}`, v);
  if (display) r.setProperty('--display', `'${display}'`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}

/** Inline CSS variables for a preview box (the owner's theme picker). */
export const themeVars = (t: ThemeTokens, display?: string) => ({
  '--bg': t.bg, '--bg2': t.bg2, '--bg3': t.bg3, '--ink': t.ink, '--mut': t.mut, '--hair': t.hair, '--accent': t.accent, '--on-accent': t.onAccent, '--up': t.up, '--dn': t.dn, '--btn': t.btn, '--on-btn': t.onBtn, ...(display ? { '--display': `'${display}'` } : {}), background: t.bg, color: t.ink
}) as React.CSSProperties;
