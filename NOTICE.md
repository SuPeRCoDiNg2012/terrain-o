# Third-party notices

## OpenOrienteering Mapper symbol sets

`src/io/omapSymbolSets.ts` contains the symbol geometry, colour tables and
symbol identifiers extracted from the official OpenOrienteering Mapper symbol
sets for:

- **ISOM 2017-2** (191 symbols);
- **ISSprOM 2019-2** (185 symbols).

Source: <https://github.com/OpenOrienteering/mapper> — files
`src/symbols/ISOM 2017-2_15000.omap` and
`src/symbols/ISSprOM 2019_4000.omap` (names may vary slightly by release).
OpenOrienteering Mapper is distributed under the **GNU General Public License
version 3 (GPL-3.0)**: <https://www.gnu.org/licenses/gpl-3.0.html>.

The definitions are bundled so exported `.omap` files open with the complete
official palette. Descriptions and icon bitmaps from the source sets are not
included. The generated file is produced by
[`scripts/build-omap-symbols.mjs`](scripts/build-omap-symbols.mjs) and must not
be edited by hand.

If you redistribute Terrain / O with these symbol definitions, comply with the
GPL-3.0 for that data and preserve this notice. The application source code is
not relicensed by this notice.

## IOF specifications

The symbol codes and dimensions were checked against the official
International Orienteering Federation publications:

- **ISOM 2017-2** — International Specification for Orienteering Maps;
- **ISSprOM 2019-2** — International Specification for Sprint Orienteering Maps.

The PDF specifications themselves are not bundled in this repository. They are
copyright of the International Orienteering Federation and are referenced for
interoperability only.
