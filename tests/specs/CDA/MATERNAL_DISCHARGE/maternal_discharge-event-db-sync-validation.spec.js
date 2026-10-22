import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/CDA/cda-maternal_discharge-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('MATERNAL_DISCHARGE', claimsData.provClaimNos);
