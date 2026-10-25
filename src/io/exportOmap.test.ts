import { describe, expect, it } from 'vitest';
import { createFeature } from '../model/constants';
import type { Project } from '../model/types';
import { makeTestProject } from '../test/fixtures';
import { exportProjectOmap } from './exportOmap';

const UTM32_WKT =
  'PROJCS["WGS 84 / UTM zone 32N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",9],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","32632"]]';

function omapProject(): Project {
  const project = makeTestProject({
    worldFile: { A: 0.5, D: 0, B: 0, E: -0.5, C: 430000, F: 5000000 },
    projectionWKT: UTM32_WKT,
    projectionSource: 'wkt',
    imageBBox: { west: 8.1, south: 45.1, east: 8.2, north: 45.2 },
    printScale: 1000,
  });
  project.calibration = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    meters: 100,
    mPerPx: 1,
    method: 'two-point',
  };
  return project;
}

describe('exportProjectOmap', () => {
  it('keeps image orientation: OOM map coordinates grow right and down', () => {
    const project = omapProject();
    project.features = [
      createFeature('line', 'path', [
        { x: 100, y: 100 },
        { x: 200, y: 250 },
      ]),
    ];
    const xml = exportProjectOmap(project);
    const coords = xml.match(/<coords count="2">([^<]+)<\/coords>/)?.[1] ?? '';
    // 1 mm per pixel: image (100,100) -> (100000,100000), (200,250) -> (200000,250000).
    expect(coords).toBe('100000 100000;200000 250000;');
  });

  it('anchors the projected CRS at the top-left image corner', () => {
    const xml = exportProjectOmap(omapProject());
    expect(xml).toContain('<ref_point x="0" y="0"/>');
    expect(xml).toContain('<projected_crs id="EPSG:32632">');
    expect(xml).toContain('<ref_point x="430000.000000" y="5000000.000000"/>');
  });

  it('writes a geographic CRS for a WGS84 world file', () => {
    const project = makeTestProject({ projectionWKT: null, projectionSource: 'assumed-wgs84' });
    project.calibration = null;
    const xml = exportProjectOmap(project);
    expect(xml).toContain('<projected_crs id="Geographic coordinates">');
    expect(xml).toContain('+proj=longlat +datum=WGS84 +no_defs');
    expect(xml).toContain('<ref_point x="11.00000000" y="46.00000000"/>');
    expect(xml).not.toContain('<projected_crs id="Local"/>');
  });

  it('closes the outline without marking it as a hole', () => {
    const project = omapProject();
    const area = createFeature(
      'area',
      'forest',
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 260 },
        { x: 100, y: 260 },
      ],
      {
        holes: [
          [
            { x: 150, y: 150 },
            { x: 180, y: 150 },
            { x: 180, y: 180 },
            { x: 150, y: 180 },
          ],
        ],
      },
    );
    project.features = [area];
    const xml = exportProjectOmap(project);
    const coords = xml.match(/<coords count="10">([^<]+)<\/coords>/)?.[1] ?? '';
    expect(coords).toContain('100000 100000 2;');
    expect(coords).toContain('150000 150000 18;');
    expect(coords).not.toContain('100000 100000 18;');
  });
});
