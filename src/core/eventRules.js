/**
 * Per-scenario data overrides and expectations for event submission testing.
 * Used by DataGenerator, generateEvents.js, and Playwright specs.
 */

const NEGATIVE_DESCRIPTION_KEYWORDS = [
  'does not generate',
  'does not trigger',
  'does not create',
  'not generated',
  'not created',
  'not trigger',
  'blocked',
  'prevents',
  'prevent ',
  'is ignored',
  'is rejected',
  'is excluded',
  'blocks submission',
  'not marked ready',
  'empty encounter record is ignored',
  'incomplete encounter',
  'whitespace-only mandatory',
  'not classified',
  'ignores',
  'does not fail'
];

const BASE = {
  encounterClass: undefined,
  encounterStartDate: undefined,
  encounterEndDate: undefined,
  category: undefined,
  supportingValue: undefined,
  provClaimNo: undefined,
  encounterStatus: undefined,
  documentId: undefined,
  isSubmitted: false,
  expectEvent: undefined,
  expectGenerationSuccess: true,
  insertEventRow: undefined,
  assertions: undefined
};

function inferExpectEvent(description) {
  const desc = (description || '').toLowerCase();
  if (NEGATIVE_DESCRIPTION_KEYWORDS.some((k) => desc.includes(k))) {
    return false;
  }
  if (desc.includes('invalid') && (desc.includes('hl7') || desc.includes('structure'))) {
    return false;
  }
  return true;
}

function extractQuotedAssignment(description, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b\\s*=\\s*'([^']*)'`, 'i');
  return description?.match(re)?.[1];
}

function extractExplicitScenarioValues(description) {
  const patch = {};
  const category = extractQuotedAssignment(description, 'CATEGORY');
  const supportingValue = extractQuotedAssignment(description, 'SUPPORTINGVALUE');
  const encounterClass = extractQuotedAssignment(description, 'ENCOUNTERCLASS');
  const documentId = extractQuotedAssignment(description, 'DOCUMENTID');
  const claimType = extractQuotedAssignment(description, 'CLAIMTYPE');
  const claimSubType = extractQuotedAssignment(description, 'CLAIMSUBTYPE');
  const isNewborn = extractQuotedAssignment(description, 'ISNEWBORN');
  const isMaternity = extractQuotedAssignment(description, 'ISMATERNITY');
  const gender = extractQuotedAssignment(description, 'GENDER');
  const serviceType = extractQuotedAssignment(description, 'SERVICETYPE');
  const serviceCode = extractQuotedAssignment(description, 'SERVICECODE');
  const serviceDesc = extractQuotedAssignment(description, 'SERVICEDESC');
  const hospitalDischargeDisposition = extractQuotedAssignment(description, 'HOSPITALDISCHARGEDISPOSITION');
  const emergencyDepartmentDisposition = extractQuotedAssignment(description, 'EMERGENCYDEPARTMENTDISPOSITION');
  const supportingAttachment = extractQuotedAssignment(description, 'SUPPORTINGATTACHMENT');

  if (category !== undefined) patch.category = category;
  if (supportingValue !== undefined) patch.supportingValue = supportingValue;
  if (encounterClass !== undefined) patch.encounterClass = encounterClass;
  if (documentId !== undefined) patch.documentId = documentId;
  if (claimType !== undefined) patch.claimType = claimType;
  if (claimSubType !== undefined) patch.claimSubType = claimSubType;
  if (isNewborn !== undefined) patch.isNewborn = isNewborn;
  if (isMaternity !== undefined) patch.isMaternity = isMaternity;
  if (gender !== undefined) patch.gender = gender;
  if (serviceType !== undefined) patch.serviceType = serviceType;
  if (serviceCode !== undefined) patch.serviceCode = serviceCode;
  if (serviceDesc !== undefined) patch.serviceDesc = serviceDesc;
  if (hospitalDischargeDisposition !== undefined) patch.hospitalDischargeDisposition = hospitalDischargeDisposition;
  if (emergencyDepartmentDisposition !== undefined) patch.emergencyDepartmentDisposition = emergencyDepartmentDisposition;
  if (supportingAttachment !== undefined) patch.supportingAttachment = supportingAttachment;

  return patch;
}

function mergeConfig(eventType, scenarioId, description, specific = {}) {
  const inferredEvent = specific.expectEvent ?? inferExpectEvent(description);
  const expectEvent = specific.expectEvent ?? inferredEvent;
  const expectGenerationSuccess = specific.expectGenerationSuccess ?? true;

  const config = {
    ...BASE,
    expectEvent,
    expectGenerationSuccess,
    ...specific
  };

  if (config.insertEventRow === undefined) {
    config.insertEventRow = expectEvent && expectGenerationSuccess;
  }

  const assertions = { ...(config.assertions || {}) };
  if (config.encounterClass !== undefined) assertions.encounterclass = config.encounterClass;
  if (config.category !== undefined) assertions.category = config.category;
  if (config.supportingValue !== undefined) assertions.supportingvalue = config.supportingValue;
  if (config.documentId !== undefined) assertions.documentid = config.documentId;
  if (config.encounterEndDate !== undefined) assertions.encounterenddate = config.encounterEndDate;
  if (config.encounterStatus !== undefined) assertions.encounterstatus = config.encounterStatus;
  if (config.claimType !== undefined) assertions.claimtype = config.claimType;
  if (config.claimSubType !== undefined) assertions.claimsubtype = config.claimSubType;
  if (config.isNewborn !== undefined) assertions.isnewborn = config.isNewborn;
  if (config.isMaternity !== undefined) assertions.ismaternity = config.isMaternity;
  if (config.gender !== undefined) assertions.gender = config.gender;
  if (config.serviceType !== undefined) assertions.servicetype = config.serviceType;
  if (config.serviceCode !== undefined) assertions.servicecode = config.serviceCode;
  if (config.serviceDesc !== undefined) assertions.servicedesc = config.serviceDesc;
  if (config.hospitalDischargeDisposition !== undefined) assertions.hospitaldischargedisposition = config.hospitalDischargeDisposition;
  if (config.emergencyDepartmentDisposition !== undefined) assertions.emergencydepartmentdisposition = config.emergencyDepartmentDisposition;
  if (config.supportingAttachment !== undefined) assertions.supportingattachment = config.supportingAttachment;

  if (Object.keys(assertions).length > 0) {
    config.assertions = assertions;
  }

  config.requireSupportingInfo = config.requireSupportingInfo ?? eventType === 'A02';

  return config;
}

/** Refine rules from scenario description text (covers IDs without explicit switch cases). */
function applyDescriptionInference(eventType, scenarioId, description, config) {
  const d = (description || '').toLowerCase();
  const patch = {};
  const explicitValues = extractExplicitScenarioValues(description);

  if (eventType === 'A01') {
    if (d.includes('inpatient') || d.includes('encounterclass imp')) patch.encounterClass = 'IMP';
    if (d.includes('same-day surgery') || d.includes('encounterclass ss')) patch.encounterClass = 'SS';
    if (d.includes('outpatient')) patch.encounterClass = 'AMB';
    if (d.includes('transfer')) {
      patch.encounterClass = 'IMP';
      patch.encounterStatus = 'transfer';
      patch.expectEvent = false;
    }
    if (d.includes('hl7') && (d.includes('not created') || d.includes('prevents') || d.includes('missing'))) {
      patch.encounterClass = patch.encounterClass || 'IMP';
      patch.expectEvent = false;
    }
  }

  if (eventType === 'A02') {
    patch.encounterClass = patch.encounterClass || 'IMP';
    if (d.includes('room number')) {
      patch.category = 'info';
      patch.supportingValue = 'Room Number';
      patch.supportingValueMustContain = 'room';
    } else if (d.includes('without room') || d.includes('unrelated info') || d.includes('no room')) {
      patch.category = 'info';
      patch.supportingValue = 'Patient allergy updated';
      patch.supportingValueMustNotContain = 'room|ward|bed';
      patch.expectEvent = false;
    } else if (d.includes('non-info') || d.includes('update category')) {
      patch.category = 'update';
      patch.supportingValue = 'Room';
      patch.expectEvent = false;
    }
    else if (d.includes('room') || d.includes('ward') || d.includes('bed')) {
      patch.category = patch.category || config.category || 'info';
      patch.supportingValue = patch.supportingValue || config.supportingValue || 'transfer to Room 302';
      // Only set must-contain rule if config doesn't already have must-contain/must-not-contain rules
      if (!config.supportingValueMustContain && !config.supportingValueMustNotContain) {
        patch.supportingValueMustContain = d.includes('ward') ? 'ward' : d.includes('bed') ? 'bed' : 'room';
      }
    }
    if (d.includes('whitespace-only')) {
      patch.category = '   ';
      patch.expectEvent = false;
    }
  }

  if (eventType === 'A03') {
    patch.encounterClass = 'IMP';
    if (d.includes('encounterenddate is null') || d.includes('enddate is null')) {
      patch.encounterEndDate = null;
      patch.expectEvent = false;
    } else if (d.includes('whitespace-only') || d.includes('enddate is empty')) {
      patch.encounterEndDate = '   ';
      patch.expectEvent = false;
    } else if (d.includes('invalid') && d.includes('date')) {
      patch.encounterEndDate = 'INVALID_DATE';
      patch.expectEvent = false;
    } else if (d.includes('future discharge')) {
      patch.encounterEndDate = new Date(Date.now() + 7 * 86400000);
    } else if (d.includes('discharge date') || d.includes('enddate is populated')) {
      patch.encounterEndDate = patch.encounterEndDate || new Date();
    }
  }

  if (eventType === 'A04') {
    if (d.includes('encounterclass = imp') && (d.includes('not classified') || d.includes('excluded'))) {
      patch.encounterClass = 'IMP';
      patch.expectEvent = false;
    } else if (d.includes('encounterclass = ss') && (d.includes('not classified') || d.includes('excluded'))) {
      patch.encounterClass = 'SS';
      patch.expectEvent = false;
    } else if (d.includes('encounterclass = amb') || d.includes('outpatient')) {
      patch.encounterClass = 'AMB';
    } else if (d.includes('encounterclass = emer')) {
      patch.encounterClass = 'EMER';
    } else if (d.includes('encounterclass = hh')) {
      patch.encounterClass = 'HH';
    } else if (d.includes('unknown encounterclass')) {
      patch.encounterClass = 'UNKNOWN';
    }
    if (d.includes('documentid is null') || d.includes('documentid in beneficiary table is null')) {
      patch.documentId = null;
      patch.expectEvent = false;
    }
    if (d.includes('documentid is empty') || d.includes('empty string')) {
      patch.documentId = '';
      patch.expectEvent = false;
    }
    if (d.includes('hl7') && (d.includes('rejected') || d.includes('not generated') || d.includes('missing'))) {
      patch.expectEvent = false;
    }
    if (d.includes('a01') && d.includes('not mistakenly')) {
      patch.encounterClass = 'IMP';
      patch.expectEvent = false;
    }
  }

  // CDA Events
  if (eventType === 'DISCHARGE_SUMMARY' || eventType === 'NEWBORN_DISCHARGE' || eventType === 'MATERNAL_DISCHARGE') {
    patch.claimType = 'Institutional';
    patch.claimSubType = 'IMP';
    patch.encounterClass = 'IMP';
    patch.encounterEndDate = new Date();
    patch.hospitalDischargeDisposition = '4'; // Home/Other
    if (eventType === 'DISCHARGE_SUMMARY') {
      patch.isNewborn = 'N';
      patch.isMaternity = 'N';
    }
    if (eventType === 'NEWBORN_DISCHARGE') {
      patch.isNewborn = 'Y';
      patch.isMaternity = 'N';
    }
    if (eventType === 'MATERNAL_DISCHARGE') {
      patch.isMaternity = 'Y';
      patch.gender = 'F';
      patch.isNewborn = 'N';
    }
  }

  if (eventType === 'OUTPATIENT_ENCOUNTER_SUMMARY') {
    patch.encounterClass = 'AMB';
    patch.encounterEndDate = new Date();
    patch.encounterStatus = 'finished';
    patch.serviceCode = '99213';
  }


  if (eventType === 'OPERATIVE_NOTE') {
    // ── Baseline defaults (overridden per-scenario below) ─────────────────
    patch.serviceType = 'PROCEDURE';
    patch.serviceCode = '10021';
    patch.encounterEndDate = new Date();
    patch.encounterStatus = 'finished';

    // ── ENCOUNTERSTATUS: extract value from description ────────────────────
    // extractExplicitScenarioValues does NOT cover ENCOUNTERSTATUS, so we
    // read it here to support all status-variant positive scenarios
    // (TC-11→TC-19: planned, in-progress, arrived, cancelled, onleave,
    //  unknown, triaged, entered-in-error, waitlist)
    // and the empty-status negative scenario (TC-N19).
    const encounterStatusValue = extractQuotedAssignment(description, 'ENCOUNTERSTATUS');
    if (encounterStatusValue !== undefined) {
      patch.encounterStatus = encounterStatusValue;
      if (encounterStatusValue === '') {
        // TC-N19: empty ENCOUNTERSTATUS must not generate event
        patch.expectEvent = false;
      }
    }

    // ── SERVICECODE edge cases ─────────────────────────────────────────────
    // TC-N20: empty SERVICECODE
    if (d.includes("servicecode=''") || d.includes('servicecode is missing')) {
      patch.serviceCode = '';
      patch.expectEvent = false;
    }
    // TC-N21: whitespace-only SERVICECODE (SERVICECODE=' ')
    if (d.includes('servicecode is whitespace')) {
      patch.serviceCode = ' ';
      patch.expectEvent = false;
    }

    // ── SERVICETYPE edge cases ─────────────────────────────────────────────
    // TC-N18: empty SERVICETYPE must not generate event
    if (d.includes("servicetype=''")) {
      patch.serviceType = '';
      patch.expectEvent = false;
    }

    // ── ENDDATE edge cases ────────────────────────────────────────────────
    // TC-N22: null ENDDATE must not generate event
    if (d.includes('enddate is null')) {
      patch.encounterEndDate = null;
      patch.expectEvent = false;
    }
  }

  // FHIR Events
  if (eventType === 'LAB_ORDER' || eventType === 'LAB_RESULT') {
    patch.serviceType = 'LAB';
    patch.serviceCode = '80061';
    patch.encounterEndDate = new Date();
    patch.encounterClass = 'AMB';
    if (eventType === 'LAB_RESULT') {
      patch.supportingAttachment = 'exists';
    }
  }

  if (eventType === 'MEDICATION_REQUEST' || eventType === 'MEDICATION_DISPENSE') {
    patch.serviceType = 'Medication Codes';
    patch.serviceDesc = 'Aspirin 81mg';
    patch.encounterEndDate = new Date();
  }

  if (eventType === 'RADIOLOGY_ORDER' || eventType === 'RADIOLOGY_RESULT') {
    patch.serviceType = eventType === 'RADIOLOGY_ORDER' ? 'RADIOLOGY-ORDER' : 'RADIOLOGY-RESULT';
    patch.serviceCode = '71045';
    patch.encounterEndDate = new Date();
    patch.encounterClass = 'AMB';
    if (eventType === 'RADIOLOGY_RESULT') {
      patch.supportingAttachment = 'exists';
    }
  }

  Object.assign(patch, explicitValues);

  if (eventType === 'RADIOLOGY_ORDER' || eventType === 'RADIOLOGY_RESULT') {
    const targetServiceType = eventType === 'RADIOLOGY_ORDER' ? 'RADIOLOGY-ORDER' : 'RADIOLOGY-RESULT';
    if (!patch.serviceType || patch.serviceType.toUpperCase() === 'IMAGING') {
      patch.serviceType = targetServiceType;
    }
  }

  if (
    explicitValues.category !== undefined &&
    explicitValues.category.trim().toLowerCase() !== 'info'
  ) {
    patch.supportingValueMustContain = undefined;
    patch.supportingValueMustNotContain = undefined;
  }
  if (
    eventType === 'A02' &&
    explicitValues.supportingValue !== undefined &&
    (explicitValues.category === undefined || explicitValues.category.trim().toLowerCase() === 'info')
  ) {
    const support = explicitValues.supportingValue.toLowerCase();
    if (support.includes('ward')) {
      patch.supportingValueMustContain = 'ward';
      patch.supportingValueMustNotContain = undefined;
    } else if (support.includes('bed')) {
      patch.supportingValueMustContain = 'bed';
      patch.supportingValueMustNotContain = undefined;
    } else if (support.includes('room')) {
      patch.supportingValueMustContain = 'room';
      patch.supportingValueMustNotContain = undefined;
    }
  }

  if (Object.keys(patch).length === 0) {
    return config;
  }
  return mergeConfig(eventType, scenarioId, description, { ...config, ...patch });
}

function rulesForA01(scenarioId, description) {
  if (scenarioId && scenarioId.startsWith('TC-')) {
    const expectEvent = !scenarioId.includes('-R') &&
      !scenarioId.includes('-N') &&
      !scenarioId.includes('-NB07') &&
      !scenarioId.includes('-F04') &&
      !scenarioId.includes('-F07');

    let encounterClass = 'IMP';
    if (scenarioId === 'TC-P02') encounterClass = 'SS';
    if (scenarioId === 'TC-N01') encounterClass = 'AMB';

    let encounterStartDate;
    let encounterEndDate;
    if (scenarioId === 'TC-N04') {
      encounterStartDate = new Date(Date.now() + 7 * 86400000);
    }
    if (scenarioId === 'TC-N05') {
      encounterStartDate = new Date();
      encounterEndDate = new Date(Date.now() - 3600000);
    }

    return mergeConfig('A01', scenarioId, description, {
      encounterClass,
      expectEvent,
      ...(encounterStartDate ? { encounterStartDate } : {}),
      ...(encounterEndDate ? { encounterEndDate } : {})
    });
  }

  switch (scenarioId) {
    case 'conformance-a01':
      return mergeConfig('A01', scenarioId, description, {
        encounterClass: 'IMP',
        encounterStatus: 'planned',
        insertEventRow: false
      });
    case 'a01-1':
    case 'a01-15':
      return mergeConfig('A01', scenarioId, description, { encounterClass: 'IMP' });
    case 'a01-2':
    case 'a01-14':
      return mergeConfig('A01', scenarioId, description, { encounterClass: 'SS' });
    case 'a01-3':
    case 'a01-11':
    case 'a01-16':
      return mergeConfig('A01', scenarioId, description, {
        encounterClass: scenarioId === 'a01-16' ? 'AMB' : 'UNKNOWN',
        expectEvent: false
      });
    case 'a01-4':
      return mergeConfig('A01', scenarioId, description, { encounterClass: 'imp' });
    case 'a01-5':
      return mergeConfig('A01', scenarioId, description, { encounterClass: 'ss' });
    case 'a01-6':
      return mergeConfig('A01', scenarioId, description, { encounterClass: ' IMP' });
    case 'a01-7':
      return mergeConfig('A01', scenarioId, description, { encounterClass: 'IMP ' });
    case 'a01-9':
      return mergeConfig('A01', scenarioId, description, { encounterClass: '', expectEvent: false, expectGenerationSuccess: false });
    case 'a01-10':
      return mergeConfig('A01', scenarioId, description, { encounterClass: null, expectEvent: false, expectGenerationSuccess: false });
    case 'a01-17':
      return mergeConfig('A01', scenarioId, description, {
        encounterClass: 'IMP',
        encounterStatus: 'transfer',
        expectEvent: false
      });
    case 'a01-18':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: `CLMA0118${Date.now().toString().slice(-8)}`
      });
    case 'a01-19':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: '',
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a01-20':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a01-21':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: `CLM-TEST_#${Date.now().toString().slice(-5)}`
      });
    case 'a01-22':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: `CLM${'X'.repeat(30)}${Date.now().toString().slice(-5)}`.slice(0, 40)
      });
    case 'a01-23':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: `${Date.now()}`.slice(0, 15)
      });
    case 'a01-24':
      return mergeConfig('A01', scenarioId, description, {
        provClaimNo: `CLM24${Date.now().toString().slice(-8)}`
      });
    case 'a01-79':
      return mergeConfig('A01', scenarioId, description, { encounterClass: '   ', expectEvent: false });
    case 'a01-88':
      return mergeConfig('A01', scenarioId, description, {
        encounterClass: null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    default:
      if (/^a01-(30|31|32|33|34|35|36|37|39|46|51|86|93)$/.test(scenarioId)) {
        return mergeConfig('A01', scenarioId, description, {
          encounterClass: 'IMP',
          expectEvent: false
        });
      }
      if (/^a01-(25|26|27|28|29|38|40|41|42|43|44|45|52|53|54|55|56|57|58|59|60)/.test(scenarioId)) {
        return mergeConfig('A01', scenarioId, description, { encounterClass: 'IMP' });
      }
      return applyDescriptionInference(
        'A01',
        scenarioId,
        description,
        mergeConfig('A01', scenarioId, description, {
          encounterClass: inferExpectEvent(description) ? 'IMP' : 'AMB'
        })
      );
  }
}

function rulesForA02(scenarioId, description) {
  switch (scenarioId) {
    case 'a02-1':
    case 'a02-19':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'Room'
      });
    case 'a02-2':
    case 'a02-20':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'Room Number'
      });
    case 'a02-3':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'transfer to room 302'
      });
    case 'a02-4':
      return mergeConfig('A02', scenarioId, description, {
        category: 'update',
        supportingValue: 'Room',
        expectEvent: false
      });
    case 'a02-5':
      return mergeConfig('A02', scenarioId, description, { category: 'info' });
    case 'a02-6':
      return mergeConfig('A02', scenarioId, description, { category: 'INFO' });
    case 'a02-7':
      return mergeConfig('A02', scenarioId, description, { category: ' info' });
    case 'a02-8':
      return mergeConfig('A02', scenarioId, description, { category: 'info ' });
    case 'a02-9':
      return mergeConfig('A02', scenarioId, description, { category: '', expectEvent: false, expectGenerationSuccess: false });
    case 'a02-10':
      return mergeConfig('A02', scenarioId, description, { category: null, expectEvent: false, expectGenerationSuccess: false });
    case 'a02-11':
      return mergeConfig('A02', scenarioId, description, {
        category: 'random',
        supportingValue: 'Room',
        expectEvent: false
      });
    case 'a02-13':
      return mergeConfig('A02', scenarioId, description, {
        provClaimNo: '',
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a02-14':
      return mergeConfig('A02', scenarioId, description, {
        provClaimNo: null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a02-15':
      return mergeConfig('A02', scenarioId, description, {
        provClaimNo: `CLM-A02-15-${Date.now().toString().slice(-6)}`
      });
    case 'a02-21':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'Moved to Ward 5',
        supportingValueMustContain: 'ward'
      });
    case 'a02-22':
    case 'a02-90':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'General health observation',
        supportingValueMustNotContain: 'room|ward|bed',
        expectEvent: false
      });
    case 'a02-23':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'patient moved to room 12',
        supportingValueMustContain: 'room'
      });
    case 'a02-24':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: 'Patient Room transfer',
        supportingValueMustContain: 'room'
      });
    case 'a02-27':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: '',
        expectEvent: false
      });
    case 'a02-28':
      return mergeConfig('A02', scenarioId, description, {
        category: 'info',
        supportingValue: null,
        expectEvent: false
      });
    case 'a02-29':
    case 'a02-91':
      return mergeConfig('A02', scenarioId, description, {
        category: '   ',
        supportingValue: '   ',
        expectEvent: false
      });
    default:
      return applyDescriptionInference(
        'A02',
        scenarioId,
        description,
        mergeConfig('A02', scenarioId, description, {
          encounterClass: 'IMP',
          category: inferExpectEvent(description) ? 'info' : 'update',
          supportingValue: inferExpectEvent(description) ? 'Room 101' : 'No location change',
          supportingValueMustContain: inferExpectEvent(description) ? 'room' : undefined,
          supportingValueMustNotContain: inferExpectEvent(description) ? undefined : 'room|ward|bed'
        })
      );
  }
}

function rulesForA03(scenarioId, description) {
  switch (scenarioId) {
    case 'a03-1':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: new Date()
      });
    case 'a03-2':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a03-3':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: '',
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a03-4':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: '   ',
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a03-5':
    case 'a03-8':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: new Date()
      });
    case 'a03-6':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: new Date(Date.now() + 7 * 86400000)
      });
    case 'a03-7':
      return mergeConfig('A03', scenarioId, description, {
        encounterClass: 'IMP',
        encounterEndDate: 'INVALID_DATE',
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a03-10':
    case 'a03-11':
      return mergeConfig('A03', scenarioId, description, {
        provClaimNo: scenarioId === 'a03-10' ? '' : null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    default: {
      const expectEvent = inferExpectEvent(description);
      return applyDescriptionInference(
        'A03',
        scenarioId,
        description,
        mergeConfig('A03', scenarioId, description, {
          encounterClass: 'IMP',
          encounterEndDate: expectEvent ? new Date() : null,
          // Oracle ENCOUNTERENDDATE is NOT NULL — null value will always fail the INSERT
          expectGenerationSuccess: expectEvent ? true : false
        })
      );
    }
  }
}

function rulesForA04(scenarioId, description) {
  switch (scenarioId) {
    case 'a04-1':
    case 'a04-5':
      return mergeConfig('A04', scenarioId, description, {
        provClaimNo: null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a04-2':
    case 'a04-11':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'AMB' });
    case 'a04-3':
      return mergeConfig('A04', scenarioId, description, { documentId: 'CLAIM-ENCOUNTER-001' });
    case 'a04-4':
      return mergeConfig('A04', scenarioId, description, {
        encounterClass: 'EMER',
        documentId: 'CLAIM-ENCOUNTER-004'
      });
    case 'a04-6':
      return mergeConfig('A04', scenarioId, description, {
        provClaimNo: '',
        expectEvent: false,
        expectGenerationSuccess: false
      });
    case 'a04-7':
      return mergeConfig('A04', scenarioId, description, { documentId: null, expectEvent: false, expectGenerationSuccess: false });
    case 'a04-8':
      return mergeConfig('A04', scenarioId, description, { documentId: '', expectEvent: false });
    case 'a04-9':
      return mergeConfig('A04', scenarioId, description, { encounterClass: null, expectEvent: false, expectGenerationSuccess: false });
    case 'a04-10':
      return mergeConfig('A04', scenarioId, description, {
        encounterClass: 'AMB',
        documentId: 'CLAIM-ENCOUNTER-010'
      });
    case 'a04-12':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'EMER' });
    case 'a04-13':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'HH' });
    case 'a04-14':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'IMP' });
    case 'a04-15':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'SS' });
    case 'a04-16':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'imp' });
    case 'a04-17':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'ss' });
    case 'a04-18':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'IMP ' });
    case 'a04-19':
      return mergeConfig('A04', scenarioId, description, { encounterClass: ' SS' });
    case 'a04-20':
      return mergeConfig('A04', scenarioId, description, {
        encounterClass: 'UNKNOWN',
        expectEvent: false
      });
    case 'a04-22':
      return mergeConfig('A04', scenarioId, description, {
        documentId: `UNIQUE-${scenarioId.toUpperCase()}`
      });
    case 'a04-23':
      return mergeConfig('A04', scenarioId, description, { documentId: 'DUPLICATE-123' });
    case 'a04-24':
      return mergeConfig('A04', scenarioId, description, { documentId: 'MISSING-BENEFICIARY' });
    case 'a04-25':
      return mergeConfig('A04', scenarioId, description, { documentId: 'MATCH-ONE-BENEFICIARY' });
    case 'a04-26':
    case 'a04-27':
      return mergeConfig('A04', scenarioId, description, { documentId: null, expectEvent: false, expectGenerationSuccess: false });
    case 'a04-28':
      return mergeConfig('A04', scenarioId, description, { documentId: 'Špec!@#123' });
    case 'a04-29':
      return mergeConfig('A04', scenarioId, description, { documentId: 'AbCd1234' });
    case 'a04-30':
      return mergeConfig('A04', scenarioId, description, { documentId: 'D'.repeat(120) });
    case 'a04-31':
      return mergeConfig('A04', scenarioId, description, { documentId: '123456789012345' });
    case 'a04-14':
    case 'a04-79':
      return mergeConfig('A04', scenarioId, description, {
        encounterClass: 'IMP',
        expectEvent: false
      });
    case 'a04-15':
    case 'a04-80':
      return mergeConfig('A04', scenarioId, description, {
        encounterClass: 'SS',
        expectEvent: false
      });
    case 'a04-59':
      return mergeConfig('A04', scenarioId, description, { encounterClass: 'outpatient' });
    case 'a04-81':
    case 'a04-85':
      return mergeConfig('A04', scenarioId, description, {
        encounterClass: null,
        documentId: null,
        expectEvent: false,
        expectGenerationSuccess: false
      });
    default: {
      const expectEvent = inferExpectEvent(description);
      return applyDescriptionInference(
        'A04',
        scenarioId,
        description,
        mergeConfig('A04', scenarioId, description, {
          encounterClass: expectEvent ? 'AMB' : 'UNKNOWN',
          documentId: expectEvent ? undefined : null,
          // Oracle DOCUMENTID is NOT NULL — null value will always fail the INSERT for negative scenarios
          expectGenerationSuccess: expectEvent ? true : false
        })
      );
    }
  }
}

function rulesForMedicationRequest(scenarioId, description) {
  const expectEvent = inferExpectEvent(description);
  const isNegative = scenarioId?.includes('-N') || !expectEvent;

  const explicitValues = extractExplicitScenarioValues(description);
  const serviceType = explicitValues.serviceType ?? (isNegative ? 'LAB' : 'Medication Codes');
  const serviceCode = explicitValues.serviceCode ?? '540101-0422-6410';
  const serviceDesc = explicitValues.serviceDesc ?? 'Bedside Ultrasound';

  return mergeConfig('MEDICATION_REQUEST', scenarioId, description, {
    serviceType,
    serviceCode,
    serviceDesc,
    encounterEndDate: new Date(),
    expectEvent: !isNegative,
    expectGenerationSuccess: true
  });
}

/** @deprecated Use getScenarioConfig */
export function getScenarioOverrides(eventType, scenarioId) {
  return getScenarioConfig(eventType, scenarioId);
}

export function getScenarioConfig(eventType, scenarioId, description = '') {
  const normalized = eventType?.toUpperCase?.() || 'A01';
  let config;
  switch (normalized) {
    case 'A01':
      config = rulesForA01(scenarioId, description);
      break;
    case 'A02':
      config = rulesForA02(scenarioId, description);
      break;
    case 'A03':
      config = rulesForA03(scenarioId, description);
      break;
    case 'A04':
      config = rulesForA04(scenarioId, description);
      break;
    case 'MEDICATION_REQUEST':
    case 'MEDICATION_DISPENSE':
      config = rulesForMedicationRequest(scenarioId, description);
      break;
    default:
      config = applyDescriptionInference(
        normalized,
        scenarioId,
        description,
        mergeConfig(normalized, scenarioId, description, {
          encounterClass: inferExpectEvent(description) ? 'IMP' : undefined
        })
      );
  }
  if (!config.tier) {
    config.tier = config.expectEvent === false ? 'negative' : 'positive';
  }
  return config;
}

export function isNegativeScenario(eventType, scenarioId, description = '') {
  const config = getScenarioConfig(eventType, scenarioId, description);
  return config.expectEvent === false || config.expectGenerationSuccess === false;
}
