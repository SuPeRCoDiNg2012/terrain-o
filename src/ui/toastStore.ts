import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  actionLabel?: string;
  action?: () => void;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind, action?: { label: string; run: () => void }) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, kind = 'info', action) => {
    const last = get().toasts[get().toasts.length - 1];
    if (last?.message === message && last?.kind === kind) return;
    const id = crypto.randomUUID();
    const toast: Toast = {
      id,
      message,
      kind,
      actionLabel: action?.label,
      action: action?.run,
    };
    set({ toasts: [...get().toasts.slice(-4), toast] });
    const timer = setTimeout(() => {
      get().dismiss(id);
    }, kind === 'error' ? 9000 : 5500);
    timers.set(id, timer);
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },
  clear: () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    set({ toasts: [] });
  },
}));

export const toast = (
  message: string,
  kind: ToastKind = 'info',
  action?: { label: string; run: () => void },
): void => {
  useToastStore.getState().push(message, kind, action);
};
