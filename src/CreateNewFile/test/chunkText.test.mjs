import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkText } from '../chunkText.mjs';

test('preserves short input and handles empty input', () => {
  assert.deepEqual(chunkText('hello world'), ['hello world']);
  assert.deepEqual(chunkText(''), []);
});

test('prefers a whitespace boundary without losing text', () => {
  const first = `${'a'.repeat(2490)} `;
  const rest = 'remaining text';
  assert.deepEqual(chunkText(first + rest), [first, rest]);
});

test('bounds chunks for exact limits, long tokens, and Unicode', () => {
  for (const input of [
    'a'.repeat(2500),
    'a'.repeat(2501),
    `${'a'.repeat(3100)} `,
    `${'🙂'.repeat(2499)}🚀tail`,
    `${'first\tsecond\n'.repeat(500)}end`,
  ]) {
    const chunks = chunkText(input);
    assert.equal(chunks.join(''), input);
    assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 2500));
    assert.ok(
      chunks.every((chunk) => chunk.length > 0 && chunk.isWellFormed()),
    );
  }
});
