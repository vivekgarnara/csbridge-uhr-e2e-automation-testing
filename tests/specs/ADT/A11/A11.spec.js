import { test, expect } from '../../../utils/test-fixtures.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';
import { getScenarioConfig, isNegativeScenario } from '../../../../src/core/eventRules.js';
import { assertScenarioOutcome } from '../../../utils/scenarioTestHelper.js';
import { setupClaimCollection } from '../../../utils/collectProvClaimNos.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenarios = EVENT_GROUPS['A11'];

test.describe('A11 Event Assertion Tests @default_auto', () => {
  const collect = setupClaimCollection(
    path.resolve(__dirname, '../../../../test_data/claims/ADT/adt-a11-claims.json')
  );

  const groups = [
    { name: 'Events Saved in DB', isNeg: false, category: 'positive' },
    { name: 'Records Not Saved in DB', isNeg: true, category: 'negative' }
  ];

  for (const group of groups) {
    const groupScenarios = scenarios.filter(
      (scenario) => isNegativeScenario('A11', scenario.id, scenario.description) === group.isNeg
    );

    if (groupScenarios.length > 0) {
      test.describe(group.name, () => {
        for (const scenario of groupScenarios) {
          test(`Scenario ${scenario.id}: ${scenario.description} @${group.category}`, async ({ dbAssertions, generator, activeSession }) => {
            test.info().annotations.push({ type: 'category', description: group.category });
            test.info().annotations.push({ type: 'provider', description: activeSession.providerType });

            const scenarioConfig = getScenarioConfig('A11', scenario.id, scenario.description);
            test.info().annotations.push({
              type: 'expectEvent',
              description: String(scenarioConfig.expectEvent !== false)
            });

            const result = await generator.generateData({
              numberOfEvents: 1,
              eventTypes: ['A11'],
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
              eventType: 'A11',
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
