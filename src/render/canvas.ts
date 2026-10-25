export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossibile decodificare l\'immagine.'));
    image.src = src;
  });
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}.`));
    reader.readAsText(file);
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D non disponibile in questo browser.');
  return ctx;
}

export function resizeImageToDataURL(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  quality = 0.85,
): string {
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = get2d(canvas);
  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mimeType, quality);
}

export function imageToImageData(image: HTMLImageElement, width: number, height: number): ImageData {
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export function rgbaToCanvas(rgba: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  const data = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function rgbaToDataURL(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  preferWebp = true,
): string {
  const canvas = rgbaToCanvas(rgba, width, height);
  const webp = preferWebp ? canvas.toDataURL('image/webp', 0.9) : '';
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/png');
}

export function dataUrlByteSize(dataURL: string): number {
  const comma = dataURL.indexOf(',');
  if (comma < 0) return dataURL.length;
  const base64 = dataURL.slice(comma + 1);
  return Math.floor((base64.length * 3) / 4);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadDataURL(dataURL: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function safeFilename(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\-. ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'terrain-o'
  );
}

export function labelsToBase64(labels: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < labels.length; i += chunk) {
    binary += String.fromCharCode(...labels.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToLabels(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
