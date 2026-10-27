import type { ReactNode } from 'react';
import type { JobState } from '../../store/projectStore';
import type { AutoPipelineReport } from '../../ai/autoPipeline';
import { useLocale, useT } from '../../i18n';
import { Icon } from '../components/Icon';
import { Mark } from '../components/Mark';

export interface SimpleShellProps {
  projectName: string;
  hasImage: boolean;
  hasContent: boolean;
  importing: boolean;
  busy: boolean;
  autoJob: JobState;
  autoReport: AutoPipelineReport | null;
  onLoad: () => void;
  onRunAll: () => void;
  onExport: () => void;
  onAdvanced: () => void;
  onCancel: () => void;
  children: ReactNode;
}

function durationLabel(ms: number, locale: string): string {
  return (ms / 1000).toLocaleString(locale === 'it' ? 'it-IT' : 'en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * The default workspace: the map, three actions and nothing else.
 *
 * Load, run the complete pipeline and export stay one click away. Every other
 * command and panel lives behind "Modalità avanzata", so the first screen
 * never asks the user to learn the whole editor before working.
 */
export function SimpleShell({
  projectName,
  hasImage,
  hasContent,
  importing,
  busy,
  autoJob,
  autoReport,
  onLoad,
  onRunAll,
  onExport,
  onAdvanced,
  onCancel,
  children,
}: SimpleShellProps) {
  const t = useT();
  const locale = useLocale();
  const running = autoJob.running;
  const cancelled = !running && autoJob.phase === 'Elaborazione annullata';
  const warningCount = autoReport?.warnings.length ?? 0;

  return (
    <div className="simple-shell" data-testid="simple-shell">
      <header className="simple-header">
        <div className="simple-brand" aria-label="Terrain / O">
          <span className="simple-mark" aria-hidden="true">
            <Mark size={18} />
          </span>
          <span className="simple-name">
            <span className="wm-a">Terrain</span>
            <span className="wm-slash">/</span>
            <span className="wm-o">O</span>
          </span>
          {hasImage && <span className="simple-project truncate" title={projectName}>{projectName}</span>}
        </div>
        <button
          type="button"
          className="simple-advanced"
          onClick={onAdvanced}
          title={t('Apri la modalità avanzata con pannelli, strumenti e menu')}
          data-testid="enter-advanced"
        >
          <Icon name="more" size={16} />
          <span className="simple-advanced-label">{t('Modalità avanzata')}</span>
        </button>
      </header>

      <div className="simple-stage">{children}</div>

      <div className="simple-footer">
        {running && (
          <div className="simple-progress" role="status" aria-live="polite" data-testid="simple-progress">
            <div className="simple-progress-head">
              <Icon name="wand" size={14} />
              <span className="truncate">{t(autoJob.phase)}</span>
              <strong className="mono">{Math.round(autoJob.percent)}%</strong>
              <button
                type="button"
                className="simple-progress-cancel"
                onClick={onCancel}
                title={t('Annulla elaborazione')}
                aria-label={t('Annulla elaborazione')}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div
              className="simple-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(autoJob.percent)}
              aria-label={t('Avanzamento elaborazione')}
            >
              <span style={{ width: `${Math.round(autoJob.percent)}%` }} />
            </div>
          </div>
        )}

        {!running && autoJob.error && (
          <div className="simple-message is-error" role="alert" data-testid="simple-error">
            <Icon name="alert" size={14} />
            <span>{autoJob.error}</span>
          </div>
        )}

        {cancelled && (
          <div className="simple-message" role="status" data-testid="simple-cancelled">
            <Icon name="info" size={14} />
            <span>{t('Elaborazione annullata')}</span>
          </div>
        )}

        {!running && !autoJob.error && !cancelled && autoReport && (
          <div className="simple-message" role="status" data-testid="simple-result">
            <Icon name="check" size={14} />
            <span>
              {t('Mappa pronta')} · {autoReport.totalFeatures} {t('simboli')} ·{' '}
              {durationLabel(autoReport.durationMs, locale)} s
              {warningCount > 0 ? ` · ${t('{n} avvisi', { n: warningCount })}` : ''}
            </span>
          </div>
        )}

        <div className="simple-actions" role="group" aria-label={t('Azioni principali')}>
          <button
            type="button"
            className={`simple-action ${!hasImage ? 'is-primary' : ''}`}
            onClick={onLoad}
            disabled={importing}
            data-testid="simple-load"
            title={t('Carica un’ortofoto o un progetto')}
          >
            <Icon name="import" size={20} />
            <span>{importing ? t('Caricamento…') : t('Carica')}</span>
          </button>

          <button
            type="button"
            className={`simple-action ${hasImage ? 'is-primary' : ''}`}
            onClick={onRunAll}
            disabled={!hasImage || importing || busy}
            data-testid="simple-run-all"
            title={t('OSM, classificazione, vettorizzazione, AI e livello unico in un solo comando')}
          >
            <Icon name="wand" size={20} />
            <span>{running ? t('In corso…') : t('Esegui tutto')}</span>
          </button>

          <button
            type="button"
            className="simple-action"
            onClick={onExport}
            disabled={!hasContent || importing}
            data-testid="simple-export"
            title={t('Esporta mappa e dati')}
          >
            <Icon name="export" size={20} />
            <span>{t('Esporta')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
