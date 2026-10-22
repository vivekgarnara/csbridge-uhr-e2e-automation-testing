import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/FHIR/fhir-radiology_result-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('RADIOLOGY_RESULT', claimsData.provClaimNos);
