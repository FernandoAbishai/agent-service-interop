import type { AipIntakeRequest } from './types.ts';

/**
 * TH-INTEROP-16 candidate only. Observation-layer vocabulary for testing
 * whether a useful shared Requirement facet exists. It is not a canonical
 * schema object and not a public protocol type.
 */
export type RequirementObservation = {
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

export function aipIntakeToRequirementObservation(
  request: AipIntakeRequest,
  observedAt: string
): RequirementObservation {
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
    // These source semantics matter, but TH-INTEROP-16 has not established
    // equivalence with UBL delivery-period semantics.
    unmapped_source_fields: ['urgency', 'availability_window']
  };
}

export function ublRfqLineToRequirementObservation(
  line: UblRequestForQuotationLineObservation,
  observedAt: string
): RequirementObservation {
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
