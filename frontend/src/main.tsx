import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Boss-fight and level-up feedback animations are functional, not decorative — always play them. */}
    <MotionConfig reducedMotion="never">
      <App />
    </MotionConfig>
  </React.StrictMode>
);
