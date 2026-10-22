import { runFunctionalScenarioSuite } from '../../../utils/functionalScenarioSuite.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';

const scenarios = EVENT_GROUPS['OPERATIVE_NOTE']
  .map(({ id, description }) => ({
    id,
    title: description,
    generationDescription: description
  }));

runFunctionalScenarioSuite('OPERATIVE_NOTE', scenarios, import.meta.url);
