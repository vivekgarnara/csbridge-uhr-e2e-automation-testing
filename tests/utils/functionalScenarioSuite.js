import { test, expect } from './test-fixtures.js';
import { getScenarioConfig, isNegativeScenario } from '../../src/core/eventRules.js';
import { assertScenarioOutcome } from './scenarioTestHelper.js';
import { setupClaimCollection } from './collectProvClaimNos.js';
import { writeTestEventJson } from './testEventJsonReporter.js';
import path from 'path';
import { fileURLToPath } from 'url';

function inferCategory(scenario) {
  if (scenario.category) {
    return scenario.category;
  }
  const text = `${scenario.id} ${scenario.title || ''} ${scenario.generationDescription || ''}`;
  if (/(does not|not generated|not trigger|blocked|prevents|missing|null|empty|invalid|fails validation|skipped|ignored|rejected)/i.test(text)) {
    return 'NEGATIVE';
  }
  if (/(format|timezone|message type|control id|segment|separator|field|hl7|mapping|unique)/i.test(text)) {
    return 'FIELD FORMAT';
  }
  return 'POSITIVE';
}

function getEventGroup(eventType) {
  const cdaEvents = [
    'DISCHARGE_SUMMARY', 'OUTPATIENT_ENCOUNTER_SUMMARY', 
    'OPERATIVE_NOTE', 'NEWBORN_DISCHARGE', 'MATERNAL_DISCHARGE'
  ];
  const fhirEvents = [
    'LAB_ORDER', 'LAB_RESULT', 'MEDICATION_REQUEST', 
    'MEDICATION_DISPENSE', 'RADIOLOGY_ORDER', 'RADIOLOGY_RESULT'
  ];
  const upperEvent = eventType.toUpperCase();
  if (cdaEvents.includes(upperEvent)) return 'CDA';
  if (fhirEvents.includes(upperEvent)) return 'FHIR';
  return 'ADT';
}

export function runFunctionalScenarioSuite(eventType, scenarios, importMetaUrl) {
  const event = eventType.toUpperCase();
  const eventLower = event.toLowerCase();
  const normalizedScenarios = scenarios.map((scenario) => ({
    ...scenario,
    category: inferCategory(scenario)
  }));

  test.describe(`${event} Functional Spec Tests (Practical Coverage) @functional`, () => {
    const group = getEventGroup(event);
    const prefix = group.toLowerCase();
    const collect = setupClaimCollection(
      path.resolve(process.cwd(), `test_data/claims/${group}/${prefix}-${eventLower}-claims.json`)
    );

    for (const category of ['POSITIVE', 'NEGATIVE', 'FIELD FORMAT', 'OTHER']) {
      const grouped = normalizedScenarios.filter((scenario) => scenario.category === category);
      if (grouped.length === 0) {
        continue;
      }

      test.describe(category, () => {
        for (const scenario of grouped) {
          const isNeg = isNegativeScenario(event, scenario.id, scenario.generationDescription);
          const tag = isNeg ? 'negative' : 'positive';

          test(`${scenario.id}: ${scenario.title} @${tag}`, async ({ dbAssertions, generator, activeSession }) => {
            test.info().annotations.push({ type: 'category', description: category });
            test.info().annotations.push({ type: 'provider', description: activeSession.providerType });
            test.info().annotations.push({ type: 'scenarioId', description: scenario.id });

            const scenarioConfig = getScenarioConfig(event, scenario.id, scenario.generationDescription);
            test.info().annotations.push({
              type: 'expectEvent',
              description: String(scenarioConfig.expectEvent !== false)
            });

            const result = await generator.generateData({
              numberOfEvents: 1,
              eventTypes: [event],
              providerType: activeSession.providerType,
              dbConfig: activeSession.dbConfig,
              scenarioId: scenario.id,
              scenarioDescription: scenario.generationDescription
            });

            const provClaimNo = result.generatedProvClaimNos?.[0];
            if (provClaimNo) {
              test.info().annotations.push({ type: 'provClaimNo', description: provClaimNo });
            }

            if (!isNeg && result.success && provClaimNo) {
              collect(provClaimNo);
            }

            const reportPath = await writeTestEventJson({
              eventType: event,
              scenario,
              scenarioConfig,
              generationResult: result,
              dbAssertions,
              activeSession
            });
            test.info().annotations.push({ type: 'testEventJson', description: reportPath });
            test.info().attach('test-event-json-path', {
              body: reportPath,
              contentType: 'text/plain'
            });

            await assertScenarioOutcome({
              scenario: { id: scenario.id, description: scenario.generationDescription },
              eventType: event,
              result,
              dbAssertions,
              activeSession,
              expect
            });
          });
        }
      });
    }
  });
}
