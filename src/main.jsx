import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import './index.css';
import { QuantumServicesProvider } from './services/QuantumServicesProvider.jsx';

createRoot(document.getElementById('root')).render(
  <QuantumServicesProvider>
    <App />
  </QuantumServicesProvider>,
);
