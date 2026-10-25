import type { Project, ProjectFile } from '../model/types';
import { APP_VERSION } from '../model/constants';
import { parseProjectFile, validateProjectFile } from '../model/schema';
import { getAsset, putAsset, saveProject } from '../persistence/db';
import { base64ToLabels, loadImageElement } from '../render/canvas';

export async function buildProjectFile(project: Project): Promise<ProjectFile> {
  if (!project.image) {
    throw new Error('Il progetto non contiene un\'immagine sorgente da esportare.');
  }
  const source = await getAsset(project.image.assetId);
  if (!source?.dataURL) throw new Error('Asset immagine mancante: il progetto è incompleto.');
  const assets: ProjectFile['assets'] = [
    {
      id: project.image.assetId,
      kind: 'source',
      mimeType: source.mimeType ?? 'image/jpeg',
      dataURL: source.dataURL,
      width: source.width,
      height: source.height,
    },
  ];
  if (project.classification) {
    const overlay = await getAsset(project.classification.assetId);
    if (overlay?.dataURL) {
      assets.push({
        id: project.classification.assetId,
        kind: 'classification',
        mimeType: overlay.mimeType ?? 'image/png',
        dataURL: overlay.dataURL,
        width: overlay.width,
        height: overlay.height,
      });
    }
    const labels = await getAsset(`${project.classification.assetId}:labels`);
    if (labels?.data) {
      const bytes = new Uint8Array(labels.data);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      assets.push({
        id: `${project.classification.assetId}:labels`,
        kind: 'labels',
        labelsBase64: btoa(binary),
        width: labels.width,
        height: labels.height,
      });
    }
  }
  return validateProjectFile(project, assets);
}

export function projectFileToJSON(file: ProjectFile): string {
  return JSON.stringify(file, null, 2);
}

export interface ImportedProjectData {
  project: Project;
  sourceImage: HTMLImageElement;
  classificationImage: HTMLImageElement | null;
  labels: Uint8Array | null;
  warnings: string[];
}

function assertDataURL(value: string, id: string): void {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(value)) {
    throw new Error(`Asset ${id} non è un data URL immagine valido.`);
  }
}

export async function importProjectFileObject(raw: unknown): Promise<ImportedProjectData> {
  const { project, assets } = parseProjectFile(raw);
  if (!project.image) throw new Error('Il file di progetto non contiene un\'immagine sorgente.');
  const sourceAsset = assets.find((asset) => asset.id === project.image!.assetId && asset.kind === 'source');
  if (!sourceAsset?.dataURL) throw new Error('Asset immagine sorgente mancante nel file.');
  assertDataURL(sourceAsset.dataURL, sourceAsset.id);
  const sourceImage = await loadImageElement(sourceAsset.dataURL);
  const warnings: string[] = [];
  let classificationImage: HTMLImageElement | null = null;
  let labels: Uint8Array | null = null;
  if (project.classification) {
    const overlay = assets.find((asset) => asset.id === project.classification!.assetId);
    if (!overlay?.dataURL) {
      warnings.push('Classificazione dichiarata ma asset grafico mancante: livello classificazione rimosso.');
      project.classification = null;
      project.layers.classification.visible = false;
    } else {
      assertDataURL(overlay.dataURL, overlay.id);
      classificationImage = await loadImageElement(overlay.dataURL);
      const labelsAsset = assets.find((asset) => asset.id === `${project.classification!.assetId}:labels`);
      if (labelsAsset?.labelsBase64) {
        labels = base64ToLabels(labelsAsset.labelsBase64);
      } else {
        warnings.push('Asset etichette di classificazione mancante: la vettorizzazione richiederà una nuova classificazione.');
      }
    }
  }

  // Persist extracted assets only after all validation and decoding succeeded.
  await putAsset({
    id: sourceAsset.id,
    kind: 'source',
    mimeType: sourceAsset.mimeType ?? 'image/jpeg',
    dataURL: sourceAsset.dataURL,
    width: sourceAsset.width ?? project.image.width,
    height: sourceAsset.height ?? project.image.height,
    createdAt: new Date().toISOString(),
  });
  if (project.classification) {
    const overlay = assets.find((asset) => asset.id === project.classification!.assetId)!;
    await putAsset({
      id: project.classification.assetId,
      kind: 'classification',
      mimeType: overlay.mimeType ?? 'image/png',
      dataURL: overlay.dataURL,
      width: overlay.width ?? project.classification.width,
      height: overlay.height ?? project.classification.height,
      createdAt: new Date().toISOString(),
    });
    if (labels) {
      const labelsAsset = assets.find((asset) => asset.id === `${project.classification!.assetId}:labels`)!;
      await putAsset({
        id: `${project.classification.assetId}:labels`,
        kind: 'labels',
        data: labels.slice().buffer,
        width: labelsAsset.width,
        height: labelsAsset.height,
        createdAt: new Date().toISOString(),
      });
    }
  }
  project.updatedAt = new Date().toISOString();
  await saveProject(project);
  return { project, sourceImage, classificationImage, labels, warnings };
}

export async function importProjectFile(file: File): Promise<ImportedProjectData> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('Impossibile leggere il file di progetto.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Il file non è JSON valido o è danneggiato.');
  }
  try {
    return await importProjectFileObject(raw);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Importazione non riuscita: ${error.message} Il progetto attualmente aperto non è stato modificato.`
        : 'Importazione non riuscita. Il progetto attualmente aperto non è stato modificato.',
    );
  }
}

export function suggestedProjectFilename(project: Project): string {
  const slug = project.name
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${slug || 'terrain-o'}.terrain-o.json`;
}

export const PROJECT_APP_VERSION = APP_VERSION;
