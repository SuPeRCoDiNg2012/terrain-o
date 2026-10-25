import { jsPDF } from 'jspdf';
import type { Project } from '../model/types';
import type { RenderImages } from '../render/scene';
import { PRELIMINARY_WARNING, DEM_ATTRIBUTION, OSM_ATTRIBUTION } from '../model/constants';
import { metersPerPixel } from '../geo/projection';
import { projectLegend, renderMapCanvas } from './exportPng';

function niceBarMeters(target: number): number {
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return candidates.reduce((prev, cur) => (Math.abs(cur - target) < Math.abs(prev - target) ? cur : prev), candidates[0]);
}

export async function exportProjectPdf(
  project: Project,
  images: RenderImages,
  format: 'a4' | 'a3' = 'a4',
): Promise<Blob> {
  if (!project.image) throw new Error('Nessuna immagine sorgente da esportare.');
  const { canvas } = renderMapCanvas(project, images, 2);
  const mapDataURL = canvas.toDataURL('image/jpeg', 0.9);
  const orientation = project.image.width >= project.image.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = format === 'a3' ? 14 : 10;
  doc.setProperties({
    title: `${project.name} — Terrain / O (bozza preliminare)`,
    subject: 'Bozza preliminare di mappa di orienteering. Non atta alla gara, non conforme IOF.',
    creator: 'Terrain / O',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(format === 'a3' ? 20 : 16);
  doc.setTextColor(23, 35, 29);
  doc.text(project.name, margin, margin + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(format === 'a3' ? 10 : 8);
  doc.setTextColor(91, 102, 95);
  const mp = metersPerPixel(project);
  doc.text(
    `Scala 1:${project.printScale} · ${project.image.width}×${project.image.height} px · ${new Date().toLocaleDateString('it-IT')}${mp ? ` · ${mp.toFixed(2)} m/px` : ' · scala non georeferenziata'}`,
    margin,
    margin + 10,
  );
  doc.setTextColor(124, 58, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('BOZZA PRELIMINARE — NON ATTA ALLA GARA', pageWidth - margin, margin + 4, { align: 'right' });

  const footerHeight = format === 'a3' ? 58 : 46;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - 18 - footerHeight;
  const imageRatio = canvas.width / canvas.height;
  let drawWidth = availableWidth;
  let drawHeight = drawWidth / imageRatio;
  if (drawHeight > availableHeight) {
    drawHeight = availableHeight;
    drawWidth = drawHeight * imageRatio;
  }
  const imageX = margin + (availableWidth - drawWidth) / 2;
  const imageY = margin + 16;
  doc.addImage(mapDataURL, 'JPEG', imageX, imageY, drawWidth, drawHeight);
  doc.setDrawColor(39, 54, 46);
  doc.setLineWidth(0.4);
  doc.rect(imageX, imageY, drawWidth, drawHeight);

  if (mp) {
    const meters = niceBarMeters((drawWidth / 4) * mp);
    const barWidth = (meters / mp) * (drawWidth / project.image.width);
    const barX = imageX + 6;
    const barY = imageY + drawHeight - 6;
    doc.setDrawColor(17, 24, 39);
    doc.setLineWidth(0.5);
    doc.line(barX, barY, barX + barWidth, barY);
    doc.line(barX, barY - 1.5, barX, barY + 1.5);
    doc.line(barX + barWidth, barY - 1.5, barX + barWidth, barY + 1.5);
    doc.setFontSize(7);
    doc.setTextColor(17, 24, 39);
    doc.text(`${meters} m`, barX + barWidth / 2, barY - 2, { align: 'center' });
  }

  if (project.showNorth) {
    const cx = imageX + drawWidth - 12;
    const cy = imageY + 14;
    doc.setFillColor(17, 24, 39);
    doc.triangle(cx, cy - 7, cx + 3.5, cy + 4, cx - 3.5, cy + 4, 'F');
    doc.setFontSize(7);
    doc.text('N', cx, cy - 9, { align: 'center' });
  }

  let y = imageY + drawHeight + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(92, 44, 0);
  const warningLines = doc.splitTextToSize(PRELIMINARY_WARNING, availableWidth);
  doc.text(warningLines, margin, y);
  y += warningLines.length * 3.6 + 3;

  const legend = projectLegend(project);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 57);
  let legendX = margin;
  for (const item of legend.slice(0, 8)) {
    if (legendX > pageWidth - margin - 34) break;
    doc.setFillColor(item.color);
    doc.rect(legendX, y - 2.2, 3.6, 2.8, 'F');
    doc.text(`${item.label} (${item.count})`, legendX + 4.8, y);
    legendX += 5 + doc.getTextWidth(`${item.label} (${item.count})`) + 6;
  }
  y += 5;

  const verified = project.features.filter((f) => f.verified).length;
  const total = project.features.length;
  const attribution: string[] = [];
  if (project.osmWays.length || project.features.some((f) => f.source === 'osm')) attribution.push(OSM_ATTRIBUTION);
  if (project.contours.length) attribution.push(DEM_ATTRIBUTION);
  doc.setTextColor(91, 102, 95);
  doc.setFontSize(6.7);
  doc.text(
    `Elementi ${total} · verificati ${verified} · non verificati ${total - verified}. Interpretazione automatica sperimentale. ${attribution.join(' · ')}`,
    margin,
    y,
  );
  y += 3.4;
  doc.text(
    'Percorribilità, vegetazione sotto copertura, sicurezza del terreno, quota di precisione e conformità IOF non sono dichiarate.',
    margin,
    y,
  );
  doc.setTextColor(126, 34, 206);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Terrain / O', pageWidth - margin, pageHeight - margin + 1, { align: 'right' });

  return doc.output('blob');
}
