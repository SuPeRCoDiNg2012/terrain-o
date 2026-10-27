import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
// Self-hosted IBM Plex (OFL, bundled by @fontsource) — nessuna CDN nel
// percorso di avvio: l'editor resta pienamente offline.
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import './pro-theme.css';
import './shell.css';
// I design token vincono sui :root legacy delle schede precedenti.
import './tokens.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root non trovato.');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
