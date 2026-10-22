import { runFunctionalScenarioSuite } from '../../../utils/functionalScenarioSuite.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';

const scenarios = EVENT_GROUPS['LAB_ORDER']
  .map(({ id, description }) => ({
    id,
    title: description,
    generationDescription: description
  }));

runFunctionalScenarioSuite('LAB_ORDER', scenarios, import.meta.url);
