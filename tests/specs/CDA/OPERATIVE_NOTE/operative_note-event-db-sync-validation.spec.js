import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/CDA/cda-operative_note-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('OPERATIVE_NOTE', claimsData.provClaimNos);
