import React from 'react';
import ReactDOM from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import App from './App';
import './styles/theme.css';
import { initPwa } from './lib/pwa';
import { reloadOnceForNewVersion } from './components/PageBoundary';
import { startVersionChecks } from './lib/version-check';

initPwa();
startVersionChecks();

// Vite fires this when a lazy page's script cannot be downloaded (the site was updated while the tab was open, or the connection blipped): a single reload gets the new files.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Boss-fight and level-up feedback animations are functional, not decorative — always play them. */}
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="never">
        <App />
      </MotionConfig>
    </LazyMotion>
  </React.StrictMode>
);
