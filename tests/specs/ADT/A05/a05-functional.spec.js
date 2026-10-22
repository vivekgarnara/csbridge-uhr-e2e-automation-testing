import { runFunctionalScenarioSuite } from '../../../utils/functionalScenarioSuite.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';

const scenarios = EVENT_GROUPS['A05']
  .slice(0, 35)
  .map(({ id, description }) => ({
    id,
    title: description,
    generationDescription: description
  }));

runFunctionalScenarioSuite('A05', scenarios, import.meta.url);
