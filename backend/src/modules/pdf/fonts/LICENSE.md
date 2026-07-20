# DejaVu Sans Font — License & Attribution

The font files in this directory (`DejaVuSans.ttf`, `DejaVuSans-Bold.ttf`) are
part of the DejaVu Fonts project (https://dejavu-fonts.github.io/), used here
to give the PDF export engine broad, embedded Unicode glyph coverage
(Latin Extended, Greek, Cyrillic, and a wide range of symbols) that works
consistently across any deployment environment, without depending on
whatever fonts happen to be installed on the host system.

DejaVu Fonts are released under a permissive, freely redistributable license
(a derivative of the Bitstream Vera license) that explicitly permits
embedding, modification, and redistribution, including for commercial use,
without royalty. Full license text: https://dejavu-fonts.github.io/License.html

Note: DejaVu Sans does not include Devanagari, CJK, or several other
non-Latin scripts. If the platform needs to render exam papers containing
those scripts (e.g. Hindi-language transcriptions), an additional font
(e.g. Noto Sans Devanagari) should be bundled the same way and registered
in pdf.template.js alongside the default font.
