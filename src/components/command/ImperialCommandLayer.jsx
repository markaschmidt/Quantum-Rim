import './command-ui.css';

import { AdvisorChatModal } from './AdvisorChatModal';
import { CrisisConsole } from './CrisisConsole';
import { EmergencyActivityModal } from './EmergencyActivityModal';
import { ImperialStatusBar } from './ImperialStatusBar';
import { PlanetInspectionModal } from './PlanetInspectionModal';

export function ImperialCommandLayer() {
  return (
    <>
      <ImperialStatusBar />
      <CrisisConsole />
      <PlanetInspectionModal />
      <EmergencyActivityModal />
      <AdvisorChatModal />
    </>
  );
}
