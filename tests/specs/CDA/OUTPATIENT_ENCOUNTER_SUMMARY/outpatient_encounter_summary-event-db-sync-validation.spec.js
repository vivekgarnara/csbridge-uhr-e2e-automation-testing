import { createDbSyncValidationSpec } from '../../../utils/adt-event-db-sync-validation-factory.js';
import claimsData from '../../../../test_data/claims/CDA/cda-outpatient_encounter_summary-claims.json' assert { type: 'json' };

createDbSyncValidationSpec('OUTPATIENT_ENCOUNTER_SUMMARY', claimsData.provClaimNos);
