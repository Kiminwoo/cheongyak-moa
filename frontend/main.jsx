import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      const announce = () => window.dispatchEvent(new Event('app-update-ready'));
      if (registration.waiting) announce();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announce();
        });
      });
    }).catch(() => {
      // Service Worker가 차단된 환경에서도 온라인 서비스는 계속 동작합니다.
    });
  });
}
