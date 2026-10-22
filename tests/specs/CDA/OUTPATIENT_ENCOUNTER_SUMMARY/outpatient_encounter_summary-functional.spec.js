import { runFunctionalScenarioSuite } from '../../../utils/functionalScenarioSuite.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';

const scenarios = EVENT_GROUPS['OUTPATIENT_ENCOUNTER_SUMMARY']
  .map(({ id, description }) => ({
    id,
    title: description,
    generationDescription: description
  }));

runFunctionalScenarioSuite('OUTPATIENT_ENCOUNTER_SUMMARY', scenarios, import.meta.url);
