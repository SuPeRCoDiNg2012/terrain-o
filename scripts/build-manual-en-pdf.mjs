#!/usr/bin/env node
/**
 * Builds docs/Terrain-O-Manual-EN.pdf from docs/TUTORIAL.en.md.
 *
 * A small Markdown renderer for the subset used by the manual, printed through
 * the Chromium already installed for Playwright. No extra dependency.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'docs/TUTORIAL.en.md');
const outputPath = path.join(root, 'docs/Terrain-O-Manual-EN.pdf');
const markdown = fs
  .readFileSync(sourcePath, 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/## Contents\n[\s\S]*?\n---\n/, '');

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
  const lines = md.split('\n');
  const html = [];
  const headings = [];
  let index = 0;
  let list = null;
  let paragraph = [];

  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  const flush = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith('```')) {
      flush();
      closeList();
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) body.push(lines[index++]);
      index += 1;
      html.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      closeList();
      index += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      closeList();
      const level = heading[1].length;
      const id = `h-${headings.length}`;
      headings.push({ level, text: heading[2].trim(), id });
      html.push(`<h${level} id="${id}">${inline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flush();
      closeList();
      html.push('<hr />');
      index += 1;
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      closeList();
      const quote = [];
      while (index < lines.length && lines[index].startsWith('>')) quote.push(lines[index++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }
    if (line.trim().startsWith('|')) {
      flush();
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
      flush();
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
  flush();
  closeList();
  return { html: html.join('\n'), headings };
}

const { html: body, headings } = convert(markdown);
const sections = headings.filter((heading) => heading.level === 2);
const toc = sections.map((heading) => `<li><a href="#${heading.id}">${inline(heading.text)}</a></li>`).join('\n');
const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

const styles = `
  @page { size: A4; margin: 20mm 18mm; }
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
  h2 { font-size: 19pt; margin: 0 0 5mm; padding-bottom: 2mm; border-bottom: 1.4pt solid #16211c; page-break-before: always; }
  h3 { font-size: 13pt; margin: 8mm 0 2.5mm; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3.5mm; padding-left: 6mm; }
  li { margin: 0 0 1.2mm; }
  code { background: #eef1ee; border: .3pt solid #d5dbd6; border-radius: 1.2mm; padding: 0 .8mm; font-size: 9pt; font-family: "Cascadia Mono", Consolas, monospace; }
  pre { background: #f4f6f4; border-left: 2.2pt solid #16211c; padding: 3mm 4mm; font-size: 8.6pt; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.3pt; }
  thead { display: table-header-group; }
  th { text-align: left; background: #16211c; color: #f2f5f2; padding: 1.8mm 2.2mm; }
  td { padding: 1.6mm 2.2mm; border-bottom: .4pt solid #d5dbd6; vertical-align: top; }
  tr { break-inside: avoid; }
  blockquote { margin: 0 0 5mm; padding: 3mm 4mm; background: #f6f3ea; border-left: 2.5pt solid #b9a27a; color: #4a4230; }
  hr { border: none; border-top: .5pt solid #d5dbd6; margin: 6mm 0; }
  h1, h2, h3, h4 { color: #16211c; line-height: 1.2; break-after: avoid; }
  a { color: #1f5c46; text-decoration: none; }
`;

const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Terrain / O — Manual</title><style>${styles}</style></head>
<body>
  <section class="cover">
    <span class="eyebrow">User manual · English edition</span>
    <h1>Terrain / O</h1>
    <p class="subtitle">Preliminary orienteering map editor: interface, tools, classification, vectorization and export, function by function and key by key.</p>
    <p class="meta">Version 0.5.0 · ${escapeHtml(today)} · generated from docs/TUTORIAL.en.md</p>
    <span class="draft">PRELIMINARY DRAFT — NOT VALID FOR COMPETITION</span>
  </section>
  <section class="toc"><h2>Contents</h2><ol>${toc}</ol></section>
  ${body}
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(document, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size:7pt;color:#7a857d;width:100%;padding:0 18mm;display:flex;justify-content:space-between;"><span>Terrain / O — Manual</span><span>Preliminary draft</span></div>',
    footerTemplate:
      '<div style="font-size:7pt;color:#7a857d;width:100%;padding:0 18mm;display:flex;justify-content:space-between;"><span>Version 0.5.0</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
    margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
  });
} finally {
  await browser.close();
}

const stat = fs.statSync(outputPath);
console.log(`English manual PDF: ${path.relative(root, outputPath)} (${Math.round(stat.size / 1024)} KB, ${sections.length} sections)`);
