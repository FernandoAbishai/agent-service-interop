import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AipIntakeRequest } from '../src/types.ts';
import {
  aipIntakeToRequirementObservation,
  ublRfqLineToRequirementObservation,
  type UblRequestForQuotationLineObservation
} from '../src/requirement-observation.ts';

const observedAt = '2026-08-16T07:45:00.000Z';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
}

test('AIP intake and UBL RFQ line share only a thin service-request facet', () => {
  const aip = readJson<AipIntakeRequest>('fixtures/aip/intake.request.json');
  const ubl = readJson<UblRequestForQuotationLineObservation>('fixtures/ubl/rfq-line.example.json');

  const aipRequirement = aipIntakeToRequirementObservation(aip, observedAt);
  const ublRequirement = ublRfqLineToRequirementObservation(ubl, observedAt);

  assert.equal(aipRequirement.requested_service, 'leak_diagnosis');
  assert.equal(ublRequirement.requested_service, 'leak_diagnosis');
  assert.equal(aipRequirement.location.postal_code, '92101');
  assert.equal(ublRequirement.location.postal_code, '92101');

  assert.equal(aipRequirement.source_system, 'aip');
  assert.equal(ublRequirement.source_system, 'ubl');
  assert.notEqual(aipRequirement.source_id, ublRequirement.source_id);
});

test('does not invent equivalence between AIP urgency/availability and UBL delivery period', () => {
  const aip = readJson<AipIntakeRequest>('fixtures/aip/intake.request.json');
  const ubl = readJson<UblRequestForQuotationLineObservation>('fixtures/ubl/rfq-line.example.json');

  const aipRequirement = aipIntakeToRequirementObservation(aip, observedAt);
  const ublRequirement = ublRfqLineToRequirementObservation(ubl, observedAt);

  assert.deepEqual(aipRequirement.unmapped_source_fields, ['urgency', 'availability_window']);
  assert.ok(ublRequirement.unmapped_source_fields.includes('requested_delivery_period'));

  assert.equal('urgency' in aipRequirement, false);
  assert.equal('availability_window' in aipRequirement, false);
  assert.equal('requested_delivery_period' in ublRequirement, false);
  assert.equal('normalized_timing' in aipRequirement, false);
  assert.equal('normalized_timing' in ublRequirement, false);
});

test('does not absorb UBL procurement document context into the shared requirement facet', () => {
  const ubl = readJson<UblRequestForQuotationLineObservation>('fixtures/ubl/rfq-line.example.json');
  const requirement = ublRfqLineToRequirementObservation(ubl, observedAt);

  assert.ok(requirement.unmapped_source_fields.includes('rfq_document_context'));
  assert.ok(requirement.unmapped_source_fields.includes('note'));
  assert.equal('seller_supplier_party' in requirement, false);
  assert.equal('issue_date' in requirement, false);
  assert.equal('issue_time' in requirement, false);
});

test('preserves source absence instead of inventing country data for AIP intake', () => {
  const aip = readJson<AipIntakeRequest>('fixtures/aip/intake.request.json');
  const requirement = aipIntakeToRequirementObservation(aip, observedAt);

  assert.equal(requirement.location.country, null);
});
