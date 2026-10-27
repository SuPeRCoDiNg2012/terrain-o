// Extracts the complete official OpenOrienteering Mapper symbol sets so the
// .omap export ships the same 191/185 symbols users see in Mapper, not a
// reduced placeholder palette. Run with the two official files:
//   node scripts/build-omap-symbols.mjs <ISOM.omap> <ISSprOM.omap>
import fs from 'node:fs';
import path from 'node:path';

const [isomPath, isspromPath] = process.argv.slice(2);
if (!isomPath || !isspromPath) {
  console.error('Usage: node scripts/build-omap-symbols.mjs <ISOM.omap> <ISSprOM.omap>');
  process.exit(1);
}

function balancedSymbolEnd(source, start) {
  const tags = /<symbol\b|<\/symbol>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    if (match[0] === '<symbol') depth++;
    else {
      depth--;
      if (depth === 0) return match.index + match[0].length;
    }
  }
  throw new Error('Unclosed <symbol> element');
}

function extract(file) {
  const source = fs.readFileSync(file, 'utf8');
  const colorsOpen = source.match(/<colors[^>]*>/);
  const colorsClose = source.indexOf('</colors>');
  if (!colorsOpen || colorsClose < 0) throw new Error(`No colors in ${file}`);
  const colors = source.slice(colorsOpen.index, colorsClose + '</colors>'.length);
  const symbols = [];
  // Only outer symbols carry an id; nested inline symbols do not.
  const openTags = /<symbol type="(\d+)" id="(\d+)"[^>]*>/g;
  for (const open of source.matchAll(openTags)) {
    const end = balancedSymbolEnd(source, open.index);
    const xml = source
      .slice(open.index, end)
      .replace(/<description>[\s\S]*?<\/description>/g, '')
      .replace(/<icon[\s\S]*?\/>/g, '')
      .replace(/>\s+</g, '><');
    const code = xml.match(/ code="([^"]*)"/)?.[1] ?? '';
    const name = xml.match(/ name="([^"]*)"/)?.[1] ?? code;
    symbols.push({ id: Number(open[2]), type: Number(open[1]), code, name, xml });
  }
  return { colors, symbols };
}

const isom = extract(isomPath);
const issprom = extract(isspromPath);

const out = `/*
 * Official OpenOrienteering Mapper symbol sets for ISOM 2017-2 and
 * ISSprOM 2019-2. Descriptions and icons are omitted to keep the bundle
 * small; every symbol definition, colour and id is preserved so the .omap
 * export opens with the complete official palette. The source symbol sets are
 * published by OpenOrienteering Mapper under GPL-3.0; see NOTICE.md.
 * Do not edit by hand: regenerate with scripts/build-omap-symbols.mjs.
 */

export interface OmapSymbolDefinition {
  id: number;
  type: number;
  code: string;
  name: string;
  xml: string;
}

export interface OmapSymbolSet {
  label: string;
  colors: string;
  symbols: OmapSymbolDefinition[];
}

export const ISOM_SYMBOL_SET: OmapSymbolSet = {
  label: 'ISOM 2017-2',
  colors: ${JSON.stringify(isom.colors)},
  symbols: ${JSON.stringify(isom.symbols, null, 2)},
};

export const ISSPROM_SYMBOL_SET: OmapSymbolSet = {
  label: 'ISSprOM 2019-2',
  colors: ${JSON.stringify(issprom.colors)},
  symbols: ${JSON.stringify(issprom.symbols, null, 2)},
};
`;

const target = path.resolve('src/io/omapSymbolSets.ts');
fs.writeFileSync(target, out);
console.log(`Wrote ${target}: ISOM ${isom.symbols.length} symbols, ISSprOM ${issprom.symbols.length} symbols`);
