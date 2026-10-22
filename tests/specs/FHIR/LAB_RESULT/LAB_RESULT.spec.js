import { test, expect } from '../../../utils/test-fixtures.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';
import { getScenarioConfig, isNegativeScenario } from '../../../../src/core/eventRules.js';
import { assertScenarioOutcome } from '../../../utils/scenarioTestHelper.js';
import { setupClaimCollection } from '../../../utils/collectProvClaimNos.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarios = EVENT_GROUPS['LAB_RESULT'];

test.describe('LAB_RESULT Event Assertion Tests @default_auto', () => {
  const collect = setupClaimCollection(
    path.resolve(__dirname, '../../../../test_data/claims/FHIR/fhir-lab_result-claims.json')
  );

  const groups = [
    { name: 'Events Saved in DB', isNeg: false, category: 'positive' },
    { name: 'Events Not Saved in DB', isNeg: true, category: 'negative' }
  ];

  for (const group of groups) {
    const groupScenarios = scenarios.filter(
      (scenario) => isNegativeScenario('LAB_RESULT', scenario.id, scenario.description) === group.isNeg
    );

    if (groupScenarios.length > 0) {
      test.describe(group.name, () => {
        for (const scenario of groupScenarios) {
          test(`Scenario ${scenario.id}: ${scenario.description} @${group.category}`, async ({ dbAssertions, fhirGenerator, activeSession }) => {
            test.info().annotations.push({ type: 'category', description: group.category });
            test.info().annotations.push({ type: 'provider', description: activeSession.providerType });

            const scenarioConfig = getScenarioConfig('LAB_RESULT', scenario.id, scenario.description);
            test.info().annotations.push({
              type: 'expectEvent',
              description: String(scenarioConfig.expectEvent !== false)
            });

            const result = await fhirGenerator.generateData({
              numberOfEvents: 1,
              eventTypes: ['LAB_RESULT'],
              providerType: activeSession.providerType,
              dbConfig: activeSession.dbConfig,
              scenarioId: scenario.id,
              scenarioDescription: scenario.description
            });

            const provClaimNo = result.generatedProvClaimNos?.[0];
            if (provClaimNo) {
              test.info().annotations.push({ type: 'provClaimNo', description: provClaimNo });
            }

            if (!group.isNeg && result.success && provClaimNo) {
              collect(provClaimNo);
            }

            await assertScenarioOutcome({
              scenario,
              eventType: 'LAB_RESULT',
              result,
              dbAssertions,
              activeSession,
              expect,
              groupName: group.name
            });
          });
        }
      });
    }
  }
});
