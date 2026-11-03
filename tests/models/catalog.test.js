import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayModelName, isRecognizedModel } from '../../src/models/catalog.js';

test('recognised families render without a hardcoded per-model table', () => {
  const cases = {
    'claude-opus-4-6': 'Opus 4.6',
    'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
    'claude-haiku-4-5': 'Haiku 4.5',
    'claude-opus-4': 'Opus 4',
    'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
    'claude-opus-7-2': 'Opus 7.2',               // a future release of a known family
    'gpt-5-codex': 'GPT-5 Codex',
    'gpt-5.5-codex-max': 'GPT-5.5 Codex Max',
    'gpt-4o-mini': 'GPT-4o Mini',
    'anthropic/claude-sonnet-4-5': 'Sonnet 4.5',
    'o4-mini': 'o4 Mini',
  };
  for (const [id, label] of Object.entries(cases)) {
    assert.equal(displayModelName(id), label, id);
    assert.equal(isRecognizedModel(id), true, id);
  }
});

test('unrecognised IDs are shown exactly as recorded, never relabelled', () => {
  for (const id of [
    'claude-zephyr-9-1',          // looks like Claude, but not a known family
    'qwen3-coder-plus',
    'gpt-oss-120b',               // GPT prefix with an unknown suffix
    'gpt-5-codex-experimental',
    'kimi-k2-turbo-preview',
    'openrouter/google/gemini-2.5-pro',
    'weird model (beta)',
    'モデル-1',
    'claude-opus-4-6-thinking-extended',
  ]) {
    assert.equal(displayModelName(id), id, id);
    assert.equal(isRecognizedModel(id), false, id);
  }
  assert.equal(displayModelName(null), 'Unknown model');
  assert.equal(displayModelName(''), 'Unknown model');
});
