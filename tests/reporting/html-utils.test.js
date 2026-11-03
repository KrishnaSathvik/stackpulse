import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeColor } from '../../src/utils/html.js';

test('safeColor keeps every colour form 3.x configs could use', () => {
  for (const c of ['#fff', '#FF8800', '#ff880080', 'purple', 'RebeccaPurple', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120 50% 50%)', 'hsl(120, 50%, 50%)']) {
    assert.equal(safeColor(c), c, c);
  }
});

test('safeColor rejects anything that could escape a style attribute', () => {
  for (const c of ['red;background:url(x)', 'url(javascript:alert(1))', 'expression(alert(1))', '"><script>', "red' onload='x",
    'var(--x)', 'rgb(1,2,3);x:y', '#ggg', '', '   ', 'a'.repeat(30), null, 42, {}]) {
    assert.equal(safeColor(c), '#64748B', String(c));
  }
});

test('escapeHtml covers element and attribute contexts', () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&\`</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(0), '0');
});
