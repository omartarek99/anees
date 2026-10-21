import React from 'react';
import ReactDOM from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import App from './App';
import './styles/theme.css';

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
