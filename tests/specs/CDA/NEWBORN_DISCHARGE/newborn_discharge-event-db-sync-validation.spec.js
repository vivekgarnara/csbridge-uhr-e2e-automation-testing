import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/CDA/cda-newborn_discharge-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('NEWBORN_DISCHARGE', claimsData.provClaimNos);
