import type { Feature, Project } from '../model/types';
import { PRELIMINARY_WARNING, typeSpec } from '../model/constants';
import { courseRoute, pixelToWgs84 } from '../geo/projection';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function requireLonLat(project: Project, point: { x: number; y: number }): [number, number] {
  const ll = pixelToWgs84(project, point);
  if (!ll) {
    throw new Error('Il percorso non è esportabile in formato geografico: manca una georeferenziazione WGS84.');
  }
  return [Number(ll[0].toFixed(7)), Number(ll[1].toFixed(7))];
}

function pointLabel(feature: Feature): string {
  if (feature.type === 'control') return feature.code || feature.name || 'Controllo';
  return feature.type === 'start' ? 'Partenza' : 'Arrivo';
}

export function exportCourseGpx(project: Project): string {
  const route = courseRoute(project);
  if (!route.length) throw new Error('Nessun punto percorso da esportare. Aggiungere partenza, controlli o arrivo.');
  const points = route.map((entry) => ({
    feature: entry.feature,
    lonLat: requireLonLat(project, entry),
    label: pointLabel(entry.feature),
  }));
  const waypoints = points
    .map(
      ({ lonLat, label, feature }) =>
        `  <wpt lat="${lonLat[1]}" lon="${lonLat[0]}"><name>${esc(label)}</name><desc>${esc(feature.name)}${feature.verified ? ' — verificato sul campo' : ' — non verificato'} · Bozza preliminare Terrain / O</desc></wpt>`,
    )
    .join('\n');
  const routePoints = points
    .map(({ lonLat, label }) => `    <rtept lat="${lonLat[1]}" lon="${lonLat[0]}"><name>${esc(label)}</name></rtept>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Terrain / O" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${esc(project.name)} — percorso</name>
    <desc>${esc(PRELIMINARY_WARNING)}</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints}
  <rte>
    <name>${esc(project.name)} — percorso</name>
${routePoints}
  </rte>
</gpx>
`;
}

function kmlColor(hex: string, alpha = 'ff'): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `${alpha}${b}${g}${r}`.toLowerCase();
}

function coordinates(project: Project, points: Array<{ x: number; y: number }>): string {
  return points.map((p) => {
    const [lon, lat] = requireLonLat(project, p);
    return `${lon},${lat},0`;
  }).join(' ');
}

function desc(feature: Feature): string {
  return esc(
    `${feature.notes || typeSpec(feature.type).label} · ${feature.verified ? 'verificato sul campo' : 'NON verificato'} · fonte: ${feature.source ?? 'manual'} · Bozza preliminare Terrain / O`,
  );
}

export function exportProjectKml(project: Project): string {
  const availableTypes = [...new Set(project.features.filter((f) => f.kind !== 'point').map((f) => f.type))];
  const styles = availableTypes
    .map((type) => {
      const spec = typeSpec(type);
      const width = type === 'road' ? 3 : type === 'stream' ? 2 : 1.5;
      return `    <Style id="style-${esc(type)}"><LineStyle><color>${kmlColor(spec.color)}</color><width>${width}</width></LineStyle><PolyStyle><color>${kmlColor(spec.fill ?? spec.color, '66')}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`;
    })
    .join('\n');

  const folders: string[] = [];
  const areas = project.features.filter((f) => f.kind === 'area');
  const lines = project.features.filter((f) => f.kind === 'line');
  if (areas.length) {
    const placemarks = areas
      .map((feature) => {
        const holes = (feature.holes ?? [])
          .map((hole) => `<innerBoundaryIs><LinearRing><coordinates>${coordinates(project, hole)}</coordinates></LinearRing></innerBoundaryIs>`)
          .join('');
        return `      <Placemark><name>${esc(feature.name)}</name><styleUrl>#style-${esc(feature.type)}</styleUrl><description>${desc(feature)}</description><Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates(project, feature.coords)}</coordinates></LinearRing></outerBoundaryIs>${holes}</Polygon></Placemark>`;
      })
      .join('\n');
    folders.push(`    <Folder><name>Aree</name>\n${placemarks}\n    </Folder>`);
  }
  if (lines.length) {
    const placemarks = lines
      .map(
        (feature) =>
          `      <Placemark><name>${esc(feature.name)}</name><styleUrl>#style-${esc(feature.type)}</styleUrl><description>${desc(feature)}</description><LineString><tessellate>1</tessellate><coordinates>${coordinates(project, feature.coords)}</coordinates></LineString></Placemark>`,
      )
      .join('\n');
    folders.push(`    <Folder><name>Linee</name>\n${placemarks}\n    </Folder>`);
  }
  const course = courseRoute(project);
  if (course.length) {
    const waypoints = course
      .map((entry) => {
        const [lon, lat] = requireLonLat(project, entry);
        return `      <Placemark><name>${esc(pointLabel(entry.feature))}</name><styleUrl>#course-point</styleUrl><description>${desc(entry.feature)}</description><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark>`;
      })
      .join('\n');
    const routeLine = course.length > 1
      ? `      <Placemark><name>Percorso</name><styleUrl>#course-line</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coordinates(project, course)}</coordinates></LineString></Placemark>`
      : '';
    folders.push(`    <Folder><name>Percorso</name>\n${waypoints}\n${routeLine}\n    </Folder>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(project.name)} — Terrain / O</name>
    <description>${esc(PRELIMINARY_WARNING)}</description>
${styles}
    <Style id="course-point"><IconStyle><color>ff7e22ce</color><scale>1.1</scale></IconStyle></Style>
    <Style id="course-line"><LineStyle><color>ff9333ea</color><width>2.5</width></LineStyle></Style>
${folders.join('\n')}
  </Document>
</kml>
`;
}
