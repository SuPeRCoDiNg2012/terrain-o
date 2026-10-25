import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export type DialogState =
  | {
      kind: 'confirm';
      title: string;
      body: string;
      confirmLabel: string;
      cancelLabel: string;
      danger: boolean;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'alert';
      title: string;
      body: string;
      resolve: () => void;
    }
  | {
      kind: 'verify';
      title: string;
      body: string;
      featureNames: string[];
      resolve: (value: { note: string } | null) => void;
    }
  | {
      kind: 'calibrate';
      title: string;
      body: string;
      defaultValue: string;
      resolve: (value: number | null) => void;
    };

interface DialogStore {
  current: DialogState | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (title: string, body: string) => Promise<void>;
  askVerification: (featureNames: string[]) => Promise<{ note: string } | null>;
  askCalibrationDistance: (defaultValue?: number) => Promise<number | null>;
  settle: (value: boolean | { note: string } | number | null) => void;
  cancel: () => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  current: null,
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      set({
        current: {
          kind: 'confirm',
          title: options.title,
          body: options.body,
          confirmLabel: options.confirmLabel ?? 'Conferma',
          cancelLabel: options.cancelLabel ?? 'Annulla',
          danger: options.danger ?? false,
          resolve,
        },
      });
    }),
  alert: (title, body) =>
    new Promise<void>((resolve) => {
      set({ current: { kind: 'alert', title, body, resolve } });
    }),
  askVerification: (featureNames) =>
    new Promise<{ note: string } | null>((resolve) => {
      set({
        current: {
          kind: 'verify',
          title: 'Dichiarazione di verifica sul campo',
          body:
            'La verifica è una dichiarazione personale. Conferma solo se hai controllato questo elemento sul terreno, non da ortofoto o da dati automatici.',
          featureNames,
          resolve,
        },
      });
    }),
  askCalibrationDistance: (defaultValue = 100) =>
    new Promise<number | null>((resolve) => {
      set({
        current: {
          kind: 'calibrate',
          title: 'Distanza reale tra i due punti',
          body: 'Inserire la distanza misurata sul terreno tra i due punti selezionati. La scala sarà calcolata ai minimi quadrati se sono presenti più misure.',
          defaultValue: String(defaultValue),
          resolve,
        },
      });
    }),
  settle: (value) => {
    const current = get().current;
    if (!current) return;
    set({ current: null });
    if (current.kind === 'confirm') current.resolve(Boolean(value));
    else if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'verify') {
      current.resolve(value && typeof value === 'object' ? (value as { note: string }) : null);
    } else if (current.kind === 'calibrate') current.resolve(typeof value === 'number' ? value : null);
  },
  cancel: () => {
    const current = get().current;
    if (!current) return;
    set({ current: null });
    if (current.kind === 'confirm') current.resolve(false);
    else if (current.kind === 'alert') current.resolve();
    else if (current.kind === 'verify') current.resolve(null);
    else current.resolve(null);
  },
}));

export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  useDialogStore.getState().confirm(options);

export const alertDialog = (title: string, body: string): Promise<void> =>
  useDialogStore.getState().alert(title, body);

export const askCalibrationDistance = (defaultValue = 100): Promise<number | null> =>
  useDialogStore.getState().askCalibrationDistance(defaultValue);

export const askVerification = (featureNames: string[]): Promise<{ note: string } | null> =>
  useDialogStore.getState().askVerification(featureNames);
