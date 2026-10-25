export interface GpxWaypoint {
  lat: number;
  lon: number;
  name: string;
  description: string;
  code?: string;
}

export function parseGpx(xmlText: string): GpxWaypoint[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Il file GPX non è un XML valido.');
  }
  const nodes = [...doc.querySelectorAll('wpt, rtept, trkpt')];
  const seen = new Set<string>();
  const waypoints: GpxWaypoint[] = [];
  for (const node of nodes) {
    const lat = Number(node.getAttribute('lat'));
    const lon = Number(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = node.querySelector('name')?.textContent?.trim() ?? '';
    const description = node.querySelector('desc')?.textContent?.trim() ?? '';
    const codeMatch = name.match(/(?:^|\s)([A-Za-z]?\d{1,4})(?:\s|$)/);
    waypoints.push({
      lat,
      lon,
      name: name || `WP ${waypoints.length + 1}`,
      description,
      code: codeMatch?.[1],
    });
  }
  if (!waypoints.length) throw new Error('Il file GPX non contiene waypoint, punti di rotta o traccia.');
  return waypoints;
}
