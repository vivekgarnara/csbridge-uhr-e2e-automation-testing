# Prompt for Antigravity — Build Conformance Test Automation Suite (Phase 1)

## 0. Before you write any code

Scan the existing repository first and detect:
- The test framework currently in use (e.g. Playwright, Jest, Mocha, WebdriverIO) and its config/reporter setup.
- The language (TypeScript vs JavaScript) and lint/format rules (`.eslintrc`, `tsconfig.json`, `prettier` config).
- How DB connections are currently established anywhere in the repo (look for any existing DB client/helper, e.g. `mssql`, `pg`, `mysql2`, `knex`, `typeorm`, a `db/` or `utils/db*` folder, `.env`/`config/*.ts`). Reuse that exact client and connection pattern — do not introduce a second DB library if one already exists.
- Any existing HTTP/API client wrapper, logger, retry/wait utility, or test-data factory pattern already used elsewhere in the repo, and reuse them instead of writing new ones from scratch.
- The existing `specs/conformance` folder content in full before deleting it — extract and preserve any reusable logic (DB helpers, config, patient data generators, constants) into the new structure rather than discarding it.

If no existing DB client or HL7 parsing capability is found in the repo, default to:
- DB client: `mssql` (unless the connection string / existing `.env` clearly indicates Postgres/MySQL — detect from config first).
- HL7 parsing: `simple-hl7` or `hl7-standard` npm packages — verify which one supports parsing an ER7 (pipe-delimited) `ACK^A01` / generic ACK message and reading `MSA.1`. Add whichever is chosen to `package.json`.

State any assumption you make in your final summary so it can be corrected.

---

## 1. Restructure the folders

1. Delete the existing `specs/conformance` folder (after extracting reusable pieces per Section 0).
2. Create a new top-level folder: `Conformance/`
3. Inside `Conformance/`, create exactly 3 subfolders, one per CTS scenario group:
   - `Conformance/01-patient-A-register-admit-cancel/` → **build full test script here (this task)**
   - `Conformance/02-patient-B-admit-update-transfer-discharge/` → leave **empty** (placeholder `README.md` only, stating "Scripts to be added — see CTS section 1.2")
   - `Conformance/03-patient-C-preadmit-move-visit-update/` → leave **empty** (placeholder `README.md` only, stating "Scripts to be added — see CTS section 1.3")

Naming convention: keep folder names in kebab-case matching the CTS scenario titles above, or match the naming convention already used elsewhere in the repo if one exists (prefer consistency with repo conventions over the exact names above).

---

## 2. Business context (for reference while coding)

This suite automates NPHIES ADT conformance testing (CTS section 1.1, "Patient A: Register, Admit, Cancel Admission"). Reference data lives in two spreadsheets already reviewed — **CTS (Conformance Testing Scenarios)** and **AESG (ADT Event Submission Guide)**. Their content is summarized below; treat it as authoritative for table/column names and sequencing.

### Flow being automated (Patient A, CTS 1.1.1 → 1.1.9)

```
Step 1: A04 (Register Patient) — full data insert
  → poll local `events` table until QA env sets ISSUBMITTED = 1
  → fetch matching row in QA `event_transaction_log`, column `response_body`
  → parse HL7 ACK message, extract MSA.1
  → assert MSA.1 == 'AA'
  → (fail fast / stop suite for this patient if not AA)

Step 2: A01 (Admit Patient) — reuses Patient A's existing beneficiary/encounter/claim data,
        only a new `events` row is inserted
  → same poll → fetch → parse → assert AA sequence

Step 3: A11 (Cancel Admit) — prerequisite: A01 event must already exist for this patient
        only a new `events` row is inserted
  → same poll → fetch → parse → assert AA sequence
```

### Data model per AESG (local DB — where we insert test data)

**A04 — Register a Patient (all Insert, brand new patient):**
| Table | Columns |
|---|---|
| `beneficiary` | BENEFICIARYID, PATIENTFILENO, FIRSTNAME, LASTNAME, FULLNAME, DOB, GENDER, DOCUMENTTYPE, DOCUMENTID, EHEALTHID, MARITALSTATUS, OCCUPATION |
| `claimencounters` | PROVCLAIMNO, ENCOUNTERSTARTDATE, ENCOUNTERCLASS, ENCOUNTERID, ENCOUNTERSTATUS |
| `claiminfo` | PROVCLAIMNO, EPISODEID, CLAIMTYPE, CLAIMSUBTYPE, PROVIDERNPHIESID, CLAIMCREATEDDATE, ACCOUNTINGPERIOD, COVERAGEID, BENEFICIARYID |
| `claimcareteam` | PROVCLAIMNO, SEQUENCENO, PHYSICIANID, CARETEAMROLE, CARETEAMQUALIFICATION |
| `events` | EVENTID, PROVCLAIMNO, EVENTTYPE = `'A04'` |

**A01 — Admit Patient (reuses A04's data; only `events` is a fresh insert):**
| Table | Columns | Note |
|---|---|---|
| `beneficiary`, `claimencounters`, `claiminfo`, `claimcareteam` | same columns as above | **Already existed** — do NOT re-insert, reuse the same BENEFICIARYID / PROVCLAIMNO created in Step 1 |
| `events` | EVENTID, PROVCLAIMNO, EVENTTYPE = `'A01'` | Insert only |

**A11 — Cancel Admit (prerequisite: A01 must exist; only `events` is a fresh insert):**
| Table | Columns | Note |
|---|---|---|
| `beneficiary`, `claimencounters`, `claiminfo`, `claimcareteam` | same columns as above | Already existed — no insert |
| `events` | EVENTID, PROVCLAIMNO, EVENTTYPE = `'A11'` | Insert only. **Guard**: verify an `A01` events row exists for this PROVCLAIMNO before inserting; fail the test with a clear error if it doesn't. |

The exact column list/data types/nullability for `beneficiary`, `claimencounters`, `claiminfo`, `claimcareteam`, `events` and the QA-env `event` / `event_transaction_log` tables (including the `ISSUBMITTED` and `response_body` columns) are **not** in the AESG sheet — inspect the actual local/QA database schema directly (or any existing DB migration/model files in the repo) to get exact types before writing insert statements.

---

## 3. Step-by-step script requirements (Phase 1 folder only)

### 3.1 Config / connections
- Add config for **two** DB connections: local DB (where test data is inserted) and QA env DB (where `event` and `event_transaction_log` are read). Use existing repo `.env`/config pattern; do not hardcode credentials in code.
- Fail fast with a clear error if either connection can't be established.

### 3.2 Test data builder
- Build a reusable "Patient A" data factory that generates a unique BENEFICIARYID, PATIENTFILENO, PROVCLAIMNO, ENCOUNTERID, EPISODEID etc. per test run (e.g. via timestamp/uuid suffix) to avoid collisions on repeat runs.
- Keep this patient's identifiers in a shared test-context object so Steps 2 and 3 can reuse them.

### 3.3 A04 step
1. Insert rows into `beneficiary`, `claimencounters`, `claiminfo`, `claimcareteam`, `events` (EVENTTYPE='A04') per the table above, using generated test data.
2. Poll the **local** `events` table (or whatever table QA syncs `ISSUBMITTED` onto — confirm exact table name from schema, it may be `events` or a QA-side `event` table) for the row matching this EVENTID, until `ISSUBMITTED = 1`.
   - Implement as a bounded retry/poll helper: configurable interval (e.g. every 3–5s) and timeout (e.g. 60–120s), not a busy loop. Reuse an existing wait/retry utility in the repo if one exists.
   - On timeout, fail the test with a clear message including EVENTID and elapsed time.
3. Once `ISSUBMITTED = 1`, query the QA env `event_transaction_log` table for the row matching this event (join key TBD from schema — likely EVENTID or a foreign key — confirm from schema) and fetch `response_body`.
4. Parse `response_body` as an HL7 ER7 message (pipe-delimited segments: MSH, MSA, etc.) — **do not** call the external `hl7messageparser.azurewebsites.net` site; implement parsing locally using an HL7 npm library (see Section 0) or a lightweight custom parser if the library doesn't fit. Confirm whether `response_body` needs a decode step first (e.g. base64) by inspecting a real sample value from the DB — the user described it as "encrypted" but it may simply be base64-encoded ER7 text; verify empirically, don't assume.
5. Extract `MSA.1` (Acknowledgement Code) and `MSA.2` (Message Control ID) from the parsed message.
6. Assert `MSA.1 === 'AA'`. Log/report the Message Control ID either way (matches CTS column "Message Control ID").
7. If `MSA.1 !== 'AA'`, fail this test and **do not** proceed to A01/A11 for this patient (they depend on a successful A04).

### 3.4 A01 step (depends on 3.3 passing)
1. Insert only a new `events` row: EVENTTYPE='A01', same PROVCLAIMNO as Step 1.
2. Repeat the poll → fetch `response_body` → parse → assert `MSA.1 === 'AA'` sequence from 3.3 steps 2–7, scoped to this new EVENTID.

### 3.5 A11 step (depends on 3.4 passing; prerequisite check: A01 exists)
1. Before inserting, verify an `events` row with EVENTTYPE='A01' exists for this PROVCLAIMNO (defensive check per AESG's "A01 must exist" prerequisite) — fail clearly if missing.
2. Insert a new `events` row: EVENTTYPE='A11', same PROVCLAIMNO.
3. Repeat the poll → fetch → parse → assert `MSA.1 === 'AA'` sequence.

### 3.6 Test structure
- Structure as one test file (or a `describe`/`test.describe` block) with 3 sequential steps/tests in this order: `A04 - Register Patient`, `A01 - Admit Patient`, `A11 - Cancel Admit`, each depending on the prior step's success (skip or fail downstream steps cleanly if an earlier step fails, rather than throwing unrelated errors).
- Extract the shared "insert events row → poll ISSUBMITTED → fetch response_body → parse HL7 → assert AA" logic into a single reusable helper function (e.g. `submitEventAndVerifyAck(eventType, provClaimNo)`) used by all three steps, since the logic is identical apart from the event type and which supporting tables get inserted first.
- Add teardown/cleanup (or clearly document why cleanup is skipped, e.g. if QA env needs the data to persist for portal verification) so repeat runs don't collide.
- Add logging at each stage (data inserted, polling status, ACK result) to make failures diagnosable without re-running manually.

---

## 4. Explicitly out of scope for this task
- CTS steps 1.1.3, 1.1.6, 1.1.9 (verifying encounter appears/disappears in the NPHIES provider portal UI) — not automated in this phase.
- Scenario folders 2 and 3 (Patient B, Patient C) — create empty with placeholder README only.

## 5. Definition of done
- [ ] `specs/conformance` removed; `Conformance/` created with 3 subfolders as specified.
- [ ] Folders 2 and 3 contain only a placeholder README.
- [ ] Folder 1 contains a working script that: inserts A04 data, polls for submission, fetches and parses the HL7 ACK, asserts AA, then repeats for A01 and A11 using shared patient data.
- [ ] HL7 parsing happens in-process (no dependency on the external azurewebsites parser tool).
- [ ] All DB queries use parameterized queries (no string-concatenated SQL).
- [ ] Assumptions made (DB client, HL7 library, exact QA schema/join keys) are called out in a summary comment or PR description for review.
- [ ] Test run is repeatable without manual DB cleanup between runs.
