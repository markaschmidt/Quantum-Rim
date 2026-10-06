import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import './index.css';
import { QuantumServicesProvider } from './services/QuantumServicesProvider.jsx';
import { bootDiscordActivity } from './services/discordActivity.js';

// Starts Discord only when this page is hosted inside an Activity iframe.
// A failed Activity sign-in never blocks the deterministic local game loop.
bootDiscordActivity();

createRoot(document.getElementById('root')).render(
  <QuantumServicesProvider>
    <App />
  </QuantumServicesProvider>,
);
