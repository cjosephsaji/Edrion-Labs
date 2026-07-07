/** Student portal theme tokens — three themes (Ivory/Dim/Ink) from Edrion Learn design. */
export type StudentThemeName = 'standard' | 'dim' | 'dark';

export type StudentColorToken =
  | 'page'
  | 'card'
  | 'cardAlt'
  | 'surface2'
  | 'bd1'
  | 'bd2'
  | 'divider'
  | 'ink'
  | 'inkSoft'
  | 'muted'
  | 'faint'
  | 'faint2'
  | 'accent'
  | 'accentDeep'
  | 'accentSoft'
  | 'accentSoft2'
  | 'accentBd'
  | 'accentLine'
  | 'amber'
  | 'amberSoft'
  | 'amberBd'
  | 'amberInk'
  | 'danger'
  | 'dangerSoft'
  | 'violet'
  | 'violetSoft'
  | 'blue'
  | 'blueSoft'
  | 'gold'
  | 'goldSoftBg'
  | 'goldBd'
  | 'goldInk'
  | 'mintBg'
  | 'selection'
  | 'success'
  | 'sidebar';

export type StudentTheme = Record<StudentColorToken, string>;

export const studentThemes: Record<StudentThemeName, StudentTheme> = {
  standard: {
    page: '#F3F0E7',
    card: '#FFFFFF',
    cardAlt: '#FBFAF4',
    surface2: '#F5F2E8',
    bd1: '#E6E2D4',
    bd2: '#DDD8C8',
    divider: '#F0EDE1',
    ink: '#17251F',
    inkSoft: '#43514A',
    muted: '#55645C',
    faint: '#8A968F',
    faint2: '#B9B4A2',
    accent: '#1E7A5E',
    accentDeep: '#0C3F31',
    accentSoft: '#E3EFE8',
    accentSoft2: '#D5E7DD',
    accentBd: '#C8DDD1',
    accentLine: '#7FBA9E',
    amber: '#B9741F',
    amberSoft: '#FCF6EB',
    amberBd: '#EAD9BC',
    amberInk: '#8F5716',
    danger: '#A8472B',
    dangerSoft: '#F6E6DF',
    violet: '#5B4A78',
    violetSoft: '#EFEAF5',
    blue: '#3A5A78',
    blueSoft: '#E3EAF1',
    gold: '#8A7440',
    goldSoftBg: '#F7F1DE',
    goldBd: '#E8DDBB',
    goldInk: '#6E5B2E',
    mintBg: '#F0F6F1',
    selection: '#CFE4D6',
    success: '#14614B',
    sidebar: '#F8F5EC',
  },
  dim: {
    page: '#221E18',
    card: '#302A23',
    cardAlt: '#2A251E',
    surface2: '#2C271F',
    bd1: '#443D33',
    bd2: '#443D33',
    divider: '#3A342C',
    ink: '#ECE7DC',
    inkSoft: '#CEC7BB',
    muted: '#A9A296',
    faint: '#938C80',
    faint2: '#807A6E',
    accent: '#48B78C',
    accentDeep: '#48B78C',
    accentSoft: '#22392F',
    accentSoft2: '#2A4538',
    accentBd: '#2E4A3C',
    accentLine: '#48B78C',
    amber: '#D79E54',
    amberSoft: '#3A3120',
    amberBd: '#5A4528',
    amberInk: '#D79E54',
    danger: '#B85538',
    dangerSoft: '#3C2822',
    violet: '#2E2838',
    violetSoft: '#2E2838',
    blue: '#243038',
    blueSoft: '#243038',
    gold: '#C6A76A',
    goldSoftBg: '#3A3120',
    goldBd: '#5A4D30',
    goldInk: '#C6A76A',
    mintBg: '#1F3328',
    selection: '#2E4A3C',
    success: '#48B78C',
    sidebar: '#2C271F',
  },
  dark: {
    page: '#14110D',
    card: '#221D17',
    cardAlt: '#1B1710',
    surface2: '#251F18',
    bd1: '#332C22',
    bd2: '#332C22',
    divider: '#2C261E',
    ink: '#EDE7DB',
    inkSoft: '#CBC4B7',
    muted: '#A49D91',
    faint: '#8B8478',
    faint2: '#736D61',
    accent: '#5FCB9E',
    accentDeep: '#5FCB9E',
    accentSoft: '#183328',
    accentSoft2: '#1E3D30',
    accentBd: '#2F5443',
    accentLine: '#5FCB9E',
    amber: '#E3A758',
    amberSoft: '#2E2413',
    amberBd: '#4A3820',
    amberInk: '#E3A758',
    danger: '#B85538',
    dangerSoft: '#331E17',
    violet: '#251E30',
    violetSoft: '#251E30',
    blue: '#1A2632',
    blueSoft: '#1A2632',
    gold: '#CBAC6D',
    goldSoftBg: '#2E2413',
    goldBd: '#4A3D22',
    goldInk: '#CBAC6D',
    mintBg: '#152820',
    selection: '#2F5443',
    success: '#5FCB9E',
    sidebar: '#251F18',
  },
};

export const studentFonts = {
  display: "'Source Serif 4', Georgia, serif",
  body: "'Instrument Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const studentRadii = {
  sm: '8px',
  md: '10px',
  lg: '12px',
  xl: '14px',
  '2xl': '16px',
  '3xl': '18px',
  pill: '999px',
} as const;

/** Keyframes ported verbatim from the design helmet. */
export const studentKeyframes = {
  blockIn:
    '0%{opacity:0;transform:translateY(16px) scale(.988)}70%{opacity:1;transform:translateY(-2px) scale(1.002)}100%{opacity:1;transform:none}',
  fadeUp: 'from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}',
  popIn: '0%{transform:scale(.3);opacity:0}70%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}',
  softPulse:
    '0%,100%{box-shadow:0 0 0 0 rgba(30,122,94,.32)}55%{box-shadow:0 0 0 7px rgba(30,122,94,0)}',
  shimmer: '0%{background-position:-260px 0}100%{background-position:260px 0}',
  blink: '0%,100%{opacity:1}50%{opacity:.15}',
  burst:
    '0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--tx),var(--ty)) scale(.2);opacity:0}',
  slideIn: 'from{transform:translateX(26px);opacity:0}to{transform:none;opacity:1}',
  sheetIn: 'from{transform:translateY(36px);opacity:0}to{transform:none;opacity:1}',
  dotBounce: '0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}',
} as const;
