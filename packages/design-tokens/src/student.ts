/** Student portal theme tokens — forest ink, mint paper, and deep green night. */
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
    page: '#F1F7F2',
    card: '#FBFEFB',
    cardAlt: '#EAF3ED',
    surface2: '#DFECE3',
    bd1: '#C7DDCF',
    bd2: '#A8C7B3',
    divider: '#D9E9DF',
    ink: '#10291F',
    inkSoft: '#355546',
    muted: '#587164',
    faint: '#71877B',
    faint2: '#82978B',
    accent: '#1D7A51',
    accentDeep: '#0B4A34',
    accentSoft: '#DFF1E7',
    accentSoft2: '#CFE8D9',
    accentBd: '#ACD2BC',
    accentLine: '#5D9F79',
    amber: '#5A8A36',
    amberSoft: '#E7F2DC',
    amberBd: '#B9D49D',
    amberInk: '#315E19',
    danger: '#945346',
    dangerSoft: '#F2E8E3',
    violet: '#38684F',
    violetSoft: '#E4F0E8',
    blue: '#2B7555',
    blueSoft: '#E0F0E7',
    gold: '#5A7E3D',
    goldSoftBg: '#EAF3DF',
    goldBd: '#C5DAAC',
    goldInk: '#365D20',
    mintBg: '#E7F3EB',
    selection: '#CCE8D8',
    success: '#23845A',
    sidebar: '#EAF3ED',
    canvasGrid: '#C7DDCF',
    canvasEdge: '#6F927C',
    canvasAlternative: '#4F8B3D',
    canvasMissing: '#2B7555',
  },
  dim: {
    page: '#102018',
    card: '#182C21',
    cardAlt: '#14261C',
    surface2: '#1C3326',
    bd1: '#31513D',
    bd2: '#3C654D',
    divider: '#294533',
    ink: '#EDF7F0',
    inkSoft: '#C6DBCC',
    muted: '#9DB8A5',
    faint: '#86A18E',
    faint2: '#708A78',
    accent: '#55C486',
    accentDeep: '#78D9A0',
    accentSoft: '#1B422D',
    accentSoft2: '#245038',
    accentBd: '#35664A',
    accentLine: '#55C486',
    amber: '#91C15E',
    amberSoft: '#293F1F',
    amberBd: '#4D7132',
    amberInk: '#C5E79D',
    danger: '#B85538',
    dangerSoft: '#3C2822',
    violet: '#79AA87',
    violetSoft: '#203B2B',
    blue: '#68B58D',
    blueSoft: '#1C3A29',
    gold: '#91C15E',
    goldSoftBg: '#293F1F',
    goldBd: '#4D7132',
    goldInk: '#C5E79D',
    mintBg: '#1B3A29',
    selection: '#2C5A40',
    success: '#55C486',
    sidebar: '#14261C',
    canvasGrid: '#31513D',
    canvasEdge: '#86A18E',
    canvasAlternative: '#91C15E',
    canvasMissing: '#68B58D',
  },
  dark: {
    page: '#0B1711',
    card: '#12231A',
    cardAlt: '#0F1D16',
    surface2: '#182D22',
    bd1: '#294B38',
    bd2: '#3C674D',
    divider: '#203D2D',
    ink: '#EEF8F2',
    inkSoft: '#C4DACA',
    muted: '#98B7A4',
    faint: '#7F9F8B',
    faint2: '#698873',
    accent: '#5BD18D',
    accentDeep: '#A6EBC1',
    accentSoft: '#163B28',
    accentSoft2: '#1C4A33',
    accentBd: '#326347',
    accentLine: '#5BD18D',
    amber: '#95C561',
    amberSoft: '#263D1B',
    amberBd: '#4E7131',
    amberInk: '#C8EA9D',
    danger: '#C45A42',
    dangerSoft: '#331E17',
    violet: '#86BD96',
    violetSoft: '#193624',
    blue: '#73C69A',
    blueSoft: '#163624',
    gold: '#95C561',
    goldSoftBg: '#263D1B',
    goldBd: '#4E7131',
    goldInk: '#C8EA9D',
    mintBg: '#153825',
    selection: '#24563B',
    success: '#5BD18D',
    sidebar: '#0F1D16',
    canvasGrid: '#294B38',
    canvasEdge: '#7F9F8B',
    canvasAlternative: '#95C561',
    canvasMissing: '#73C69A',
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
