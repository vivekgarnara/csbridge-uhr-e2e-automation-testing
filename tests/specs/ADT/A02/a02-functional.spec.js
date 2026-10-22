import { runFunctionalScenarioSuite } from '../../../utils/functionalScenarioSuite.js';
import { EVENT_GROUPS } from '../../../utils/testScenarios.js';

const exactValueScenarios = [
  { id: 'A02-P01', category: 'POSITIVE', title: "Verify A02 event generated when CATEGORY = 'info' and SUPPORTINGVALUE = 'Room 301'", generationDescription: "Verify A02 event generated when CATEGORY = 'info' and SUPPORTINGVALUE = 'Room 301'. Insert CATEGORY='info', SUPPORTINGVALUE='Room 301', valid PROVCLAIMNO. A02 event created with MSH.9='ADT^A02'." },
  { id: 'A02-P02', category: 'POSITIVE', title: "Verify A02 event generated when SUPPORTINGVALUE = 'Room Number: 401'", generationDescription: "Verify A02 event generated when CATEGORY='info' and SUPPORTINGVALUE='Room Number: 401'. Room Number keyword triggers transfer detection." },
  { id: 'A02-P03', category: 'POSITIVE', title: 'Verify A02 event generated when SUPPORTINGVALUE uses equivalent location keyword Ward', generationDescription: "Verify A02 event generated when CATEGORY='info' and SUPPORTINGVALUE='Moved to Ward 3B'. Equivalent location keyword triggers transfer detection." },
  { id: 'A02-P04', category: 'POSITIVE', title: 'Verify PV1.3 is populated from SUPPORTINGVALUE room reference', generationDescription: "Verify A02 location mapping when CATEGORY='info' and SUPPORTINGVALUE='Room 5B'. PV1.3 is populated from Room 5B." },
  { id: 'A02-N01', category: 'NEGATIVE', title: "Verify A02 not generated when CATEGORY is not 'info'", generationDescription: "Verify A02 not generated when CATEGORY='diagnosis' and SUPPORTINGVALUE='Room 201'. Category filter excludes the record." },
  { id: 'A02-N02', category: 'NEGATIVE', title: 'Verify A02 not generated when SUPPORTINGVALUE has no room keyword', generationDescription: "Verify A02 not generated when CATEGORY='info' and SUPPORTINGVALUE='Patient requires wheelchair assistance'. No room, ward, or bed keyword exists." },
  { id: 'A02-F01', category: 'FIELD FORMAT', title: 'Verify room keyword detection is case-insensitive', generationDescription: "Verify A02 event generated when CATEGORY='info' and SUPPORTINGVALUE='room 201'. Room keyword detection is case-insensitive." },
  { id: 'A02-F02', category: 'FIELD FORMAT', title: 'Verify SUPPORTINGVALUE with leading/trailing whitespace still triggers detection', generationDescription: "Verify A02 event generated when CATEGORY='info' and SUPPORTINGVALUE='   Room 401   '. System trims value and detects room keyword." }
];

const codedScenarios = EVENT_GROUPS['A02']
  .slice(0, 40)
  .map(({ id, description }) => ({
    id,
    title: description,
    generationDescription: description
  }));

runFunctionalScenarioSuite('A02', [...exactValueScenarios, ...codedScenarios], import.meta.url);
