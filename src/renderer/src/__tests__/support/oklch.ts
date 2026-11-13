// ---------------------------------------------------------------------------
// For the tests only: sRGB ↔ OKLCH through Björn Ottosson's matrices. Colours are written
// `oklch(L% C H)`, L to 2 places, C to 4 and H to 2, the fewest that turn back
// into the exact hex.
// ---------------------------------------------------------------------------

type Lch = [l: number, c: number, h: number]

/** An `oklch()` colour's lightness (%), chroma and hue. */
export const channelsOf = (oklch: string) =>
  oklch.slice('oklch('.length, -1).split(' ').map(parseFloat) as Lch

/** Lightness (%), chroma and hue as an `oklch()` colour. */
function oklchFrom([l, c, h]: Lch) {
  const hue = +h.toFixed(2) % 360
  return +c.toFixed(4)
    ? `oklch(${+l.toFixed(2)}% ${+c.toFixed(4)} ${hue})`
    : `oklch(${+l.toFixed(2)}% 0 0)`
}

const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** A `#rrggbb` or `#rrggbbaa` colour (its alpha ignored) in OKLCH. */
export function oklchOf(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => decode(parseInt(hex.slice(i, i + 2), 16) / 255))
  const [x, y, z] = [
    Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  ]
  const [l, a, bb] = [
    0.2104542553 * x + 0.793617785 * y - 0.0040720468 * z,
    1.9779984951 * x - 2.428592205 * y + 0.4505937099 * z,
    0.0259040371 * x + 0.7827717662 * y - 0.808675766 * z
  ]
  return oklchFrom([l * 100, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360])
}

/** An OKLCH colour's sRGB channels, 0 to 1, unclipped. */
function srgbOf([l, c, h]: Lch) {
  const [L, a, b] = [l / 100, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]
  const [x, y, z] = [
    (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  ]
  return [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z
  ].map(encode)
}

/** An `oklch()` colour as `#rrggbb`, clipped to sRGB. */
export const hexOf = (oklch: string) =>
  `#${srgbOf(channelsOf(oklch))
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
