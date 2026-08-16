import type { AipIntakeRequest } from './types.ts';

/**
 * TH-INTEROP-16 earned observation-layer facet.
 *
 * This is intentionally narrower than a universal Requirement object. It
 * captures only service-request semantics that survived the AIP/UBL
 * falsification experiment without inventing lifecycle, timing, identity, or
 * procurement-document equivalence. It is not a canonical schema object and
 * not a public protocol type.
 */
export type ServiceRequestObservation = {
  source_system: 'aip' | 'ubl';
  source_object_type: 'intake' | 'request_for_quotation_line';
  source_id: string;
  observed_at: string;
  requested_service: string;
  location: {
    postal_code: string | null;
    country: string | null;
  };
  unmapped_source_fields: string[];
};

/**
 * Minimal parsed UBL RFQ projection used by the falsifier. The adapter is
 * intentionally downstream of XML parsing/schema validation: this experiment
 * tests semantics, not XML tooling.
 */
export type UblRequestForQuotationLineObservation = {
  rfq_id: string;
  line_id: string;
  item_description: string;
  delivery_postal_code?: string | null;
  delivery_country?: string | null;
  requested_delivery_period?: {
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  note?: string | null;
};

export function aipIntakeToServiceRequestObservation(
  request: AipIntakeRequest,
  observedAt: string
): ServiceRequestObservation {
  return {
    source_system: 'aip',
    source_object_type: 'intake',
    source_id: request.session_id,
    observed_at: observedAt,
    requested_service: request.intake_data.service_need,
    location: {
      postal_code: request.intake_data.postal_code,
      country: null
    },
    // These source semantics matter, but TH-INTEROP-16 did not establish
    // equivalence with UBL delivery-period semantics.
    unmapped_source_fields: ['urgency', 'availability_window']
  };
}

export function ublRfqLineToServiceRequestObservation(
  line: UblRequestForQuotationLineObservation,
  observedAt: string
): ServiceRequestObservation {
  const unmapped = ['rfq_document_context'];
  if (line.requested_delivery_period) unmapped.push('requested_delivery_period');
  if (line.note) unmapped.push('note');

  return {
    source_system: 'ubl',
    source_object_type: 'request_for_quotation_line',
    source_id: `${line.rfq_id}:${line.line_id}`,
    observed_at: observedAt,
    requested_service: line.item_description,
    location: {
      postal_code: line.delivery_postal_code ?? null,
      country: line.delivery_country ?? null
    },
    unmapped_source_fields: unmapped
  };
}
