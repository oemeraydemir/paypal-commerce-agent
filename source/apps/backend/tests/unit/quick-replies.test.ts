import { appendOptionCallToAction, extractQuickReplies } from '../../src/ai/quick-replies';
import { aiClient } from '../../src/ai/client';
import { aiService } from '../../src/ai/service';

jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));
jest.mock('../../src/ai/tool-executor', () => ({ executeTool: jest.fn() }));

export const OPTION_TABLE = `| Option | Items | Total |
|--------|-------|-------|
| 1️⃣ Avocado Delight | 2× Vegan Avocado Toast | €17.00 |
| 2️⃣ Pancake Treat | 2× Fluffy Pancakes | €18.00 |`;

export const OPTION_CASES: Array<[string, string[]]> = [
  [OPTION_TABLE, ['Avocado Delight', 'Pancake Treat']],
  ['Option | Items\n--- | ---\n1 | Toast\n2 | Pancakes', ['Toast', 'Pancakes']],
  ['| Seçenek | Ürünler |\n| --- | --- |\n| **1. Tost** | 2 tost |\n| **2. Krep** | 2 krep |', ['Tost', 'Krep']],
  ['Options:\n1. Toast\n2. Pancakes', ['Toast', 'Pancakes']],
  ['Seçenekler:\n1) Tost\n2) Krep', ['Tost', 'Krep']],
  ['**Option 1: Toast**\n**Option 2: Pancakes**', ['Toast', 'Pancakes']],
  ['1️⃣ Toast\n2️⃣ Pancakes\n3️⃣ Coffee\n4️⃣ Tea', ['Toast', 'Pancakes', 'Coffee', 'Tea']],
  ['1. Review cart\n2. Pay with PayPal', []],
  ['| Product | Price |\n| --- | --- |\n| 1 Toast | €8 |\n| 2 Coffee | €3 |', []],
  ['Options:\n1. Only one', []],
  ['Options:\n1. Toast\n3. Pancakes', []],
  ['Options:\n1. Toast\n1. Pancakes', []],
  ['Options:\n1. A\n2. B\n3. C\n4. D\n5. E', []],
  ['```md\nOptions:\n1. Example\n2. Example\n```', []],
  ['~~~\n1️⃣ Example\n2️⃣ Example\n~~~', []],
  ['No options, just a prepared cart.', []],
];

describe('Issue 1: quick replies and backend CTA', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(OPTION_CASES)('recognizes only explicit consecutive options: %s', (raw, labels) => {
    const options = extractQuickReplies(raw);
    expect(options.map((option) => option.label)).toEqual(labels);
    expect(options.map((option) => option.id)).toEqual(labels.map((_, index) => String(index + 1)));
  });

  test('normal prose is byte-for-byte unchanged', () => {
    const raw = 'I prepared a cart. Review it before checkout.';
    expect(appendOptionCallToAction(raw)).toBe(raw);
  });

  test('CTA includes only offered IDs and is idempotent', () => {
    const result = appendOptionCallToAction(OPTION_TABLE);
    expect(result).toContain("Reply with '1' or '2' to add that option to your cart.");
    expect(result).not.toContain("'3'");
    expect(appendOptionCallToAction(result)).toBe(result);
  });

  test('Turkish options receive a Turkish CTA', () => {
    const result = appendOptionCallToAction('Seçenekler:\n1. Tost\n2. Krep');
    expect(result).toContain("'1' veya '2' yazarak yanıtlayın");
  });

  test('Turkish user hint localizes an otherwise English table', () => {
    expect(appendOptionCallToAction(OPTION_TABLE, 'Vejetaryen kahvaltı istiyorum'))
      .toContain('Ödemeden önce sepeti inceleyin.');
  });

  test('AI response and history contain the same sanitized CTA', async () => {
    (aiClient.chat as jest.Mock).mockResolvedValue({
      choices: [{ message: { content: OPTION_TABLE + '\n<tool_call>hidden</tool_call>' } }],
    });
    const result = await aiService.chat('quick-replies', 'Breakfast options');
    expect(result.response).toContain("Reply with '1' or '2'");
    expect(result.response).not.toContain('<tool_call>');
    expect(result.updatedHistory[result.updatedHistory.length - 1].content).toBe(result.response);
    expect(result.checkoutReady).toBe(false);
    expect(result.preparedCart).toBeNull();
  });

  test('a short selection remains an ordinary user turn with previous options in context', async () => {
    (aiClient.chat as jest.Mock).mockResolvedValue({ choices: [{ message: { content: 'Review your selection.' } }] });
    const history = [{ role: 'assistant' as const, content: appendOptionCallToAction(OPTION_TABLE) }];
    await aiService.chat('quick-replies', '2', history);
    const messages = (aiClient.chat as jest.Mock).mock.calls[0][0];
    expect(messages).toContainEqual(history[0]);
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: '2' });
  });
});
