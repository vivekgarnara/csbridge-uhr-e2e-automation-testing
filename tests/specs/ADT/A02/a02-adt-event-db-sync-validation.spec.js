import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/ADT/adt-a02-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('A02', claimsData.provClaimNos);
