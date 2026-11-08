import test from 'node:test';
import assert from 'node:assert/strict';
import { relationshipLabel } from '../src/js/components/relationship.js';
import { createBlowGate } from '../src/js/components/blow-detector.js';
import { feedbackView } from '../src/js/components/wish-feedback.js';

test('unknown, invalid and future relationship dates remain explicit placeholders', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  for (const date of [null, '2026-02-30', 'not-a-date', '2027-01-01']) {
    assert.match(relationshipLabel(date, now), /待确认/);
  }
});

test('relationship day count follows Hong Kong calendar boundaries', () => {
  assert.equal(relationshipLabel('2026-10-31', new Date('2026-10-31T15:59:59Z')), '在一起第 1 天');
  assert.equal(relationshipLabel('2026-10-31', new Date('2026-10-31T16:00:00Z')), '在一起第 2 天');
});

test('blowing requires sustained broadband energy and resets after a quiet gap', () => {
  const gate = createBlowGate({ threshold: 0.08, holdMs: 450 });
  assert.equal(gate(0.2, 0.6, 0), false);
  assert.equal(gate(0.2, 0.6, 449), false);
  assert.equal(gate(0.2, 0.6, 450), true);
  assert.equal(gate(0.01, 0.6, 500), false);
  assert.equal(gate(0.2, 0.6, 600), false);
  assert.equal(gate(0.2, 0.6, 1050), true);
});

test('loud low-frequency energy does not pass the blowing gate', () => {
  const gate = createBlowGate();
  assert.equal(gate(0.9, 0.01, 0), false);
  assert.equal(gate(0.9, 0.01, 1000), false);
});

test('success feedback requires a verified 201 receipt or explicit preview mode', () => {
  assert.equal(feedbackView('success').title, '提交结果暂时无法确认');
  assert.match(feedbackView('success', true).title, /预览/);
  assert.match(feedbackView('success', true).detail, /没有发送/);
});
