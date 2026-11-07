// The "Blue sky" recipe from the gradient tool (type SKY), one per rank, each in that rank's own colours (theme.css, "Rank aura").
// Silver's stops are its palette as it is -- #E8EEFC (--rk-b, its brightest orb), #AAC6F0 (--rk-d), #B3BFDC (--rk-a), #E3E6F1
// (--maroon-pale) -- standing in for the recipe's #E6F2FF, #B3D9FF, #80B3FF, #E3E9F4. Every other rank takes the same four roles from
// its own palette at Silver's OKLab lightness (hue and colourfulness kept; chroma trimmed only to stay inside sRGB), so every rank's sky
// is equally light behind the page's text: luminance about 0.85 / 0.54 / 0.51 / 0.79 for all eight. The sky's colour-burn pass would
// otherwise turn darker palettes (Iron, Gold, Warrior...) nearly black under dark text.
export const RANK_SKY_STOPS: Record<string, readonly [string, string, string, string]> = {
  iron: ['#E6EFFB', '#B1C6E0', '#B4C0D4', '#E5E7EA'],
  bronze: ['#FFEAD7', '#FFAE8B', '#FCA973', '#F1E3DC'],
  silver: ['#E8EEFC', '#AAC6F0', '#B3BFDC', '#E3E6F1'],
  gold: ['#FFEDBE', '#FFB25B', '#F0B439', '#ECE6D5'],
  platinum: ['#B3FFF9', '#83CEFF', '#57D7CE', '#DAEAE9'],
  diamond: ['#DCF2FF', '#ACC3FE', '#81C7FF', '#DAE9F4'],
  warrior: ['#FFE9E0', '#FEAD94', '#FEA496', '#F7E0DD'],
  champion: ['#FBE6FF', '#FEA3D5', '#D5A9FE', '#EEE1F9'],
};

/** The recipe as exported, with a rank's stops. */
export function rankSky(stops: readonly string[]) {
  return {
    type: 'SKY',
    animated: true,
    width: 1920,
    height: 1080,
    aspect: 1920 / 1080,
    speed: 40,
    startT: 20.75,
    blur: 0,
    fieldBlur: 0,
    grain: 0,
    stops: [...stops],
    divs: null,
    params: null,
  };
}
