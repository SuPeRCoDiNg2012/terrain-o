import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';
import './pro-theme.css';
import './shell.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root non trovato.');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
