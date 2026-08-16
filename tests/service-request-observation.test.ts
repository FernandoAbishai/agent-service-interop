import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AipIntakeRequest } from '../src/types.ts';
import {
  aipIntakeToServiceRequestObservation,
  ublRfqLineToServiceRequestObservation,
  type UblRequestForQuotationLineObservation
} from '../src/service-request-observation.ts';

const observedAt = '2026-08-16T07:45:00.000Z';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
}

test('AIP intake and UBL RFQ line share only a thin service-request facet', () => {
  const aip = readJson<AipIntakeRequest>('fixtures/aip/intake.request.json');
  const ubl = readJson<UblRequestForQuotationLineObservation>('fixtures/ubl/rfq-line.example.json');

  const aipRequest = aipIntakeToServiceRequestObservation(aip, observedAt);
  const ublRequest = ublRfqLineToServiceRequestObservation(ubl, observedAt);

  assert.equal(aipRequest.requested_service, 'leak_diagnosis');
  assert.equal(ublRequest.requested_service, 'leak_diagnosis');
  assert.equal(aipRequest.location.postal_code, '92101');
  assert.equal(ublRequest.location.postal_code, '92101');

  assert.equal(aipRequest.source_system, 'aip');
  assert.equal(ublRequest.source_system, 'ubl');
  assert.notEqual(aipRequest.source_id, ublRequest.source_id);
});

test('does not invent equivalence between AIP urgency/availability and UBL delivery period', () => {
  const aip = readJson<AipIntakeRequest>('fixtures/aip/intake.request.json');
  const ubl = readJson<UblRequestForQuotationLineObservation>('fixtures/ubl/rfq-line.example.json');

  const aipRequest = aipIntakeToServiceRequestObservation(aip, observedAt);
  const ublRequest = ublRfqLineToServiceRequestObservation(ubl, observedAt);

  assert.deepEqual(aipRequest.unmapped_source_fields, ['urgency', 'availability_window']);
  assert.ok(ublRequest.unmapped_source_fields.includes('requested_delivery_period'));

  assert.equal('urgency' in aipRequest, false);
  assert.equal('availability_window' in aipRequest, false);
  assert.equal('requested_delivery_period' in ublRequest, false);
  assert.equal('normalized_timing' in aipRequest, false);
  assert.equal('normalized_timing' in ublRequest, false);
});

test('does not absorb UBL procurement document context into the shared service-request facet', () => {
  const ubl = readJson<UblRequestForQuotationLineObservation>('fixtures/ubl/rfq-line.example.json');
  const request = ublRfqLineToServiceRequestObservation(ubl, observedAt);

  assert.ok(request.unmapped_source_fields.includes('rfq_document_context'));
  assert.ok(request.unmapped_source_fields.includes('note'));
  assert.equal('seller_supplier_party' in request, false);
  assert.equal('issue_date' in request, false);
  assert.equal('issue_time' in request, false);
});

test('preserves source absence instead of inventing country data for AIP intake', () => {
  const aip = readJson<AipIntakeRequest>('fixtures/aip/intake.request.json');
  const request = aipIntakeToServiceRequestObservation(aip, observedAt);

  assert.equal(request.location.country, null);
});
