/** Student portal theme tokens — editorial paper, dusk, and ink. */
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
  | 'sidebar'
  | 'canvasGrid'
  | 'canvasEdge'
  | 'canvasAlternative'
  | 'canvasMissing';

export type StudentTheme = Record<StudentColorToken, string>;

export const studentThemes: Record<StudentThemeName, StudentTheme> = {
  standard: {
    page: '#F5F2E9',
    card: '#FBFAF5',
    cardAlt: '#F8F6EF',
    surface2: '#F0EDE4',
    bd1: '#DDD9CD',
    bd2: '#CBC6B8',
    divider: '#E9E5DB',
    ink: '#17372F',
    inkSoft: '#465850',
    muted: '#53655E',
    faint: '#66766F',
    faint2: '#788780',
    accent: '#1D674F',
    accentDeep: '#0B3B2F',
    accentSoft: '#E8EFEA',
    accentSoft2: '#DCE8E1',
    accentBd: '#C7D9CF',
    accentLine: '#6B9985',
    amber: '#9A7625',
    amberSoft: '#F4EFDF',
    amberBd: '#DED1AE',
    amberInk: '#745818',
    danger: '#945346',
    dangerSoft: '#F2E8E3',
    violet: '#5B4A78',
    violetSoft: '#EFEAF5',
    blue: '#3A5A78',
    blueSoft: '#E3EAF1',
    gold: '#8A7440',
    goldSoftBg: '#F7F1DE',
    goldBd: '#E8DDBB',
    goldInk: '#6E5B2E',
    mintBg: '#F0F6F1',
    selection: '#D7E5DC',
    success: '#1D674F',
    sidebar: '#F8F6EF',
    canvasGrid: '#D8D2C2',
    canvasEdge: '#7D897F',
    canvasAlternative: '#5B4A78',
    canvasMissing: '#3A5A78',
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
    canvasGrid: '#443D33',
    canvasEdge: '#938C80',
    canvasAlternative: '#B9A7D4',
    canvasMissing: '#7CA6C8',
  },
  dark: {
    page: '#14110D',
    card: '#221D17',
    cardAlt: '#1B1710',
    surface2: '#251F18',
    bd1: '#332C22',
    bd2: '#3A3127',
    divider: '#2B251D',
    ink: '#EDE7DB',
    inkSoft: '#CBC4B7',
    muted: '#A49D91',
    faint: '#8B8478',
    faint2: '#736D61',
    accent: '#5FCB9E',
    accentDeep: '#5FCB9E',
    accentSoft: '#183328',
    accentSoft2: '#204034',
    accentBd: '#2A4F42',
    accentLine: '#5FCB9E',
    amber: '#E3A758',
    amberSoft: '#2E2413',
    amberBd: '#4A3820',
    amberInk: '#E3A758',
    danger: '#C45A42',
    dangerSoft: '#331E17',
    violet: '#B9A7D4',
    violetSoft: '#251E30',
    blue: '#7CA6C8',
    blueSoft: '#1A2632',
    gold: '#CBAC6D',
    goldSoftBg: '#2E2413',
    goldBd: '#4A3D22',
    goldInk: '#CBAC6D',
    mintBg: '#183328',
    selection: '#214A3B',
    success: '#5FCB9E',
    sidebar: '#1B1710',
    canvasGrid: '#332C22',
    canvasEdge: '#8B8478',
    canvasAlternative: '#B9A7D4',
    canvasMissing: '#7CA6C8',
  },
};

export const studentFonts = {
  display: "'Newsreader', Georgia, serif",
  body: "'Source Sans 3', system-ui, sans-serif",
  mono: "'Source Sans 3', system-ui, sans-serif",
} as const;

export const studentMotion = {
  fast: '130ms',
  standard: '180ms',
  emphasized: '220ms',
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1.2)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export const studentRadii = {
  sm: '0px',
  md: '0px',
  lg: '0px',
  xl: '0px',
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
