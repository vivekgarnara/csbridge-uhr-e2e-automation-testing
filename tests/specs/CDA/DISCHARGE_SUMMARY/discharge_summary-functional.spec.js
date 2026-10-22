import { runFunctionalScenarioSuite } from '../../../utils/functionalScenarioSuite.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';

const scenarios = EVENT_GROUPS['DISCHARGE_SUMMARY']
  .map(({ id, description }) => ({
    id,
    title: description,
    generationDescription: description
  }));

runFunctionalScenarioSuite('DISCHARGE_SUMMARY', scenarios, import.meta.url);
