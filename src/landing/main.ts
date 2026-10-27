import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './landing.css';

// Same key as the editor, so the language chosen on the site is the language
// the application opens with.
const LOCALE_KEY = 'terrain-o/locale/v1';

type Locale = 'it' | 'en';

const it: Record<string, string> = {
  'nav.program': 'Programma',
  'nav.limits': 'Limiti',
  'nav.install': 'Installazione',
  'hero.eyebrow': 'Strumento da campo · Windows 10/11',
  'hero.title': 'Mappe di orienteering preliminari, da un’ortofoto.',
  'hero.lead':
    'Terrain / O classifica la sorgente, vettorizza i confini, assegna i simboli ISOM e ISSprOM e produce bozze da verificare sul campo. Un programma desktop, non un servizio web.',
  'hero.download': 'Scarica per Windows',
  'hero.web': 'Prova nel browser',
  'hero.meta': 'Versione 0.7.0 · installer .exe 64 bit · nessun account · funziona offline',
  'hero.note':
    'L’interpretazione automatica è materiale sperimentale. Il programma non dichiara percorribilità, vegetazione sotto copertura, sicurezza del terreno, quota di precisione o conformità IOF.',
  'legend.title': 'Quattro provenienze, sempre distinte',
  'legend.source': 'Sorgente',
  'legend.sourceHint': 'Ortofoto non modificabile',
  'legend.auto': 'Automatica',
  'legend.autoHint': 'Bordo tratteggiato · sperimentale',
  'legend.manual': 'Manuale',
  'legend.manualHint': 'Bordo pieno · non verificata',
  'legend.verified': 'Verificata',
  'legend.verifiedHint': 'Dichiarazione esplicita',
  'legend.foot': 'Modificare la geometria revoca la verifica.',
  'pipeline.source': 'Ortofoto',
  'pipeline.classify': 'Classificazione',
  'pipeline.vectorize': 'Vettorizzazione',
  'pipeline.symbols': 'Simboli ISOM',
  'pipeline.export': 'Export',
  'program.kicker': 'Il programma',
  'program.title': 'Quattro passaggi, un solo strumento.',
  'program.c1.title': 'Classificazione per-pixel',
  'program.c1.body':
    'Illuminazione normalizzata, superpixel SLIC, regole per classe e confidenza su ogni pixel. Pulizia morfologica e gerarchia ISOM: vegetazione, suolo, acqua, costruiti.',
  'program.c2.title': 'Vettorizzazione topologica',
  'program.c2.body':
    'Contorni marching squares, isole e fori annidati, semplificazione controllata con verifiche di topologia e riconciliazione dei bordi adiacenti. Nessun anello aperto.',
  'program.c3.title': 'Simboli ISOM e ISSprOM',
  'program.c3.body':
    'Set simboli ISOM 2017-2 e ISSprOM 2019-2, con priorità gerarchica fra le classi. Esportazione .omap compatibile con OpenOrienteering Mapper.',
  'program.c4.title': 'Export verificabile',
  'program.c4.body':
    'PNG, SVG, PDF A4 e A3, GeoJSON, GPX/KML e .omap. Ogni file porta con sé l’avvertenza di bozza preliminare e le attribuzioni OSM e DEM.',
  'limits.kicker': 'Limiti dichiarati',
  'limits.title': 'Quello che il programma non dice.',
  'limits.never': 'Non dichiara mai',
  'limits.never1': 'Percorribilità o velocità di corsa',
  'limits.never2': 'Vegetazione sotto copertura',
  'limits.never3': 'Sicurezza del terreno',
  'limits.never4': 'Quota di precisione',
  'limits.never5': 'Ostacoli non visibili',
  'limits.never6': 'Nord geografico verificato',
  'limits.never7': 'Conformità IOF',
  'limits.you': 'Lo dichiari tu',
  'limits.youBody':
    'Un elemento diventa verificato solo con una dichiarazione esplicita dell’utente. Ogni modifica geometrica revoca la verifica e conserva la nota nello storico, con data e motivo.',
  'limits.youNote':
    'La classificazione automatica resta materia prima sperimentale: è marcata come tale nell’interfaccia e non diventa verità sul terreno.',
  'install.kicker': 'Installazione',
  'install.title': 'Un installer, nessuna dipendenza.',
  'install.s1.title': 'Scarica l’installer',
  'install.s1.body': 'Il pulsante apre l’ultima release su GitHub: file .exe per Windows 64 bit.',
  'install.s2.title': 'Esegui il setup',
  'install.s2.body':
    'Installazione per utente, senza privilegi di amministratore. Crea il collegamento sul desktop e nel menu Start.',
  'install.s3.title': 'Apri Terrain / O',
  'install.s3.body':
    'Nessun account. I progetti restano in IndexedDB sul dispositivo e l’editor funziona senza connessione.',
  'install.smart.title': 'Avviso di Windows',
  'install.smart.body':
    'L’installer non è firmato con un certificato commerciale: al primo avvio Windows può mostrare “Windows ha protetto il PC”. Seleziona Ulteriori informazioni → Esegui comunque. La firma del codice è il passo successivo per la distribuzione pubblica.',
  'install.req.os': 'Sistema',
  'install.req.osValue': 'Windows 10 o 11, 64 bit',
  'install.req.disk': 'Spazio',
  'install.req.diskValue': 'circa 250 MB installati',
  'install.req.memory': 'Memoria',
  'install.req.memoryValue': '4 GB RAM consigliati',
  'install.req.net': 'Rete',
  'install.req.netValue': 'non richiesta, salvo OSM e DEM',
  'install.allReleases': 'Tutte le release',
  'install.manual': 'Manuale PDF',
  'footer.note':
    'Bozza preliminare. Non è uno strumento di validazione IOF, non certifica la sicurezza del terreno e non sostituisce la verifica sul campo.',
  'footer.source': 'Codice sorgente',
  'footer.releases': 'Release',
  'footer.web': 'Editor nel browser',
};

const en: Record<string, string> = {
  'nav.program': 'Program',
  'nav.limits': 'Limits',
  'nav.install': 'Install',
  'hero.eyebrow': 'Field tool · Windows 10/11',
  'hero.title': 'Preliminary orienteering maps, from an orthophoto.',
  'hero.lead':
    'Terrain / O classifies the source, vectorises boundaries, assigns ISOM and ISSprOM symbols and produces drafts to verify in the field. A desktop program, not a web service.',
  'hero.download': 'Download for Windows',
  'hero.web': 'Try in the browser',
  'hero.meta': 'Version 0.7.0 · 64-bit .exe installer · no account · works offline',
  'hero.note':
    'Automatic interpretation is experimental material. The program never states runnability, vegetation under canopy, ground safety, precision elevation or IOF compliance.',
  'legend.title': 'Four provenances, always distinct',
  'legend.source': 'Source',
  'legend.sourceHint': 'Orthophoto, never modified',
  'legend.auto': 'Automatic',
  'legend.autoHint': 'Dashed outline · experimental',
  'legend.manual': 'Manual',
  'legend.manualHint': 'Solid outline · unverified',
  'legend.verified': 'Verified',
  'legend.verifiedHint': 'Explicit declaration',
  'legend.foot': 'Editing the geometry revokes verification.',
  'pipeline.source': 'Orthophoto',
  'pipeline.classify': 'Classification',
  'pipeline.vectorize': 'Vectorisation',
  'pipeline.symbols': 'ISOM symbols',
  'pipeline.export': 'Export',
  'program.kicker': 'The program',
  'program.title': 'Four passes, one instrument.',
  'program.c1.title': 'Per-pixel classification',
  'program.c1.body':
    'Normalised illumination, SLIC superpixels, per-class rules and per-pixel confidence. Morphological cleanup and ISOM hierarchy: vegetation, ground, water, man-made.',
  'program.c2.title': 'Topological vectorisation',
  'program.c2.body':
    'Marching-squares contours, nested islands and holes, controlled simplification with topology checks and adjacent-edge reconciliation. No open rings.',
  'program.c3.title': 'ISOM and ISSprOM symbols',
  'program.c3.body':
    'ISOM 2017-2 and ISSprOM 2019-2 symbol sets with hierarchical priority between classes. .omap export compatible with OpenOrienteering Mapper.',
  'program.c4.title': 'Verifiable export',
  'program.c4.body':
    'PNG, SVG, PDF A4 and A3, GeoJSON, GPX/KML and .omap. Every file carries the preliminary-draft notice and OSM/DEM attribution.',
  'limits.kicker': 'Declared limits',
  'limits.title': 'What the program does not say.',
  'limits.never': 'Never states',
  'limits.never1': 'Runnability or running speed',
  'limits.never2': 'Vegetation under canopy',
  'limits.never3': 'Ground safety',
  'limits.never4': 'Precision elevation',
  'limits.never5': 'Obstacles you cannot see',
  'limits.never6': 'Verified true north',
  'limits.never7': 'IOF compliance',
  'limits.you': 'You state it',
  'limits.youBody':
    'An element becomes verified only through an explicit user declaration. Any geometry edit revokes verification and keeps the note in the history, with date and reason.',
  'limits.youNote':
    'Automatic classification stays experimental raw material: it is marked as such in the interface and never becomes ground truth.',
  'install.kicker': 'Installation',
  'install.title': 'One installer, no dependencies.',
  'install.s1.title': 'Download the installer',
  'install.s1.body': 'The button opens the latest GitHub release: .exe for 64-bit Windows.',
  'install.s2.title': 'Run the setup',
  'install.s2.body':
    'Per-user installation, no administrator rights. It creates the desktop and Start menu shortcuts.',
  'install.s3.title': 'Open Terrain / O',
  'install.s3.body':
    'No account. Projects stay in IndexedDB on the device and the editor works offline.',
  'install.smart.title': 'Windows warning',
  'install.smart.body':
    'The installer is not signed with a commercial certificate: on first launch Windows may show “Windows protected your PC”. Choose More information → Run anyway. Code signing is the next step for public distribution.',
  'install.req.os': 'System',
  'install.req.osValue': 'Windows 10 or 11, 64-bit',
  'install.req.disk': 'Storage',
  'install.req.diskValue': 'about 250 MB installed',
  'install.req.memory': 'Memory',
  'install.req.memoryValue': '4 GB RAM recommended',
  'install.req.net': 'Network',
  'install.req.netValue': 'not required, except OSM and DEM',
  'install.allReleases': 'All releases',
  'install.manual': 'PDF manual',
  'footer.note':
    'Preliminary draft. It is not an IOF validation tool, does not certify ground safety and does not replace field verification.',
  'footer.source': 'Source code',
  'footer.releases': 'Releases',
  'footer.web': 'Browser editor',
};

const COPY: Record<Locale, Record<string, string>> = { it, en };

const TITLES: Record<Locale, { title: string; description: string }> = {
  it: {
    title: 'Terrain / O — Editor desktop per mappe di orienteering',
    description:
      'Terrain / O — editor desktop per mappe preliminari di orienteering da ortofoto georeferenziate. Classificazione per-pixel, vettorizzazione topologica, simboli ISOM e ISSprOM. Download per Windows.',
  },
  en: {
    title: 'Terrain / O — Desktop editor for orienteering maps',
    description:
      'Terrain / O — desktop editor for preliminary orienteering maps from georeferenced orthophotos. Per-pixel classification, topological vectorisation, ISOM and ISSprOM symbols. Download for Windows.',
  },
};

const toggle = document.getElementById('lang-toggle');
const description = document.querySelector('meta[name="description"]');

function applyLocale(locale: Locale): void {
  const copy = COPY[locale];
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (!key) return;
    const value = copy[key];
    if (value) node.textContent = value;
  });

  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
  document.title = TITLES[locale].title;
  description?.setAttribute('content', TITLES[locale].description);

  if (toggle) {
    toggle.textContent = locale === 'it' ? 'EN' : 'IT';
    toggle.setAttribute('aria-label', locale === 'it' ? 'Switch to English' : 'Passa all’italiano');
    toggle.lang = locale === 'it' ? 'en' : 'it';
  }

  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // A blocked storage only costs the preference.
  }
}

function initialLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'it';
  } catch {
    return 'it';
  }
}

let locale = initialLocale();
applyLocale(locale);

toggle?.addEventListener('click', () => {
  locale = locale === 'it' ? 'en' : 'it';
  applyLocale(locale);
});
