import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/FHIR/fhir-medication_request-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('MEDICATION_REQUEST', claimsData.provClaimNos);
