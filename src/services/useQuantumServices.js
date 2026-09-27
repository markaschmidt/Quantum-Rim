import { useContext } from 'react';

import { QuantumServicesContext } from './quantumServicesContext';

export function useQuantumServices() {
  return useContext(QuantumServicesContext);
}
