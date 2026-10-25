import type { Project } from '../model/types';
import { ringArea, validateRegions } from '../vectorize/topology';

/**
 * Every GeoJSON/OMAP export must be topologically valid. Areas are the only
 * geometries with closed rings; lines and points are passed through unchanged.
 * The message names the offending feature so the user can fix it instead of
 * receiving a corrupt file.
 */
export function projectTopologyProblems(project: Project): string[] {
  const areas = project.features.filter((feature) => feature.kind === 'area' && feature.coords.length > 0);
  const problems = validateRegions(
    areas.map((feature) => ({
      featureType: `${feature.name || feature.type} (${feature.id.slice(0, 8)})`,
      coords: feature.coords,
      holes: feature.holes ?? [],
      area: Math.max(
        0,
        ringArea(feature.coords) - (feature.holes ?? []).reduce((sum, hole) => sum + ringArea(hole), 0),
      ),
    })),
  );
  return problems;
}

export function assertProjectTopology(project: Project, format: string): void {
  const problems = projectTopologyProblems(project);
  if (!problems.length) return;
  throw new Error(
    `${format}: topologia non valida in ${problems.length} geometri${problems.length === 1 ? 'a' : 'e'}. ` +
      `${problems[0]} Correggi l’elemento indicato nel pannello Proprietà e riprova.`,
  );
}
