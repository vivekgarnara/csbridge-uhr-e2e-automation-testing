/**
 * hl7.service.js
 *
 * HL7 v2.x message parser and validator for UHR automation.
 *
 * Parses pipe-delimited HL7 messages into structured segment objects,
 * provides field-level accessors, and exposes assertion helpers that
 * integrate cleanly with Playwright's `expect` API.
 *
 * Supported segments (extend as needed): MSH, EVN, PID, PV1, DG1, ZBE
 *
 * No external dependencies — pure Node.js.
 */

// ---------------------------------------------------------------------------
// Segment & field separator defaults (HL7 v2 standard)
// ---------------------------------------------------------------------------
const SEG_SEPARATOR   = '\r';   // carriage return between segments
const FIELD_SEPARATOR = '|';
const COMP_SEPARATOR  = '^';
const REP_SEPARATOR   = '~';
const ESC_CHAR        = '\\';
const SUB_SEPARATOR   = '&';

export class Hl7Service {
  // -------------------------------------------------------------------------
  // Parsing
  // -------------------------------------------------------------------------

  /**
   * Parse a raw HL7 v2 message string into an array of segment objects.
   *
   * Each segment object has the shape:
   *   { name: 'PID', fields: ['PID', field1, field2, ...] }
   *
   * Field indices follow the HL7 spec (field[1] = first data field after
   * the segment name).
   *
   * @param {string} rawMessage
   * @returns {{ name: string, fields: string[] }[]}
   */
  parse(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string') {
      throw new Error('[Hl7Service] rawMessage must be a non-empty string');
    }

    // Normalise line endings — some systems use \n instead of \r
    const normalised = rawMessage.replace(/\r\n|\n/g, '\r').trim();
    const lines = normalised.split(SEG_SEPARATOR).filter(Boolean);

    return lines.map(line => {
      const fields = line.split(FIELD_SEPARATOR);
      return { name: fields[0], fields };
    });
  }

  /**
   * Find the first segment with the given name.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @param {string} segmentName  e.g. 'PID'
   * @returns {{ name: string, fields: string[] } | null}
   */
  findSegment(segments, segmentName) {
    return segments.find(s => s.name === segmentName.toUpperCase()) ?? null;
  }

  /**
   * Get all segments with the given name (e.g. multiple OBX segments).
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @param {string} segmentName
   * @returns {{ name: string, fields: string[] }[]}
   */
  findSegments(segments, segmentName) {
    return segments.filter(s => s.name === segmentName.toUpperCase());
  }

  /**
   * Read a specific field value from a segment.
   * Supports component access via dot notation: getField(seg, 3, 1) → first component of field 3.
   *
   * @param {{ name: string, fields: string[] }} segment
   * @param {number} fieldIndex   1-based (field[1] = first data field)
   * @param {number} [compIndex]  1-based component index (optional)
   * @returns {string}
   */
  getField(segment, fieldIndex, compIndex) {
    const raw = segment?.fields?.[fieldIndex] ?? '';
    if (compIndex == null) return raw;
    return raw.split(COMP_SEPARATOR)[compIndex - 1] ?? '';
  }

  // -------------------------------------------------------------------------
  // Well-known field extractors
  // -------------------------------------------------------------------------

  /**
   * Extract the event type from MSH-9 (e.g. 'ADT^A01' → 'A01').
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {string}
   */
  getEventType(segments) {
    const msh = this.findSegment(segments, 'MSH');
    if (!msh) throw new Error('[Hl7Service] MSH segment not found');
    // MSH-9: Message Type (e.g. "ADT^A01^ADT_A01")
    return this.getField(msh, 9, 2);  // component 2 = trigger event
  }

  /**
   * Extract the patient ID from PID-3 (CX component 1 = ID number).
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {string}
   */
  getPatientId(segments) {
    const pid = this.findSegment(segments, 'PID');
    if (!pid) throw new Error('[Hl7Service] PID segment not found');
    return this.getField(pid, 3, 1);
  }

  /**
   * Extract patient name components from PID-5.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {{ family: string, given: string, middle: string }}
   */
  getPatientName(segments) {
    const pid = this.findSegment(segments, 'PID');
    if (!pid) throw new Error('[Hl7Service] PID segment not found');
    return {
      family: this.getField(pid, 5, 1),
      given:  this.getField(pid, 5, 2),
      middle: this.getField(pid, 5, 3),
    };
  }

  /**
   * Extract gender from PID-8.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {string}  e.g. 'M', 'F', 'U'
   */
  getGender(segments) {
    const pid = this.findSegment(segments, 'PID');
    if (!pid) throw new Error('[Hl7Service] PID segment not found');
    return this.getField(pid, 8);
  }

  /**
   * Extract date of birth from PID-7 (format: YYYYMMDD).
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {string}
   */
  getDateOfBirth(segments) {
    const pid = this.findSegment(segments, 'PID');
    if (!pid) throw new Error('[Hl7Service] PID segment not found');
    return this.getField(pid, 7);
  }

  /**
   * Extract the attending doctor ID from PV1-7 (component 1).
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {string}
   */
  getAttendingDoctorId(segments) {
    const pv1 = this.findSegment(segments, 'PV1');
    if (!pv1) throw new Error('[Hl7Service] PV1 segment not found');
    return this.getField(pv1, 7, 1);
  }

  /**
   * Extract admission type from PV1-4.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @returns {string}
   */
  getAdmissionType(segments) {
    const pv1 = this.findSegment(segments, 'PV1');
    if (!pv1) throw new Error('[Hl7Service] PV1 segment not found');
    return this.getField(pv1, 4);
  }

  // -------------------------------------------------------------------------
  // Assertion helpers
  // -------------------------------------------------------------------------

  /**
   * Assert that required segments are present.
   * Throws with a descriptive message if any are missing.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @param {string[]} required  e.g. ['MSH', 'PID', 'PV1']
   */
  assertRequiredSegments(segments, required = ['MSH', 'PID', 'PV1']) {
    const present = new Set(segments.map(s => s.name));
    const missing = required.filter(r => !present.has(r));
    if (missing.length) {
      throw new Error(
        `[Hl7Service] Required segments missing: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Assert that the message carries the expected event type.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @param {string} expected  e.g. 'A01'
   */
  assertEventType(segments, expected) {
    const actual = this.getEventType(segments);
    if (actual.toUpperCase() !== expected.toUpperCase()) {
      throw new Error(
        `[Hl7Service] Event type mismatch — expected ${expected}, got ${actual}`
      );
    }
  }

  /**
   * Assert that the HL7 message contains the given beneficiary/patient ID.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   * @param {string} beneficiaryId
   */
  assertBeneficiaryId(segments, beneficiaryId) {
    const patientId = this.getPatientId(segments);
    if (!patientId.includes(beneficiaryId)) {
      throw new Error(
        `[Hl7Service] Beneficiary ID mismatch — expected "${beneficiaryId}" in PID-3, got "${patientId}"`
      );
    }
  }

  /**
   * Run the full set of standard HL7 assertions for a UHR event:
   *   1. Required segments present (MSH, PID, PV1, EVN)
   *   2. Correct event type in MSH-9
   *   3. Correct beneficiary ID in PID-3
   *
   * @param {string} rawMessage
   * @param {string} expectedEventType   e.g. 'A01'
   * @param {string} expectedBeneficiary
   * @returns {{ name: string, fields: string[] }[]}  parsed segments (for further inspection)
   */
  assertFullMessage(rawMessage, expectedEventType, expectedBeneficiary) {
    const segments = this.parse(rawMessage);

    this.assertRequiredSegments(segments, ['MSH', 'PID', 'PV1', 'EVN']);
    this.assertEventType(segments, expectedEventType);
    this.assertBeneficiaryId(segments, expectedBeneficiary);

    console.log(
      `[Hl7Service] HL7 assertion passed — event: ${expectedEventType}, beneficiary: ${expectedBeneficiary}`
    );

    return segments;
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /**
   * Pretty-print a parsed segment array to the console.
   * Handy for debugging failed tests.
   *
   * @param {{ name: string, fields: string[] }[]} segments
   */
  dump(segments) {
    console.log('[Hl7Service] Parsed message:');
    for (const seg of segments) {
      console.log(`  ${seg.name}: ${seg.fields.slice(1).join(' | ')}`);
    }
  }

  /**
   * Check if a raw message string contains a specific segment name.
   * Quick pre-check before full parsing.
   *
   * @param {string} rawMessage
   * @param {string} segmentName
   * @returns {boolean}
   */
  containsSegment(rawMessage, segmentName) {
    return rawMessage.includes(`\r${segmentName}|`) ||
           rawMessage.startsWith(`${segmentName}|`);
  }
}
