import { stripToolCallMarkup } from '../../src/ai/service';

// ---------------------------------------------------------------------------
// Offline regression for the raw tool-call markup leak.
//
// Observed on the real fallback chain: `/api/ai/chat` returned
// `mode: "ai"`, `fallback: true` and a `response` of
//   <tool_call>
//   <function=search_products>
//   <parameter=query>
//   coffee
//   </parameter>
//   </function>
//   </tool_call>
// which the Flutter app and the web storefront rendered verbatim in the chat
// bubble. The sanitizer must remove it entirely (never leak parameter values)
// while leaving genuine prose untouched.
// ---------------------------------------------------------------------------

describe('stripToolCallMarkup', () => {
  it('drops a complete tool-call payload with no prose', () => {
    const raw = [
      '<tool_call>',
      '<function=search_products>',
      '<parameter=query>',
      'coffee',
      '</parameter>',
      '</function>',
      '</tool_call>',
    ].join('\n');
    expect(stripToolCallMarkup(raw)).toBe('');
  });

  it('drops a truncated payload so parameter values never leak', () => {
    const raw = '<tool_call>\n<function=search_products>\n<parameter=dietary>\n[';
    expect(stripToolCallMarkup(raw)).toBe('');
  });

  it('keeps the prose written before the markup', () => {
    const raw = 'Let me look that up for you.\n<tool_call>\n<function=search_products>\n';
    expect(stripToolCallMarkup(raw)).toBe('Let me look that up for you.');
  });

  it('leaves a normal answer unchanged', () => {
    const raw = 'I prepared a cart with a coffee (€3.00). Shall I continue?';
    expect(stripToolCallMarkup(raw)).toBe(raw);
  });

  it('handles empty and nullish input', () => {
    expect(stripToolCallMarkup('')).toBe('');
    expect(stripToolCallMarkup(undefined)).toBe('');
    expect(stripToolCallMarkup(null)).toBe('');
  });

  it('is case-insensitive about the markup tags', () => {
    expect(stripToolCallMarkup('<TOOL_CALL><FUNCTION=x>')).toBe('');
  });
});
