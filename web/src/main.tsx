import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './index.css';
import { startTheme } from './theme/theme';

// iOS Safari only applies :active to a touch when a touch listener exists, so without this every
// press state in the app would wait for the finger to lift. An empty passive listener is enough.
document.addEventListener('touchstart', () => {}, { passive: true });

// Before the first render, so nothing is ever drawn in the wrong colours.
startTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
