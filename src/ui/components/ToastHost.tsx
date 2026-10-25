import { useToastStore } from '../toastStore';
import { Icon } from './Icon';

const icons = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'alert',
} as const;

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon"><Icon name={icons[item.kind]} size={18} /></span>
          <span className="toast-message">{item.message}</span>
          {item.actionLabel && item.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                item.action?.();
                dismiss(item.id);
              }}
            >
              {item.actionLabel}
            </button>
          )}
          <button type="button" className="icon-button toast-close" aria-label="Chiudi notifica" onClick={() => dismiss(item.id)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
