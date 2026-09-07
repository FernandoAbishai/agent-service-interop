import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(
  readFileSync(new URL('../schemas/triherm-kernel-envelope.schema.json', import.meta.url), 'utf8')
);

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/protocol/kernel-envelope.example.json', import.meta.url), 'utf8')
);

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function assertReferentialIntegrity(envelope: any): void {
  const actorRefs = envelope.actors.map((actor: any) => actor.actor_ref);
  const referenceIds = envelope.references.map((reference: any) => reference.ref_id);
  assert.equal(new Set(actorRefs).size, actorRefs.length, 'actor_ref values must be unique within an envelope');
  assert.equal(new Set(referenceIds).size, referenceIds.length, 'ref_id values must be unique within an envelope');

  const actors = new Set(actorRefs);
  const references = new Set(referenceIds);
  const requireActor = (actorRef: string, label: string) => {
    assert.ok(actors.has(actorRef), `${label} must resolve to an envelope actor_ref`);
  };
  const requireReferences = (ids: string[], label: string) => {
    for (const id of ids) assert.ok(references.has(id), `${label} reference ${id} must resolve to a typed reference`);
  };

  for (const actor of envelope.actors) {
    requireReferences(actor.reference_ids ?? [], `actor ${actor.actor_ref}`);
  }
  if (envelope.correlation) requireReferences(envelope.correlation.reference_ids, 'correlation');
  for (const descriptor of envelope.authority) {
    if (descriptor.actor_ref) requireActor(descriptor.actor_ref, 'authority actor_ref');
    requireReferences(descriptor.source_reference_ids ?? [], 'authority');
  }
  requireActor(envelope.provenance.producer_actor_ref, 'provenance producer_actor_ref');
  requireReferences(envelope.provenance.derived_from_reference_ids, 'provenance');
}

test('committed TriHerm kernel fixture validates as v0.1-experimental', () => {
  const validate = validator();
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  assertReferentialIntegrity(fixture);
});

test('kernel keeps protocol and operational references structurally distinct', () => {
  const validate = validator();
  const invalid = structuredClone(fixture);
  invalid.references[0] = {
    ref_id: 'ref-aip-session',
    kind: 'operational',
    protocol: 'AIP',
    object_type: 'session',
    id: 'session-1'
  };
  assert.equal(validate(invalid), false);
});

test('kernel rejects undeclared top-level economic primitives', () => {
  const validate = validator();
  const invalid = structuredClone(fixture);
  invalid.offer = { id: 'offer-should-be-profile-owned' };
  assert.equal(validate(invalid), false);

  for (const field of ['intent', 'requirement', 'offer', 'commitment', 'job', 'occurrence', 'completion', 'evidence', 'decision', 'payment', 'settlement']) {
    assert.equal(Object.hasOwn(schema.properties, field), false, `${field} must not be a kernel field`);
  }
});

test('profile-owned payload can evolve without promoting its semantics into the kernel', () => {
  const validate = validator();
  const candidate = structuredClone(fixture);
  candidate.payload = {
    future_profile_semantic: {
      nested: true,
      values: [1, 2, 3]
    }
  };
  assert.equal(validate(candidate), true, JSON.stringify(validate.errors));
  assertReferentialIntegrity(candidate);
});

test('kernel does not force correlation or external references before they exist', () => {
  const validate = validator();
  const candidate = structuredClone(fixture);
  delete candidate.correlation;
  candidate.references = [];
  candidate.authority = [];
  candidate.provenance.derived_from_reference_ids = [];
  delete candidate.capabilities;
  assert.equal(validate(candidate), true, JSON.stringify(validate.errors));
  assertReferentialIntegrity(candidate);

  const correlatedWithoutRefs = structuredClone(candidate);
  correlatedWithoutRefs.correlation = {
    correlation_id: 'corr-before-external-refs',
    reference_ids: []
  };
  assert.equal(validate(correlatedWithoutRefs), true, JSON.stringify(validate.errors));
  assertReferentialIntegrity(correlatedWithoutRefs);
});

test('authority and provenance references must resolve inside the envelope', () => {
  const validate = validator();
  const invalid = structuredClone(fixture);
  invalid.authority[0].source_reference_ids = ['ref-missing'];
  assert.equal(validate(invalid), true, JSON.stringify(validate.errors));
  assert.throws(() => assertReferentialIntegrity(invalid), /must resolve to a typed reference/);

  const invalidProducer = structuredClone(fixture);
  invalidProducer.provenance.producer_actor_ref = 'actor-missing';
  assert.equal(validate(invalidProducer), true, JSON.stringify(validate.errors));
  assert.throws(() => assertReferentialIntegrity(invalidProducer), /must resolve to an envelope actor_ref/);
});

test('actor_ref is envelope-local and duplicate local identities fail the conformance invariant', () => {
  const validate = validator();
  const invalid = structuredClone(fixture);
  invalid.actors.push({ actor_ref: 'actor-provider', role: 'observer' });
  assert.equal(validate(invalid), true, JSON.stringify(validate.errors));
  assert.throws(() => assertReferentialIntegrity(invalid), /actor_ref values must be unique/);
});

test('kernel version is explicit and experimental', () => {
  const validate = validator();
  const invalid = structuredClone(fixture);
  invalid.kernel_version = '0.1.0';
  assert.equal(validate(invalid), false);
});

test('kernel rejects command, global-identity, and authority-grant semantics', () => {
  const validate = validator();

  const command = structuredClone(fixture);
  command.command = { execute: true };
  assert.equal(validate(command), false);

  const delegation = structuredClone(fixture);
  delegation.delegation = { principal: 'someone' };
  assert.equal(validate(delegation), false);

  const authorization = structuredClone(fixture);
  authorization.authorization = { allowed: true };
  assert.equal(validate(authorization), false);

  const globalIdentity = structuredClone(fixture);
  globalIdentity.actors[0].global_id = 'global-provider-001';
  assert.equal(validate(globalIdentity), false);

  const permission = structuredClone(fixture);
  permission.authority[0].can_execute = true;
  assert.equal(validate(permission), false);
});
