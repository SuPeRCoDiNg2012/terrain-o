#!/usr/bin/env node
/**
 * Builds docs/Terrain-O-Manuale.pdf from docs/TUTORIAL.md.
 *
 * Small Markdown reader for the subset used by the manual (headings, paragraphs,
 * lists, tables, quotes, rules, fenced code and inline emphasis). Rendering uses
 * the Chromium already installed for Playwright, so no extra dependency is added.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'docs/TUTORIAL.md');
const outputPath = path.join(root, 'docs/Terrain-O-Manuale.pdf');
const rawMarkdown = fs.readFileSync(sourcePath, 'utf8');
// The manual's own index duplicates the generated two-column TOC in print.
const markdown = rawMarkdown.replace(/## Indice\n[\s\S]*?\n---\n/, '');

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function convert(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const headings = [];
  let index = 0;
  let list = null;
  let paragraph = [];

  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith('```')) {
      flushParagraph();
      closeList();
      const language = line.slice(3).trim();
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) body.push(lines[index++]);
      index += 1;
      html.push(`<pre class="code"><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const id = `h-${headings.length}`;
      headings.push({ level, text: heading[2].trim(), id });
      html.push(`<h${level} id="${id}">${inline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push('<hr />');
      index += 1;
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      closeList();
      const quote = [];
      while (index < lines.length && lines[index].startsWith('>')) quote.push(lines[index++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (line.trim().startsWith('|')) {
      flushParagraph();
      closeList();
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(lines[index++].trim());
      const cells = rows
        .filter((row) => !/^\|[\s:|-]+\|$/.test(row))
        .map((row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
      if (cells.length) {
        const [header, ...body] = cells;
        html.push('<table><thead><tr>');
        for (const cell of header) html.push(`<th>${inline(cell)}</th>`);
        html.push('</tr></thead><tbody>');
        for (const row of body) {
          html.push('<tr>');
          for (const cell of row) html.push(`<td>${inline(cell)}</td>`);
          html.push('</tr>');
        }
        html.push('</tbody></table>');
      }
      continue;
    }

    const ordered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ordered || unordered) {
      flushParagraph();
      const wanted = ordered ? 'ol' : 'ul';
      if (list !== wanted) {
        closeList();
        html.push(`<${wanted}>`);
        list = wanted;
      }
      html.push(`<li>${inline((ordered ? ordered[2] : unordered[1]).trim())}</li>`);
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph();
  closeList();
  return { html: html.join('\n'), headings };
}

const { html: body, headings } = convert(markdown);
const sections = headings.filter((heading) => heading.level === 2);
const toc = sections.map((heading) => `<li><a href="#${heading.id}">${inline(heading.text)}</a></li>`).join('\n');
const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

const styles = `
  @page { size: A4; margin: 20mm 18mm 20mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #1b232b; }
  .cover { height: 248mm; display: flex; flex-direction: column; justify-content: center; border-left: 6mm solid #16211c; padding-left: 12mm; page-break-after: always; }
  .cover .eyebrow { letter-spacing: .18em; text-transform: uppercase; font-size: 8.5pt; color: #5c6b62; }
  .cover h1 { font-size: 34pt; line-height: 1.05; margin: 10mm 0 4mm; color: #16211c; }
  .cover .subtitle { font-size: 13pt; color: #3c4a42; max-width: 120mm; }
  .cover .meta { margin-top: 18mm; font-size: 9pt; color: #5c6b62; }
  .cover .draft { margin-top: 6mm; display: inline-block; border: 1px solid #b9a27a; color: #6d5733; padding: 2mm 4mm; font-size: 8.5pt; letter-spacing: .08em; }
  .toc { page-break-after: always; }
  .toc h2 { border: none; margin-top: 0; page-break-before: avoid; }
  .toc ol { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 10mm; }
  .toc li { font-size: 9.5pt; margin: 0 0 2mm; break-inside: avoid; }
  .toc a { color: #1b232b; text-decoration: none; }
  h1, h2, h3, h4 { color: #16211c; line-height: 1.2; break-after: avoid; }
  h2 { font-size: 19pt; margin: 0 0 5mm; padding-bottom: 2mm; border-bottom: 1.4pt solid #16211c; page-break-before: always; }
  h3 { font-size: 13pt; margin: 8mm 0 2.5mm; }
  h4 { font-size: 11pt; margin: 6mm 0 2mm; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3.5mm; padding-left: 6mm; }
  li { margin: 0 0 1.2mm; }
  code { background: #eef1ee; border: .3pt solid #d5dbd6; border-radius: 1.2mm; padding: 0 .8mm; font-size: 9pt; font-family: "Cascadia Mono", Consolas, monospace; }
  pre.code { background: #f4f6f4; border: .4pt solid #d5dbd6; border-left: 2.2pt solid #16211c; padding: 3mm 4mm; font-size: 8.6pt; line-height: 1.4; white-space: pre-wrap; break-inside: avoid; margin: 0 0 4mm; }
  pre.code code { background: none; border: none; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.3pt; }
  thead { display: table-header-group; }
  th { text-align: left; background: #16211c; color: #f2f5f2; font-weight: 600; padding: 1.8mm 2.2mm; }
  td { padding: 1.6mm 2.2mm; border-bottom: .4pt solid #d5dbd6; vertical-align: top; }
  tr { break-inside: avoid; }
  blockquote { margin: 0 0 5mm; padding: 3mm 4mm; background: #f6f3ea; border-left: 2.5pt solid #b9a27a; color: #4a4230; }
  hr { border: none; border-top: .5pt solid #d5dbd6; margin: 6mm 0; }
  a { color: #1f5c46; text-decoration: none; }
`;

const document = `<!doctype html>
<html lang="it"><head><meta charset="utf-8" /><title>Terrain / O — Manuale</title><style>${styles}</style></head>
<body>
  <section class="cover">
    <span class="eyebrow">Manuale utente</span>
    <h1>Terrain / O</h1>
    <p class="subtitle">Editor di mappe preliminari di orienteering: interfaccia, strumenti, classificazione, vettorizzazione ed export, funzione per funzione e tasto per tasto.</p>
    <p class="meta">Versione 0.5.0 · ${escapeHtml(today)} · generato da docs/TUTORIAL.md</p>
    <span class="draft">BOZZA PRELIMINARE — NON ATTA ALLA GARA</span>
  </section>
  <section class="toc"><h2>Indice</h2><ol>${toc}</ol></section>
  ${body}
</body></html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(document, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const header = '<div style="font-size:7pt;color:#7a857d;width:100%;padding:0 18mm;display:flex;justify-content:space-between;"><span>Terrain / O — Manuale</span><span>Bozza preliminare</span></div>';
  const footer = '<div style="font-size:7pt;color:#7a857d;width:100%;padding:0 18mm;display:flex;justify-content:space-between;"><span>Versione 0.5.0</span><span>Pagina <span class="pageNumber"></span> di <span class="totalPages"></span></span></div>';
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: header,
    footerTemplate: footer,
    margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
  });
} finally {
  await browser.close();
}

const stat = fs.statSync(outputPath);
console.log(`Manuale PDF: ${path.relative(root, outputPath)} (${Math.round(stat.size / 1024)} KB, ${sections.length} sezioni)`);
