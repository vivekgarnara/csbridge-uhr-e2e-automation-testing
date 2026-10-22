import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/ADT/adt-a31-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('A31', claimsData.provClaimNos);
