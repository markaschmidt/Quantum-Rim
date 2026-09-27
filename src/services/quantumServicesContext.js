import { createContext } from 'react';

import { quantumRimApi } from './quantumRimApi';

export const QuantumServicesContext = createContext(quantumRimApi);
