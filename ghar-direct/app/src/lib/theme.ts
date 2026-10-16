import { useColorScheme } from 'react-native';

const light = {
  bg: '#F1ECFF',
  surface: '#FFFFFF',
  ink: '#1D1030',
  muted: '#5E5278',
  edge: '#1D1030',
  shadow: '#1D1030',
  verified: '#1F63B5',
  danger: '#C3322B',
  ok: '#0F7A4F',
};
const dark = {
  bg: '#150E24',
  surface: '#241838',
  ink: '#F5EFFF',
  muted: '#B3A6D1',
  edge: '#CDBFF5',
  shadow: '#0A0614',
  verified: '#7DB2F2',
  danger: '#FF8D84',
  ok: '#7FE0B0',
};

// Sticker colours stay the same in both themes, so tiles pop on dark too.
const sticker = {
  tangerine: '#FF6A2B',
  lime: '#C9F13F',
  pink: '#FF9BD0',
  sky: '#92D2FF',
  butter: '#FFE066',
  onTile: '#1D1030',
  white: '#FFFFFF',
  heart: '#E8275E',
};

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  hand: 'Caveat_700Bold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

export type Colors = typeof light & typeof sticker;

export function useTheme(): { c: Colors; dark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: { ...(isDark ? dark : light), ...sticker }, dark: isDark };
}
