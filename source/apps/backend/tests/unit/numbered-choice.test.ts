import { resolveNumberedChoice } from '../../src/ai/numbered-choice';
import { runFallbackAssistant } from '../../src/ai/fallback-planner';

const options =
  'Here are a few great birthday treat ideas:\nOptions:\n\n' +
  '1. Premium Chocolate Cake - Rich Belgian chocolate cake perfect for a celebratory birthday treat.\n' +
  '2. Café Gift Box - A curated gift set featuring artisan coffee beans.\n' +
  '3. **Fresh Flower Bouquet** - A beautifully arranged seasonal bouquet.\n' +
  '4. New York Cheesecake Slice - A classic, creamy individual dessert treat.\n\n' +
  'Please reply with the number of your choice.';

const history = [
  { role: 'user', content: 'A birthday treat for a friend' },
  { role: 'assistant', content: options },
];

describe('resolveNumberedChoice', () => {
  test('maps a bare number to the option title of the latest assistant message', () => {
    expect(resolveNumberedChoice('1', history)).toBe('Premium Chocolate Cake');
    expect(resolveNumberedChoice(' 2 ', history)).toBe('Café Gift Box');
    expect(resolveNumberedChoice('3.', history)).toBe('Fresh Flower Bouquet');
    expect(resolveNumberedChoice('4)', history)).toBe('New York Cheesecake Slice');
  });

  test('ignores normal sentences and numbers that are not an option', () => {
    expect(resolveNumberedChoice('vegetarian breakfast for 2', history)).toBeNull();
    expect(resolveNumberedChoice('12', history)).toBeNull();
    expect(resolveNumberedChoice('5', history)).toBeNull();
  });

  test('only the latest assistant message counts', () => {
    const later = [...history, { role: 'user', content: 'thanks' }, { role: 'assistant', content: 'You are welcome!' }];
    expect(resolveNumberedChoice('1', later)).toBeNull();
    expect(resolveNumberedChoice('1', [])).toBeNull();
  });

  test('the resolved title lets the rule-based planner answer instead of "I could not tell"', () => {
    const title = resolveNumberedChoice('3', history)!;
    const ctx = { sessionId: 'nc-session', userId: 'nc-user' };
    const withTitle = runFallbackAssistant(title, { dietary: [] } as any, ctx, { aiConfigured: true });
    expect(withTitle.response).not.toMatch(/could not tell what you would like/i);
    const bare = runFallbackAssistant('3', { dietary: [] } as any, ctx, { aiConfigured: true });
    expect(bare.response).toMatch(/could not tell what you would like/i);
  });
});
