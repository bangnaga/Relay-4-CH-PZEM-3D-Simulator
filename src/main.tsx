import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely ignore benign ResizeObserver errors that can occur during layout or charting transitions
if (typeof window !== 'undefined') {
  const ignoreErrors = [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.'
  ];
  
  const errorHandler = (e: ErrorEvent) => {
    if (e.message && ignoreErrors.some(err => e.message.includes(err))) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  const rejectionHandler = (e: PromiseRejectionEvent) => {
    if (e.reason && e.reason.message && ignoreErrors.some(err => e.reason.message.includes(err))) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };

  window.addEventListener('error', errorHandler, true);
  window.addEventListener('unhandledrejection', rejectionHandler, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
