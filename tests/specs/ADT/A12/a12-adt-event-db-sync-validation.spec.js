import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/ADT/adt-a12-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('A12', claimsData.provClaimNos);
