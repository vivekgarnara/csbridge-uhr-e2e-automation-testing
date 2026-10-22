import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/ADT/adt-a38-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('A38', claimsData.provClaimNos);
