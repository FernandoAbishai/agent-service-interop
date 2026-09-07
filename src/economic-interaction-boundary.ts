/**
 * TH-INTEROP-23 economic-interaction boundary falsifier.
 *
 * These types are research observations, not TriHerm protocol/profile types.
 * They intentionally preserve only semantics that can be compared without
 * normalizing money, commitment, authorization, booking, or operational state.
 */

export type OfferResponseObservation = {
  source_system: 'aip' | 'ubl';
  source_object_type: 'offer' | 'quotation';
  source_id: string;
  observed_at: string;
  request_source: {
    source_object_type: 'intake' | 'request_for_quotation_line';
    source_id: string;
  };
  unmapped_source_fields: string[];
};

export type AipOfferResponseProjection = {
  session_id: string;
  status: string;
  offer?: {
    id: string;
    summary?: string;
    details?: Record<string, unknown>;
    expires?: string;
    bind_endpoint?: string;
    bind_requires?: string[];
    terms_url?: string;
  };
};

export type UblQuotationProjection = {
  quotation_id: string;
  rfq_id: string;
  rfq_line_id: string;
  quotation_line_id: string;
  valid_until?: string | null;
  line_items?: Array<Record<string, unknown>>;
  total_amount?: string | null;
  currency?: string | null;
  note?: string | null;
};

export type UblOrderProjection = {
  order_id: string;
  quotation_id?: string | null;
  buyer_party_id: string;
  seller_party_id: string;
  issue_date: string;
  note?: string | null;
};

export function aipOfferToOfferResponseObservation(
  response: AipOfferResponseProjection,
  observedAt: string
): OfferResponseObservation {
  if (response.status !== 'offer' || !response.offer) {
    throw new Error('AIP offer observation requires status=offer with an offer payload');
  }

  const unmapped = ['summary'];
  if (response.offer.details) unmapped.push('details');
  if (response.offer.expires) unmapped.push('expires');
  if (response.offer.bind_endpoint) unmapped.push('bind_endpoint');
  if (response.offer.bind_requires) unmapped.push('bind_requires');
  if (response.offer.terms_url) unmapped.push('terms_url');

  return {
    source_system: 'aip',
    source_object_type: 'offer',
    source_id: response.offer.id,
    observed_at: observedAt,
    request_source: {
      source_object_type: 'intake',
      source_id: response.session_id
    },
    unmapped_source_fields: unmapped
  };
}

export function ublQuotationToOfferResponseObservation(
  quotation: UblQuotationProjection,
  observedAt: string
): OfferResponseObservation {
  const unmapped = ['quotation_document_context', 'quotation_line_id'];
  if (quotation.valid_until != null) unmapped.push('valid_until');
  if (quotation.line_items) unmapped.push('line_items');
  if (quotation.total_amount != null) unmapped.push('total_amount');
  if (quotation.currency != null) unmapped.push('currency');
  if (quotation.note) unmapped.push('note');

  return {
    source_system: 'ubl',
    source_object_type: 'quotation',
    source_id: quotation.quotation_id,
    observed_at: observedAt,
    request_source: {
      source_object_type: 'request_for_quotation_line',
      source_id: `${quotation.rfq_id}:${quotation.rfq_line_id}`
    },
    unmapped_source_fields: unmapped
  };
}

export function compareCommitmentBoundary(
  aipBind: {
    session_id: string;
    offer_id: string;
    agent: { id: string; consent_scope: string[] };
    bind_data: Record<string, unknown>;
  },
  ublOrder: UblOrderProjection
) {
  return {
    normalized_commitment: null,
    source_transitions: [
      {
        source_system: 'aip',
        source_object_type: 'bind_request',
        source_refs: {
          session_id: aipBind.session_id,
          offer_id: aipBind.offer_id,
          agent_id: aipBind.agent.id
        },
        unmapped_source_fields: ['consent_scope', 'bind_data']
      },
      {
        source_system: 'ubl',
        source_object_type: 'order',
        source_refs: {
          order_id: ublOrder.order_id,
          quotation_id: ublOrder.quotation_id ?? null,
          buyer_party_id: ublOrder.buyer_party_id,
          seller_party_id: ublOrder.seller_party_id
        },
        unmapped_source_fields: ['issue_date', ...(ublOrder.note ? ['note'] : [])]
      }
    ],
    blocking_differences: [
      'aip_bind_relationship_handoff_vs_ubl_order_contractual_obligation',
      'actor_authorization_and_party_authority_are_not_equivalent',
      'booking_payment_and_work_authorization_are_not_implied'
    ]
  } as const;
}
