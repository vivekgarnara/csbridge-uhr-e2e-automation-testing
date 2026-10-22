// Placeholder for Conformance Phase 3 (Patient C) helpers
// Re-export shared base functions from Phase 1 and Phase 2

export {
    createEvent,
    triggerSync,
    updateEncounterClass,
    updateEncounterStatus,
    dischargeEncounter,
    cancelDischarge
  } from './conformanceHelperPhase1.js';
  
  export {
    addCareTeamMember,
    addDiagnosis,
    deleteDiagnosis,
    addSupportingInfoAllergy,
    deleteSupportingInfoAllergy,
    updateHospitalSpecialty,
    addPatientLocation,
    removePatientLocation
  } from './conformanceHelperPhase2.js';
  