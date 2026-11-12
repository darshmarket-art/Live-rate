/**
 * Looks a store owner can choose for the buyer app and the shop screen. Every colour on those screens comes from these tokens.
 * Owners pick a preset and may set their own accent; an accent that would be hard to read on the ground is refused.
 */
export interface ThemeTokens {
  /** page ground, raised band, third ground (photo placeholders) */
  bg: string; bg2: string; bg3: string;
  /** text, secondary text, hairlines */
  ink: string; mut: string; hair: string;
  /** the one accent (eyebrows, the selected chip, the book button) and the text on it */
  accent: string; onAccent: string;
  /** rate went up / down (also told apart by an arrow, never by colour alone) */
  up: string; dn: string;
  /** solid button and its text */
  btn: string; onBtn: string;
}

export interface ThemeDef { id: ThemeId; name: string; note: string; dark: boolean; tokens: ThemeTokens; display: string; body: string }

export const THEME_IDS = ['noir', 'ivory', 'midnight', 'garnet', 'emerald', 'heritage'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: Record<ThemeId, ThemeDef> = {
  noir: {
    id: 'noir', name: 'Noir', note: 'Black, ivory and champagne gold', dark: true, display: 'Cormorant Garamond', body: 'Jost',
    tokens: { bg: '#0d0c0a', bg2: '#171512', bg3: '#1f1c18', ink: '#f3eee4', mut: '#aaa397', hair: '#2e2a24', accent: '#c9a961', onAccent: '#0d0c0a', up: '#8fd1a8', dn: '#ef8e72', btn: '#f3eee4', onBtn: '#0d0c0a' }
  },
  ivory: {
    id: 'ivory', name: 'Ivory', note: 'Paper white with ink and antique gold', dark: false, display: 'Cormorant Garamond', body: 'Jost',
    tokens: { bg: '#faf7f1', bg2: '#f3eee4', bg3: '#ebe4d6', ink: '#0d0c0a', mut: '#5f584d', hair: '#d9d0bf', accent: '#7a5f24', onAccent: '#faf7f1', up: '#2f7d4f', dn: '#b5472b', btn: '#0d0c0a', onBtn: '#faf7f1' }
  },
  midnight: {
    id: 'midnight', name: 'Midnight', note: 'Deep navy with warm gold', dark: true, display: 'Cormorant Garamond', body: 'Jost',
    tokens: { bg: '#0f1420', bg2: '#161c2b', bg3: '#1d2436', ink: '#ece7dc', mut: '#a3a8b6', hair: '#283048', accent: '#d6b66a', onAccent: '#0f1420', up: '#8fd1a8', dn: '#ef8e72', btn: '#ece7dc', onBtn: '#0f1420' }
  },
  garnet: {
    id: 'garnet', name: 'Garnet', note: 'Blush ground with a deep garnet', dark: false, display: 'Cormorant Garamond', body: 'Jost',
    tokens: { bg: '#fbf6f3', bg2: '#f3e7e3', bg3: '#ead9d3', ink: '#2a1118', mut: '#6e5058', hair: '#e2cfc9', accent: '#8c1d3a', onAccent: '#fbf6f3', up: '#2f7d4f', dn: '#a83a20', btn: '#8c1d3a', onBtn: '#fbf6f3' }
  },
  emerald: {
    id: 'emerald', name: 'Emerald', note: 'Forest green with pale gold', dark: true, display: 'Cormorant Garamond', body: 'Jost',
    tokens: { bg: '#0b1512', bg2: '#12201b', bg3: '#182a23', ink: '#eef2ea', mut: '#9fb2a8', hair: '#22362e', accent: '#d4b46a', onAccent: '#0b1512', up: '#9fdcb4', dn: '#f09479', btn: '#eef2ea', onBtn: '#0b1512' }
  },
  heritage: {
    id: 'heritage', name: 'Heritage', note: 'Temple red and turmeric gold', dark: true, display: 'Playfair Display', body: 'Jost',
    tokens: { bg: '#1c0b0b', bg2: '#271111', bg3: '#321616', ink: '#f7ecdc', mut: '#c2a99a', hair: '#43201d', accent: '#e0a63a', onAccent: '#1c0b0b', up: '#9fdcb4', dn: '#f39a7e', btn: '#f7ecdc', onBtn: '#1c0b0b' }
  }
};

export const DEFAULT_THEME: ThemeId = 'noir';

export interface StoreTheme { id: ThemeId; accent?: string }

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s: string) => HEX.test(s);

/** WCAG relative luminance and contrast ratio. */
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** The accent must read as text on the ground (3:1, the large-text rule; it is used for eyebrows, prices and the book button). */
export const MIN_ACCENT_CONTRAST = 3;
export function checkAccent(themeId: ThemeId, accent: string): string | null {
  if (!isHex(accent)) return 'Give the colour as #RRGGBB.';
  const ratio = contrast(accent, THEMES[themeId].tokens.bg);
  return ratio < MIN_ACCENT_CONTRAST ? `That colour is too close to the ${THEMES[themeId].name} background (contrast ${ratio.toFixed(1)}:1, at least ${MIN_ACCENT_CONTRAST}:1 is needed). Choose a ${THEMES[themeId].dark ? 'lighter' : 'darker'} one.` : null;
}

/** The tokens a store's buyers see: the preset, with the owner's accent (and readable text on it) when set. */
export function tokensFor(t: StoreTheme | null | undefined): ThemeTokens {
  const def = THEMES[t?.id && THEMES[t.id] ? t.id : DEFAULT_THEME];
  if (!t?.accent || !isHex(t.accent)) return def.tokens;
  const onAccent = contrast(t.accent, '#ffffff') >= contrast(t.accent, '#0d0c0a') ? '#ffffff' : '#0d0c0a';
  return { ...def.tokens, accent: t.accent, onAccent };
}
