import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileFsmStore } from '../src/fsm-store.ts';
import { PlumbingAipAdapter } from '../src/aip-adapter.ts';
import {
  aipOfferToOfferResponseObservation,
  compareCommitmentBoundary,
  ublQuotationToOfferResponseObservation,
  type UblOrderProjection,
  type UblQuotationProjection
} from '../src/economic-interaction-boundary.ts';
import {
  aipIntakeToServiceRequestObservation,
  ublRfqLineToServiceRequestObservation,
  type UblRequestForQuotationLineObservation
} from '../src/service-request-observation.ts';
import type { AipIntakeRequest } from '../src/types.ts';

const observedAt = '2026-09-07T09:10:00.000Z';

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

function buildAipOffer() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-service-interop-economic-boundary-'));
  let i = 0;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  ];
  const intake = readJson<AipIntakeRequest>(new URL('../fixtures/aip/intake.request.json', import.meta.url));
  const adapter = new PlumbingAipAdapter({
    store: new FileFsmStore(join(dir, 'fsm.json')),
    now: () => new Date('2026-08-15T00:00:00.000Z'),
    idFactory: () => ids[i++]
  });
  const offer = adapter.submit(intake, 'https://adapter.example');
  return { dir, intake, offer };
}

test('request-to-offer relation survives AIP and UBL without merging source identities', () => {
  const { dir, intake, offer } = buildAipOffer();
  const rfq = readJson<UblRequestForQuotationLineObservation>(new URL('../fixtures/ubl/rfq-line.example.json', import.meta.url));
  const quotation = readJson<UblQuotationProjection>(new URL('../fixtures/ubl/quotation.example.json', import.meta.url));

  try {
    const aipRequest = aipIntakeToServiceRequestObservation(intake, observedAt);
    const aipOffer = aipOfferToOfferResponseObservation(offer, observedAt);
    const ublRequest = ublRfqLineToServiceRequestObservation(rfq, observedAt);
    const ublOffer = ublQuotationToOfferResponseObservation(quotation, observedAt);

    assert.equal(aipOffer.request_source.source_id, aipRequest.source_id);
    assert.equal(ublOffer.request_source.source_id, ublRequest.source_id);
    assert.notEqual(aipOffer.source_id, ublOffer.source_id);
    assert.notEqual(aipOffer.request_source.source_id, ublOffer.request_source.source_id);
    assert.equal(aipOffer.source_object_type, 'offer');
    assert.equal(ublOffer.source_object_type, 'quotation');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('offer-response observation refuses to equate validity, money, or provider-specific terms', () => {
  const { dir, offer } = buildAipOffer();
  const quotation = readJson<UblQuotationProjection>(new URL('../fixtures/ubl/quotation.example.json', import.meta.url));

  try {
    const aip = aipOfferToOfferResponseObservation(offer, observedAt);
    const ubl = ublQuotationToOfferResponseObservation(quotation, observedAt);

    assert.ok(aip.unmapped_source_fields.includes('expires'));
    assert.ok(ubl.unmapped_source_fields.includes('valid_until'));
    assert.ok(aip.unmapped_source_fields.includes('details'));
    assert.ok(ubl.unmapped_source_fields.includes('total_amount'));
    assert.ok(ubl.unmapped_source_fields.includes('currency'));

    for (const observation of [aip, ubl] as Array<Record<string, unknown>>) {
      for (const forbidden of ['valid_until', 'expires', 'amount', 'total', 'currency', 'price', 'status', 'accepted', 'commitment', 'payment']) {
        assert.equal(forbidden in observation, false, `${forbidden} must not be normalized into OfferResponseObservation`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AIP Bind and UBL Order remain distinct commitment candidates instead of becoming accepted=true', () => {
  const order = readJson<UblOrderProjection>(new URL('../fixtures/ubl/order.example.json', import.meta.url));
  const comparison = compareCommitmentBoundary({
    session_id: '37a606b6-86f3-4b6c-8e12-a4db917802ba',
    offer_id: '11111111-1111-4111-8111-111111111111',
    bind_data: { full_name: 'Jane Fixture', phone: '+1-555-0100' },
    agent: { id: 'fixture-agent-001', consent_scope: ['intake', 'offer', 'bind'] }
  }, order);

  assert.equal(comparison.normalized_commitment, null);
  assert.deepEqual(
    comparison.source_transitions.map((transition) => transition.source_object_type),
    ['bind_request', 'order']
  );
  assert.ok(comparison.blocking_differences.includes('aip_bind_relationship_handoff_vs_ubl_order_contractual_obligation'));
  assert.ok(comparison.blocking_differences.includes('booking_payment_and_work_authorization_are_not_implied'));
  assert.equal('accepted' in comparison, false);
  assert.equal('commitment_id' in comparison, false);
  assert.equal('job_id' in comparison, false);
  assert.equal('payment' in comparison, false);
});

test('economic boundary falsifier remains outside the protocol kernel contract', () => {
  const kernelSchema = readJson<any>(new URL('../schemas/triherm-kernel-envelope.schema.json', import.meta.url));
  for (const field of ['request', 'offer', 'quotation', 'commitment', 'order', 'accepted', 'payment']) {
    assert.equal(field in kernelSchema.properties, false);
  }
});
