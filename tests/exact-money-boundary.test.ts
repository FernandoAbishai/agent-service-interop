import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assessHistoricalNumericAmount,
  observeDecimalMajorUnits,
  observeIsoMinorUnits,
  observeStripeMinorUnits,
  observeTokenAtomicUnits,
  sameNormalizedAssetMagnitude,
  sameExactQuantity
} from '../src/exact-money-boundary.ts';

test('UBL decimal, UCP minor units, and Stripe minor units preserve the same normalized USD magnitude without cross-basis equivalence', () => {
  const ubl = observeDecimalMajorUnits({ source_system: 'ubl', amount: '89.00', currency: 'USD' });
  const ucp = observeIsoMinorUnits({
    source_system: 'ucp',
    amount: '8900',
    currency: 'USD',
    currency_exponent: 2
  });
  const stripe = observeStripeMinorUnits({
    source_system: 'stripe',
    amount: '8900',
    currency: 'USD',
    currency_scale: 2
  });

  assert.deepEqual(ubl.exact_value, { coefficient: '89', scale: 0 });
  assert.deepEqual(ucp.exact_value, ubl.exact_value);
  assert.deepEqual(stripe.exact_value, ubl.exact_value);
  assert.equal(sameNormalizedAssetMagnitude(ubl, ucp), true);
  assert.equal(sameNormalizedAssetMagnitude(ubl, stripe), true);
  assert.equal(sameExactQuantity(ubl, ucp), false, 'cross-basis exponent validity requires independent evidence');
  assert.equal(sameExactQuantity(ubl, stripe), false, 'cross-basis scale validity requires independent evidence');
  assert.equal(sameExactQuantity(ucp, stripe), false, 'UCP ISO exponent and Stripe currency rules are distinct scale bases');
  assert.equal(ubl.source_amount, '89.00');
  assert.equal(ubl.source_scale, 2);
  assert.equal(ucp.source_amount, '8900');
  assert.equal(ucp.source_scale, 2);
});

test('ISO currency exponents remain explicit for zero- and three-decimal currencies', () => {
  const jpy = observeIsoMinorUnits({ source_system: 'ucp', amount: '500', currency: 'JPY', currency_exponent: 0 });
  const kwd = observeIsoMinorUnits({ source_system: 'ucp', amount: '1234', currency: 'KWD', currency_exponent: 3 });

  assert.deepEqual(jpy.exact_value, { coefficient: '500', scale: 0 });
  assert.deepEqual(kwd.exact_value, { coefficient: '1234', scale: 3 });
  assert.equal(jpy.source_scale, 0);
  assert.equal(kwd.source_scale, 3);
});

test('signed minor-unit values preserve sign without floating-point conversion', () => {
  const discount = observeIsoMinorUnits({
    source_system: 'ucp',
    amount: '-125',
    currency: 'USD',
    currency_exponent: 2
  });

  assert.deepEqual(discount.exact_value, { coefficient: '-125', scale: 2 });
});

test('decimal values below one preserve exactness, trailing zeroes, and negative-zero normalization', () => {
  const tenth = observeDecimalMajorUnits({ source_system: 'ubl', amount: '0.10', currency: 'USD' });
  const negativeZero = observeDecimalMajorUnits({ source_system: 'ubl', amount: '-0.00', currency: 'USD' });

  assert.deepEqual(tenth.exact_value, { coefficient: '1', scale: 1 });
  assert.equal(tenth.source_amount, '0.10');
  assert.equal(tenth.source_scale, 2);
  assert.deepEqual(negativeZero.exact_value, { coefficient: '0', scale: 0 });
  assert.equal(negativeZero.source_amount, '-0.00');
  assert.equal(negativeZero.source_scale, 2);
});

test('exact comparison does not round excess decimal precision or erase fiat asset identity', () => {
  const decimal = observeDecimalMajorUnits({ source_system: 'ubl', amount: '1.234', currency: 'USD' });
  const cents = observeStripeMinorUnits({ source_system: 'stripe', amount: '123', currency: 'USD', currency_scale: 2 });
  const eur = observeDecimalMajorUnits({ source_system: 'ubl', amount: '1.234', currency: 'EUR' });

  assert.equal(sameExactQuantity(decimal, cents), false, '1.234 must not be rounded to 1.23');
  assert.equal(sameExactQuantity(decimal, eur), false, 'equal decimal magnitude must not erase currency identity');
});

test('cross-basis comparison refuses a false USD exponent even when normalized magnitude matches', () => {
  const decimal = observeDecimalMajorUnits({ source_system: 'ubl', amount: '1.000', currency: 'USD' });
  const contradictoryMinor = observeIsoMinorUnits({
    source_system: 'ucp',
    amount: '1000',
    currency: 'USD',
    currency_exponent: 3
  });

  assert.equal(sameNormalizedAssetMagnitude(decimal, contradictoryMinor), true);
  assert.equal(sameExactQuantity(decimal, contradictoryMinor), false);
});

test('contradictory fixed-scale metadata for the same asset fails closed', () => {
  const usdExponent2 = observeIsoMinorUnits({
    source_system: 'ucp',
    amount: '100',
    currency: 'USD',
    currency_exponent: 2
  });
  const usdExponent3 = observeIsoMinorUnits({
    source_system: 'ucp',
    amount: '1000',
    currency: 'USD',
    currency_exponent: 3
  });
  const baseUsdc6 = observeTokenAtomicUnits({
    source_system: 'x402',
    amount: '1000000',
    network: 'eip155:8453',
    asset_id: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    token_decimals: 6
  });
  const baseUsdc7 = observeTokenAtomicUnits({
    source_system: 'x402',
    amount: '10000000',
    network: 'eip155:8453',
    asset_id: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    token_decimals: 7
  });

  assert.deepEqual(usdExponent2.exact_value, usdExponent3.exact_value);
  assert.equal(sameExactQuantity(usdExponent2, usdExponent3), false, 'same ISO asset cannot silently disagree on exponent');
  assert.deepEqual(baseUsdc6.exact_value, baseUsdc7.exact_value);
  assert.equal(sameExactQuantity(baseUsdc6, baseUsdc7), false, 'same token asset cannot silently disagree on decimals');
});

test('token atomic units can use the same exact arithmetic shape without becoming fiat money', () => {
  const usd = observeDecimalMajorUnits({ source_system: 'ubl', amount: '89.00', currency: 'USD' });
  const baseUsdc = observeTokenAtomicUnits({
    source_system: 'x402',
    amount: '89000000',
    network: 'eip155:8453',
    asset_id: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    token_decimals: 6
  });
  const otherUsdc = observeTokenAtomicUnits({
    source_system: 'x402',
    amount: '89000000',
    network: 'eip155:1',
    asset_id: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    token_decimals: 6
  });

  assert.deepEqual(baseUsdc.exact_value, { coefficient: '89', scale: 0 });
  assert.equal(sameNormalizedAssetMagnitude(usd, baseUsdc), false, 'normalized magnitude still preserves asset identity');
  assert.equal(sameExactQuantity(usd, baseUsdc), false, 'USD fiat and USDC token are distinct assets');
  assert.equal(sameExactQuantity(baseUsdc, otherUsdc), false, 'token symbol/value cannot erase network + asset identity');
});

test('arbitrary-precision atomic values survive beyond JavaScript safe integers', () => {
  const amount = '900719925474099312345678';
  const observed = observeTokenAtomicUnits({
    source_system: 'x402',
    amount,
    network: 'eip155:8453',
    asset_id: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    token_decimals: 6
  });

  assert.equal(observed.source_amount, amount);
  assert.deepEqual(observed.exact_value, { coefficient: '900719925474099312345678', scale: 6 });
});

test('research parser rejects ambiguous or non-plain decimal notation instead of rounding', () => {
  assert.throws(
    () => observeDecimalMajorUnits({ source_system: 'ubl', amount: '1e3', currency: 'USD' }),
    /plain base-10 notation/
  );
  assert.throws(
    () => observeStripeMinorUnits({ source_system: 'stripe', amount: '10.5', currency: 'USD', currency_scale: 2 }),
    /plain signed base-10 integer/
  );
  assert.throws(
    () => observeIsoMinorUnits({ source_system: 'ucp', amount: '100', currency: 'usd', currency_exponent: 2 }),
    /three-letter uppercase/
  );
  assert.throws(
    () =>
      observeTokenAtomicUnits({
        source_system: 'x402',
        amount: '1000',
        network: '',
        asset_id: 'USDC',
        token_decimals: 6
      }),
    /explicit network and asset id/
  );
  assert.throws(
    () => observeIsoMinorUnits({ source_system: 'ucp', amount: 100 as any, currency: 'USD', currency_exponent: 2 }),
    /plain signed base-10 integer string/
  );
  assert.throws(
    () => observeDecimalMajorUnits({ source_system: 'ubl', amount: 0.1 as any, currency: 'USD' }),
    /plain base-10 notation/
  );
  assert.throws(
    () => observeIsoMinorUnits({ source_system: 'stripe' as any, amount: '100', currency: 'USD', currency_exponent: 2 }),
    /requires UCP source_system/
  );
});

test('historical plumbing number is not silently promoted into an exact-money contract', () => {
  const state = JSON.parse(readFileSync(new URL('../fixtures/plumbing/workflow.example.json', import.meta.url), 'utf8')) as any;
  const historical = state.quote?.line_items?.[0]?.amount ?? 89;
  const result = assessHistoricalNumericAmount({ amount: historical, currency: state.quote?.currency ?? 'USD' });

  assert.equal(result.normalized_exact_value, null);
  assert.ok(result.blocking_reasons.includes('numeric_source_does_not_declare_major_minor_or_atomic_unit_basis'));
  assert.equal('coefficient' in result, false);
  assert.equal('scale' in result, false);
});

test('exact-money falsifier does not change protocol kernel or historical workflow schema', () => {
  const kernel = JSON.parse(readFileSync(new URL('../schemas/triherm-kernel-envelope.schema.json', import.meta.url), 'utf8')) as any;
  const workflow = JSON.parse(readFileSync(new URL('../schemas/service-workflow.schema.json', import.meta.url), 'utf8')) as any;

  for (const field of ['money', 'amount', 'price', 'currency', 'asset', 'coefficient', 'scale']) {
    assert.equal(field in kernel.properties, false, `${field} must not be promoted into the kernel`);
  }
  assert.equal(workflow.properties?.quote?.type, 'object');
  assert.equal(workflow.properties?.quote?.properties?.line_items?.items?.properties?.amount?.type, 'number');
});
