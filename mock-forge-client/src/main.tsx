import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bootstrapLocaleStore } from './stores/localeStore';
import './index.css';

bootstrapLocaleStore()
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((err) => {
    console.error('Failed to bootstrap MockForge', err);
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;',
      'padding:32px;background:#1a1a1f;color:#e8e8e8;font-family:system-ui,sans-serif;text-align:center;">',
      '<div><h1 style="margin:0 0 8px;font-size:18px;">MockForge failed to start</h1>',
      '<p style="margin:0;font-size:13px;color:#888;">Restart the app. If the problem persists, reinstall MockForge.</p>',
      '</div></div>',
    ].join('');
  });
