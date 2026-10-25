import { useEffect, useId, useRef, useState } from 'react';
import { useDialogStore } from '../dialogStore';

export function DialogHost() {
  const current = useDialogStore((state) => state.current);
  const settle = useDialogStore((state) => state.settle);
  const cancel = useDialogStore((state) => state.cancel);
  const [note, setNote] = useState('');
  const [declared, setDeclared] = useState(false);
  const [distance, setDistance] = useState('100');
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!current) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    setNote('');
    setDeclared(false);
    setDistance(current.kind === 'calibrate' ? current.defaultValue : '100');
    setError(null);
    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        (panel.querySelector('[data-autofocus]') as HTMLElement | null) ??
        (panel.querySelector('button, input, textarea, select') as HTMLElement | null);
      target?.focus();
    }, 30);
    return () => {
      clearTimeout(timer);
      previousFocus.current?.focus?.();
    };
  }, [current]);

  if (!current) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === 'Tab') {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const submitCalibration = () => {
    const value = Number(distance.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Inserire una distanza numerica maggiore di zero.');
      return;
    }
    settle(value);
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && current.kind === 'alert') cancel();
      }}
    >
      <div
        className={`dialog-panel ${current.kind === 'confirm' && current.danger ? 'dialog-danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        ref={panelRef}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-kicker">
          {current.kind === 'verify' ? 'Verifica sul campo' : current.kind === 'calibrate' ? 'Calibrazione' : 'Terrain / O'}
        </div>
        <h2 id={titleId}>{current.title}</h2>
        <p id={bodyId} className="dialog-body">{current.body}</p>

        {current.kind === 'verify' && (
          <>
            <div className="dialog-feature-list">
              {current.featureNames.slice(0, 6).map((name) => (
                <span key={name} className="badge badge-neutral">{name}</span>
              ))}
              {current.featureNames.length > 6 && <span className="muted">+{current.featureNames.length - 6}</span>}
            </div>
            <label className="field-label" htmlFor="verify-note">Nota di verifica (facoltativa)</label>
            <textarea
              id="verify-note"
              className="text-input"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Es. controllo n. 101 verificato il 24/10 con la società locale"
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={declared}
                onChange={(event) => setDeclared(event.target.checked)}
                data-testid="verify-declaration"
              />
              <span>
                Dichiaro di aver verificato personalmente questo elemento sul campo. La modifica della geometria revocherà automaticamente la verifica.
              </span>
            </label>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={cancel} data-testid="dialog-cancel">
                Annulla
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!declared}
                onClick={() => settle({ note })}
                data-testid="dialog-confirm"
              >
                Dichiaro e verifico
              </button>
            </div>
          </>
        )}

        {current.kind === 'calibrate' && (
          <>
            <label className="field-label" htmlFor="calibration-distance">Distanza reale (metri)</label>
            <input
              id="calibration-distance"
              className="text-input"
              inputMode="decimal"
              value={distance}
              onChange={(event) => {
                setDistance(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCalibration();
                }
              }}
              data-autofocus
              data-testid="calibration-input"
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={cancel}>Annulla</button>
              <button type="button" className="btn btn-primary" onClick={submitCalibration} data-testid="dialog-confirm">
                Calcola scala
              </button>
            </div>
          </>
        )}

        {current.kind === 'confirm' && (
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => settle(false)} data-testid="dialog-cancel" data-autofocus>
              {current.cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${current.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => settle(true)}
              data-testid="dialog-confirm"
            >
              {current.confirmLabel}
            </button>
          </div>
        )}

        {current.kind === 'alert' && (
          <div className="dialog-actions">
            <button type="button" className="btn btn-primary" onClick={() => settle(true)} data-testid="dialog-confirm" data-autofocus>
              Ho capito
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
