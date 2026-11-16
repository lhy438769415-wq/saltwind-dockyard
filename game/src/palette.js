// The look plan, in one place: a dusk harbour — cold blue air, warm rust and signal
// orange. Every colour in the game is one of these; the lighting makes the shades.
export const PALETTE = {
  sky: '#1c2436',
  concrete: '#3a3f46',
  rust: '#a34a32',
  teal: '#2f6f6a',
  ochre: '#c08a2e',
  slate: '#4a5560',
  ink: '#e8e2d4',
  muted: '#8b94a0',
  accent: '#ff9a3c',
  enemy: '#e4572e',
  ally: '#57b8a2',
};

export function shade(name) {
  return PALETTE[name];
}
