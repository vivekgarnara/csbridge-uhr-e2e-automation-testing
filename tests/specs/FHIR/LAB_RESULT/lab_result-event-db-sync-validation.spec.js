import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/FHIR/fhir-lab_result-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('LAB_RESULT', claimsData.provClaimNos);
