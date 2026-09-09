import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
