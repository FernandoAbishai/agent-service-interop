/**
 * TH-INTEROP-24 exact-money representation falsifier.
 *
 * This module tests an exact base-10 quantity representation across monetary
 * source shapes. It is research-only: these types are not TriHerm protocol,
 * profile, canonical-schema, pricing, payment, or settlement types.
 */

export type ExactAssetRef =
  | {
      namespace: 'iso4217';
      id: string;
    }
  | {
      namespace: 'token';
      network: string;
      id: string;
    };

export type ExactScaledValue = {
  /** Signed arbitrary-precision base-10 integer. */
  coefficient: string;
  /** Mathematical value = coefficient * 10^-scale. */
  scale: number;
};

export type ExactMonetarySourceObservation = {
  source_system: 'ubl' | 'ucp' | 'stripe' | 'x402';
  source_representation:
    | 'decimal_major_units'
    | 'iso4217_minor_units'
    | 'stripe_currency_minor_units'
    | 'token_atomic_units';
  source_amount: string;
  source_scale: number;
  scale_basis: 'source_decimal_lexical' | 'iso4217_exponent' | 'stripe_currency_rules' | 'token_decimals';
  asset: ExactAssetRef;
  exact_value: ExactScaledValue;
};

const INTEGER = /^-?(?:0|[1-9]\d*)$/;
const DERIVED_INTEGER = /^-?\d+$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function requireScale(scale: number): number {
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new Error('scale must be a non-negative safe integer');
  }
  return scale;
}

function requireInteger(value: string): string {
  if (typeof value !== 'string' || !INTEGER.test(value)) {
    throw new Error('amount must be a plain signed base-10 integer string');
  }
  return value;
}

function normalizeScaledValue(coefficient: string, scale: number): ExactScaledValue {
  if (!DERIVED_INTEGER.test(coefficient)) {
    throw new Error('derived coefficient must contain only an optional leading minus and base-10 digits');
  }
  requireScale(scale);

  let normalized = BigInt(coefficient).toString();
  if (normalized === '0') return { coefficient: '0', scale: 0 };

  while (scale > 0 && normalized.endsWith('0')) {
    normalized = normalized.slice(0, -1);
    scale -= 1;
  }

  return { coefficient: normalized, scale };
}

function requireIso4217(code: string): ExactAssetRef {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) {
    throw new Error('ISO 4217 asset id must be a three-letter uppercase code');
  }
  return { namespace: 'iso4217', id: code };
}

function requireTokenAsset(network: string, assetId: string): ExactAssetRef {
  if (typeof network !== 'string' || typeof assetId !== 'string' || !network.trim() || !assetId.trim()) {
    throw new Error('token asset requires explicit network and asset id');
  }
  return { namespace: 'token', network, id: assetId };
}

export function observeDecimalMajorUnits(input: {
  source_system: 'ubl';
  amount: string;
  currency: string;
}): ExactMonetarySourceObservation {
  if (input.source_system !== 'ubl') throw new Error('decimal-major observation requires UBL source_system');
  if (typeof input.amount !== 'string' || !DECIMAL.test(input.amount)) {
    throw new Error('decimal amount must use plain base-10 notation without exponent or leading plus');
  }

  const negative = input.amount.startsWith('-');
  const unsigned = negative ? input.amount.slice(1) : input.amount;
  const [whole, fraction = ''] = unsigned.split('.');
  const rawCoefficient = `${negative ? '-' : ''}${whole}${fraction}`;
  const sourceScale = fraction.length;

  return {
    source_system: input.source_system,
    source_representation: 'decimal_major_units',
    source_amount: input.amount,
    source_scale: sourceScale,
    scale_basis: 'source_decimal_lexical',
    asset: requireIso4217(input.currency),
    exact_value: normalizeScaledValue(rawCoefficient, sourceScale)
  };
}

export function observeIsoMinorUnits(input: {
  source_system: 'ucp';
  amount: string;
  currency: string;
  currency_exponent: number;
}): ExactMonetarySourceObservation {
  if (input.source_system !== 'ucp') throw new Error('ISO minor-unit observation requires UCP source_system');
  requireInteger(input.amount);
  const sourceScale = requireScale(input.currency_exponent);

  return {
    source_system: input.source_system,
    source_representation: 'iso4217_minor_units',
    source_amount: input.amount,
    source_scale: sourceScale,
    scale_basis: 'iso4217_exponent',
    asset: requireIso4217(input.currency),
    exact_value: normalizeScaledValue(input.amount, sourceScale)
  };
}

export function observeStripeMinorUnits(input: {
  source_system: 'stripe';
  amount: string;
  currency: string;
  currency_scale: number;
}): ExactMonetarySourceObservation {
  if (input.source_system !== 'stripe') throw new Error('Stripe minor-unit observation requires Stripe source_system');
  requireInteger(input.amount);
  const sourceScale = requireScale(input.currency_scale);

  return {
    source_system: input.source_system,
    source_representation: 'stripe_currency_minor_units',
    source_amount: input.amount,
    source_scale: sourceScale,
    scale_basis: 'stripe_currency_rules',
    asset: requireIso4217(input.currency),
    exact_value: normalizeScaledValue(input.amount, sourceScale)
  };
}

export function observeTokenAtomicUnits(input: {
  source_system: 'x402';
  amount: string;
  network: string;
  asset_id: string;
  token_decimals: number;
}): ExactMonetarySourceObservation {
  if (input.source_system !== 'x402') throw new Error('token atomic-unit observation requires x402 source_system');
  requireInteger(input.amount);
  const sourceScale = requireScale(input.token_decimals);

  return {
    source_system: input.source_system,
    source_representation: 'token_atomic_units',
    source_amount: input.amount,
    source_scale: sourceScale,
    scale_basis: 'token_decimals',
    asset: requireTokenAsset(input.network, input.asset_id),
    exact_value: normalizeScaledValue(input.amount, sourceScale)
  };
}

function sameAsset(left: ExactAssetRef, right: ExactAssetRef): boolean {
  if (left.namespace !== right.namespace) return false;
  if (left.namespace === 'iso4217' && right.namespace === 'iso4217') return left.id === right.id;
  if (left.namespace === 'token' && right.namespace === 'token') {
    return left.network === right.network && left.id === right.id;
  }
  return false;
}

function hasCompatibleScaleBasis(
  left: ExactMonetarySourceObservation,
  right: ExactMonetarySourceObservation
): boolean {
  if (left.scale_basis !== right.scale_basis) return false;
  if (left.scale_basis === 'source_decimal_lexical') return true;
  return left.source_scale === right.source_scale;
}

export function sameNormalizedAssetMagnitude(
  left: ExactMonetarySourceObservation,
  right: ExactMonetarySourceObservation
): boolean {
  return (
    sameAsset(left.asset, right.asset) &&
    left.exact_value.coefficient === right.exact_value.coefficient &&
    left.exact_value.scale === right.exact_value.scale
  );
}

export function sameExactQuantity(
  left: ExactMonetarySourceObservation,
  right: ExactMonetarySourceObservation
): boolean {
  // Cross-basis equality is deliberately not asserted here. For example, a
  // decimal-major UBL value does not independently verify the scale metadata
  // supplied for a UCP or Stripe observation. A later adapter/evidence gate
  // must establish that metadata before claiming exact-quantity equivalence.
  return sameNormalizedAssetMagnitude(left, right) && hasCompatibleScaleBasis(left, right);
}

export function assessHistoricalNumericAmount(input: { amount: number; currency?: string }) {
  return {
    normalized_exact_value: null,
    source_value: input.amount,
    source_currency: input.currency ?? null,
    blocking_reasons: [
      'numeric_source_does_not_declare_major_minor_or_atomic_unit_basis',
      'binary_number_is_not_an_interchange_contract_for_arbitrary_decimal_values'
    ]
  } as const;
}
