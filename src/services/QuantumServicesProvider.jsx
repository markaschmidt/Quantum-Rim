import { quantumRimApi } from './quantumRimApi';
import { QuantumServicesContext } from './quantumServicesContext';

export function QuantumServicesProvider({ children, client = quantumRimApi }) {
  return (
    <QuantumServicesContext.Provider value={client}>
      {children}
    </QuantumServicesContext.Provider>
  );
}
