import { useState } from 'react';
import { Modal } from './Modal';
import { useT } from '../../i18n';
import { Icon, type IconName } from './Icon';

const STEPS: Array<{ icon: IconName; kicker: string; title: string; body: string }> = [
  {
    icon: 'image',
    kicker: 'Passo 1 di 4',
    title: 'Importa la sorgente, non modificarla',
    body:
      'Trascina un JPG o PNG insieme al world file (.jgw, .pgw, .wld…) e, se disponibile, al .prj. L\'ortofoto resta la sorgente intoccabile: ogni intervento vive su livelli separati.',
  },
  {
    icon: 'wand',
    kicker: 'Passo 2 di 4',
    title: 'Automatico = sperimentale',
    body:
      'Classificazione cromatica, strade OSM e curve di livello DEM sono indizi, non verità. Sono sempre etichettati come sperimentali e non dichiarano percorribilità, vegetazione sotto copertura o quota di precisione.',
  },
  {
    icon: 'check',
    kicker: 'Passo 3 di 4',
    title: 'Verifica solo con una dichiarazione',
    body:
      'Disegna aree, linee e controlli. Un elemento diventa “verificato” solo quando dichiari esplicitamente di averlo controllato sul campo. Ogni modifica geometrica revoca la verifica e conserva la nota nello storico.',
  },
  {
    icon: 'export',
    kicker: 'Passo 4 di 4',
    title: 'Esporta una bozza, non una carta da gara',
    body:
      'PNG, SVG, PDF, OMAP, GeoJSON, GPX e KML sono strumenti di lavoro. Ogni export porta con sé l\'avvertenza di bozza preliminare e le attribuzioni OSM/DEM.',
  },
];

export const ONBOARDING_KEY = 'terrain-o:onboarding-v1';

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const t = useT();
  const current = STEPS[step];
  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'seen');
    } catch {
      // ignore
    }
    onClose();
  };
  return (
    <Modal
      title={t(current.title)}
      kicker={t(current.kicker)}
      onClose={finish}
      wide
      footer={
        <div className="onboarding-footer">
          <button type="button" className="btn btn-ghost" onClick={finish}>{t('Salta')}</button>
          <div className="onboarding-progress" aria-hidden="true">
            {STEPS.map((_, index) => <span key={index} className={index === step ? 'active' : ''} />)}
          </div>
          <div className="onboarding-actions">
            {step > 0 && <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>{t('Indietro')}</button>}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)} data-autofocus>
                {t('Avanti')} <Icon name="right" size={16} />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={finish} data-autofocus>
                {t('Inizia a lavorare')}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="onboarding-hero">
        <div className="onboarding-icon"><Icon name={current.icon} size={30} /></div>
        <p>{t(current.body)}</p>
      </div>
      <div className="onboarding-disclaimer">
        <Icon name="shield" size={16} /> {t('Terrain / O produce bozze preliminari. Non è uno strumento di validazione IOF, non certifica la sicurezza del terreno e non sostituisce la verifica sul campo.')}
      </div>
    </Modal>
  );
}
