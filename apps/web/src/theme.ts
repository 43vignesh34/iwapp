import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

/** A calm devotional palette with saffron accents (spec §7). Shades 0 (lightest) to 9. */
const saffron: MantineColorsTuple = [
  '#fff4e6',
  '#ffe8cc',
  '#ffd09b',
  '#ffb765',
  '#fea138',
  '#fe931b',
  '#e8781c',
  '#c66410', // 4.0:1 with white text: NOT enough for WCAG AA (axe caught this)
  '#a65309', // 5.4:1 with white text: the light-mode primary (AA needs 4.5:1)
  '#8a4404',
];

export const theme = createTheme({
  primaryColor: 'saffron',
  primaryShade: { light: 8, dark: 5 },
  colors: { saffron },
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif',
});

/**
 * Mantine's default "dimmed" text (gray.6, #868e96) is 3.3:1 on white, below WCAG AA's 4.5:1.
 * Use gray.7 (#495057, ~8:1) in light mode instead. Found by the axe check in e2e.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)' },
  dark: {},
});
