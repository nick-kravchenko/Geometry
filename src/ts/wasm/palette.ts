// "Ocean Sunset" by Coolors: https://coolors.co/001219-005f73-0a9396-94d2bd-e9d8a6-ee9b00-ca6702-bb3e03-ae2012-9b2226
export const PALETTE = {
  richBlack: '#001219',
  midnightGreen: '#005f73',
  darkCyan: '#0a9396',
  tiffanyBlue: '#94d2bd',
  vanilla: '#e9d8a6',
  gamboge: '#ee9b00',
  alloyOrange: '#ca6702',
  rust: '#bb3e03',
  rufous: '#ae2012',
  auburn: '#9b2226',
} as const;

// '#rrggbb' with an alpha channel, as a CSS color
export function withAlpha(hex: string, alpha: number): string {
  const value: number = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

export const COLORS = {
  field: PALETTE.richBlack,
  obstacleFill: withAlpha(PALETTE.midnightGreen, .55),
  obstacleStroke: PALETTE.darkCyan,
  obstacleLabel: withAlpha(PALETTE.tiffanyBlue, .7),
  start: PALETTE.darkCyan,
  end: PALETTE.rufous,
  marker: PALETTE.vanilla,
  panel: withAlpha(PALETTE.richBlack, .85),
  panelBorder: withAlpha(PALETTE.midnightGreen, .9),
  text: PALETTE.vanilla,
  // one hue per algorithm; WASM paths are drawn wide and translucent under the thin TS ones
  breadthFirst: PALETTE.tiffanyBlue,
  aStar: PALETTE.gamboge,
  jumpPoint: PALETTE.rust,
  visibilityGraph: PALETTE.vanilla,
  // the overlay shows the visibility graph's own graph, so it shares that algorithm's color
  graphEdge: withAlpha(PALETTE.vanilla, .4),
  graphCorner: PALETTE.vanilla,
  graphOutline: PALETTE.alloyOrange,
} as const;

export const wasmPathColor = (hex: string): string => withAlpha(hex, .45);
