import type { Project } from '../model/types';
import {
  MAX_IMAGE_SIDE,
  createEmptyProject,
  makeVerificationEvent,
} from '../model/constants';
import { buildGeoreference, validateWKT } from '../geo/projection';
import { parseWorldFile, scaleWorldFile } from '../geo/worldfile';
import {
  loadImageElement,
  readFileAsDataURL,
  readFileAsText,
  resizeImageToDataURL,
} from '../render/canvas';
import { deleteAsset, putAsset, saveProject } from '../persistence/db';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);
const WORLD_EXTENSIONS = new Set(['jgw', 'jpgw', 'pgw', 'pngw', 'wld']);
const PRJ_EXTENSIONS = new Set(['prj', 'aux']);

export class ImportCancelledError extends Error {
  constructor() {
    super('Importazione annullata');
    this.name = 'ImportCancelledError';
  }
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel?: string;
}

export interface PreparedImport {
  project: Project;
  sourceImage: HTMLImageElement;
  imageDataURL: string;
  warnings: string[];
  oldAssetIds: string[];
}

function extensionOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

function isImage(file: File): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(file));
}

function isWorldFile(file: File): boolean {
  return WORLD_EXTENSIONS.has(extensionOf(file));
}

function isPrj(file: File): boolean {
  return PRJ_EXTENSIONS.has(extensionOf(file));
}

function warnMultiple(files: File[], what: string, warnings: string[]): void {
  if (files.length > 1) warnings.push(`Più ${what} selezionati: usato ${files[0].name}.`);
}

export async function prepareProjectImport(
  files: File[],
  existing: Project | null,
  confirm: (request: ConfirmRequest) => Promise<boolean>,
  onProgress?: (phase: string) => void,
): Promise<PreparedImport> {
  const warnings: string[] = [];
  const imageFiles = files.filter(isImage);
  const worldFiles = files.filter(isWorldFile);
  const prjFiles = files.filter(isPrj);
  if (imageFiles.length === 0) {
    throw new Error('Selezionare un\'immagine JPG o PNG (insieme a world file e .prj se disponibili).');
  }
  if (imageFiles.length > 1) {
    throw new Error('È possibile importare una sola immagine per progetto.');
  }
  warnMultiple(worldFiles, 'world file', warnings);
  warnMultiple(prjFiles, 'file di proiezione', warnings);
  const imageFile = imageFiles[0];
  if (!['image/jpeg', 'image/png'].includes(imageFile.type) && imageFile.type !== '') {
    throw new Error(`Formato immagine non supportato: ${imageFile.type}. Usare JPG o PNG.`);
  }

  onProgress?.('Decodifica immagine');
  let rawURL: string;
  try {
    rawURL = await readFileAsDataURL(imageFile);
  } catch (error) {
    throw new Error(`Impossibile leggere ${imageFile.name}: ${error instanceof Error ? error.message : 'errore sconosciuto'}`);
  }
  let probe: HTMLImageElement;
  try {
    probe = await loadImageElement(rawURL);
  } catch {
    throw new Error(
      `L'immagine ${imageFile.name} non è decodificabile o è danneggiata. Verificare il file e riprovare.`,
    );
  }
  const originalWidth = probe.naturalWidth;
  const originalHeight = probe.naturalHeight;
  if (originalWidth < 2 || originalHeight < 2) throw new Error('L\'immagine è troppo piccola per essere utilizzata.');

  if (existing?.image) {
    const proceed = await confirm({
      title: 'Sostituire l\'immagine sorgente?',
      body:
        'La sostituzione azzera la cronologia undo e la classificazione, e riproporziona gli oggetti se le dimensioni cambiano. ' +
        'La verifica degli elementi interessati da un cambio di scala viene revocata con nota storica. L\'operazione non può essere annullata.',
      confirmLabel: 'Sostituisci immagine',
    });
    if (!proceed) throw new ImportCancelledError();
  }

  let width = originalWidth;
  let height = originalHeight;
  if (Math.max(originalWidth, originalHeight) > MAX_IMAGE_SIDE) {
    const ratio = MAX_IMAGE_SIDE / Math.max(originalWidth, originalHeight);
    width = Math.max(1, Math.round(originalWidth * ratio));
    height = Math.max(1, Math.round(originalHeight * ratio));
    const proceed = await confirm({
      title: 'Immagine molto grande',
      body:
        `L'immagine è ${originalWidth}×${originalHeight} px. Per restare nei limiti operativi verrà ridimensionata a ` +
        `${width}×${height} px (lato massimo ${MAX_IMAGE_SIDE} px), con ricalcolo di scala, world file e coordinate. ` +
        'La qualità dell\'ortofoto sarà ridotta.',
      confirmLabel: `Ridimensiona a ${width}×${height}`,
    });
    if (!proceed) throw new ImportCancelledError();
  }

  onProgress?.('Compressione immagine');
  const imageDataURL = resizeImageToDataURL(
    probe,
    originalWidth,
    originalHeight,
    width,
    height,
    'image/jpeg',
    0.85,
  );
  let sourceImage: HTMLImageElement;
  try {
    sourceImage = await loadImageElement(imageDataURL);
  } catch {
    throw new Error('Impossibile preparare l\'immagine compressa.');
  }

  let worldFileText: string | null = null;
  if (worldFiles.length) {
    worldFileText = await readFileAsText(worldFiles[0]);
  }
  let worldFile = null;
  if (worldFileText) {
    try {
      worldFile = parseWorldFile(worldFileText);
    } catch (error) {
      throw new Error(`World file non valido (${worldFiles[0].name}): ${error instanceof Error ? error.message : 'formato errato'}`);
    }
  } else {
    warnings.push('Nessun world file: nessuna georeferenziazione. Le misure saranno in pixel.');
  }

  let projectionWKT: string | null = null;
  if (prjFiles.length) {
    const prjText = (await readFileAsText(prjFiles[0])).trim();
    const validation = validateWKT(prjText);
    if (validation.ok) projectionWKT = prjText;
    else warnings.push(`Il file .prj non è un WKT valido (${validation.error ?? 'errore'}): georeferenziazione non disponibile.`);
  }

  const scaledWorldFile = worldFile ? scaleWorldFile(worldFile, width / originalWidth, height / originalHeight) : null;
  const georeference = buildGeoreference(scaledWorldFile, projectionWKT, width, height);
  warnings.push(...georeference.warnings);

  const project = existing ? structuredClone(existing) : createEmptyProject(imageFile.name.replace(/\.[^.]+$/, ''));
  const oldAssetIds: string[] = [];
  if (existing?.image) oldAssetIds.push(existing.image.assetId);
  if (existing?.classification) {
    oldAssetIds.push(existing.classification.assetId, `${existing.classification.assetId}:labels`);
  }

  const previousWidth = existing?.image?.width ?? width;
  const previousHeight = existing?.image?.height ?? height;
  const scaleX = width / previousWidth;
  const scaleY = height / previousHeight;
  const scaling = Math.abs(scaleX - 1) > 1e-9 || Math.abs(scaleY - 1) > 1e-9;

  project.image = {
    assetId: 'pending',
    name: imageFile.name,
    width,
    height,
    originalWidth,
    originalHeight,
    mimeType: 'image/jpeg',
  };
  project.worldFile = scaledWorldFile;
  project.projectionWKT = projectionWKT;
  project.projectionSource = georeference.projectionSource;
  project.imageBBox = georeference.imageBBox;
  project.geoWarnings = warnings;
  project.updatedAt = new Date().toISOString();

  if (existing?.image) {
    project.classification = null;
    project.layers.classification.visible = false;
    project.osmWays = [];
    project.layers.osm.visible = false;
    project.contours = [];
    project.layers.contours.visible = false;
    project.calibration = null;
    if (existing.calibration) warnings.push('Calibrazione manuale azzerata: ricalibrare la nuova immagine sorgente.');
    if (scaling) {
      const transform = (p: { x: number; y: number }) => ({ x: p.x * scaleX, y: p.y * scaleY });
      project.features = project.features.map((feature) => {
        const scaled = {
          ...feature,
          coords: feature.coords.map(transform),
          holes: feature.holes?.map((ring) => ring.map(transform)),
        };
        if (feature.verified && scaling) {
          scaled.history = [
            ...feature.history,
            makeVerificationEvent('revoked', feature.verifiedNote, 'Sostituzione immagine con cambio di scala'),
          ];
          scaled.verified = false;
          scaled.verifiedNote = '';
        }
        return scaled;
      });
      warnings.push(
        `Oggetti riproporzionati da ${previousWidth}×${previousHeight} a ${width}×${height} px (${scaleX.toFixed(3)}×, ${scaleY.toFixed(3)}×).`,
      );
    }
  }

  project.geoWarnings = [...new Set(warnings)];
  return { project, sourceImage, imageDataURL, warnings: project.geoWarnings, oldAssetIds };
}

export async function importImageFiles(
  files: File[],
  existing: Project | null,
  confirm: (request: ConfirmRequest) => Promise<boolean>,
  onProgress?: (phase: string) => void,
): Promise<PreparedImport> {
  const prepared = await prepareProjectImport(files, existing, confirm, onProgress);
  const assetId = crypto.randomUUID();
  onProgress?.('Salvataggio in IndexedDB');
  await putAsset({
    id: assetId,
    kind: 'source',
    mimeType: 'image/jpeg',
    dataURL: prepared.imageDataURL,
    width: prepared.project.image?.width,
    height: prepared.project.image?.height,
    createdAt: new Date().toISOString(),
  });
  if (prepared.project.image) prepared.project.image.assetId = assetId;
  prepared.project.updatedAt = new Date().toISOString();
  await saveProject(prepared.project);
  // Old assets become unreachable after replacing the source; clean them up.
  for (const id of prepared.oldAssetIds) {
    if (id && id !== assetId) await deleteAsset(id).catch(() => undefined);
  }
  return prepared;
}
