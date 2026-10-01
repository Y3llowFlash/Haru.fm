import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import '@fontsource/vt323/latin-400.css';

document.documentElement.classList.toggle('desktop-app', Boolean(window.haru));
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
