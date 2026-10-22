import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/FHIR/fhir-radiology_order-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('RADIOLOGY_ORDER', claimsData.provClaimNos);
