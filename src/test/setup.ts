import 'fake-indexeddb/auto';

if (typeof globalThis.crypto === 'undefined') {
  // Node exposes webcrypto; jsdom sometimes hides it.
  Object.defineProperty(globalThis, 'crypto', { value: globalThis.crypto });
}

if (!HTMLCanvasElement.prototype.toDataURL) {
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
}
