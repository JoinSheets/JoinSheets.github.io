# Logo drafts

20 draft variants of a JoinSheets mark: three overlapping rounded squares.
The idea behind the shape: a nod to the overlapping circles usually used to
draw set intersections (Venn diagrams), reworked as squares since flat
tables/rectangles are what this product actually works with.

Not part of the Hugo build (this directory lives outside `static/`,
`content/`, `config/`, `layouts/`, and `themes/`) -- purely for review.

- `gallery.html` -- open locally in a browser to see all 20 side by side.
- `preview_light.png` / `preview_dark.png` -- the same grid pre-rendered on a
  light and a dark background, for a quick look without opening the HTML.
- `logo-NN-<arrangement>-p<palette>-<style>.svg` -- individual files.

## Arrangements

- `cascade` -- diagonal, small to large, bottom-left to top-right.
- `venn` -- symmetric triangular cluster, closest to a classic 3-circle Venn
  layout.
- `fan` -- near-uniform size, tight diagonal stack (reads more like stacked
  cards/tables).

## Palettes

1. Amber -- echoes the site theme's own accent color (`darkgoldenrod`, used
   for links/code in Compose's default styling).
2. Ink -- grayscale, matches the theme's neutral dark/light tones.
3. Teal.
4. Slate + amber accent -- two neutrals plus one accent square, same
   two-neutrals-plus-one-accent idea the theme itself uses.
5. Indigo / blue.

## Style

- `solid` -- opaque fill, later squares occlude earlier ones (stacked-card
  look).
- `blend` -- semi-transparent fill, overlaps visibly mix colors (intersection
  look).
- `outline` -- stroke only, no fill.

## Current pick

`logo-13-venn-p4-outline.svg` -- picked. Wired up as `static/images/logo.svg`
(`config/_default/params.toml`'s `[logo]` points at it), and mirrored as an
inline SVG in the product repo's own nav header
(`JoinSheets/view-common.js::ORG_LOGO_SVG`, `develop` branch) so both places
use the same mark. `[logo].lightMode`/`.darkMode` still both point at the
same file -- split them if a separate dark-mode variant turns out to be
needed (an outline in dark slate/gray can get faint on a dark background).
