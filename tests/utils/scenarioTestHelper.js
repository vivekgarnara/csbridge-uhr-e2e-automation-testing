import { getScenarioConfig } from '../../src/core/eventRules.js';
import { runDeepScenarioAssertions } from './deepAssertions.js';
import { feature, story, tag, parameter, suite, subSuite } from 'allure-js-commons';

export async function assertScenarioOutcome({
  scenario,
  eventType,
  result,
  dbAssertions,
  activeSession,
  expect,
  groupName
}) {
  const config = getScenarioConfig(eventType, scenario.id, scenario.description);

  try {
    await feature(eventType);
    await story(groupName || 'Event Creation');
    await suite(`${eventType} Event Assertion Tests`);
    if (groupName) {
      await subSuite(groupName);
    }
    await tag('creation');
    await tag(config.tier || (config.expectEvent === false ? 'negative' : 'positive'));
    await parameter('Scenario ID', scenario.id);
    if (result?.generatedProvClaimNos?.[0]) {
      await parameter('Claim Number', result.generatedProvClaimNos[0]);
    }
  } catch (err) {
    // Fail-safe: ignore allure errors if the allure reporter is not loaded
  }

  return runDeepScenarioAssertions({
    scenario,
    eventType,
    result,
    config,
    dbAssertions,
    activeSession,
    expect
  });
}
