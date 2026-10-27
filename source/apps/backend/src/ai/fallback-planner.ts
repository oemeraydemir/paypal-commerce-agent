import { CatalogService, Product } from '../catalog/service';
import { currentBusiness } from '../config/business-config';
import { formatMoney } from '../utils/money';
import { createCartId, OrderOrigin } from '../orders/domain';
import { policyService } from '../policy/service';
import { policyStorage } from '../policy/storage';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { buildEvaluationOrder, buildPolicyContext, buildPolicyOutcome } from '../policy/context-builder';
import { meetsDietaryPreferences, ShoppingPreferences } from './tool-executor';

// ──────────────────────────────────────────────────────────────────────────────
// Rule-based "Quick Planner" — used ONLY when every AI provider is exhausted
// (503 AI_UNAVAILABLE, typical of free-tier quotas). It keeps the demo usable and
// is labelled as rule-based everywhere: it is NOT AI, so
//   • it never marks the session as AI-prepared (the order stays attributed HUMAN),
//   • it records no AI_AGENT policy event,
//   • the API response says `mode: "rule-based"`.
// Like the AI path it never sees PayPal; prices come from the catalog and the
// authoritative policy engine is consulted for the decision.
// ──────────────────────────────────────────────────────────────────────────────

const catalog = new CatalogService();

const NUMBER_WORDS: Record<string, number> = {
  one: 1, a: 1, two: 2, couple: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

const FOOD_INTENTS: Array<{ category: string; words: string[]; perPerson: boolean }> = [
  { category: 'breakfast', words: ['breakfast', 'brunch', 'morning'], perPerson: true },
  { category: 'lunch', words: ['lunch', 'sandwich', 'salad', 'soup', 'bowl', 'panini'], perPerson: true },
  { category: 'desserts', words: ['dessert', 'cake', 'sweet', 'brownie', 'cheesecake'], perPerson: true },
  { category: 'snacks', words: ['snack', 'bite', 'bites'], perPerson: true },
  { category: 'gifts', words: ['gift', 'present', 'birthday'], perPerson: false },
  { category: 'catering', words: ['team', 'office', 'catering', 'colleagues'], perPerson: false },
];
const DRINK_WORDS = ['coffee', 'tea', 'drink', 'drinks', 'juice', 'latte', 'espresso', 'matcha', 'beverage'];

const NAME_STOPWORDS = new Set(['with', 'under', 'from', 'that', 'this', 'your', 'need', 'want', 'some', 'euro', 'euros', 'please', 'also', 'plus', 'over', 'less', 'than', 'about', 'would', 'like', 'could', 'have', 'into', 'for', 'and', 'the']);
const nameTokens = (name: string) =>
  Array.from(new Set(name.toLowerCase().split(/[^a-z0-9]+/).map((w) => w.replace(/s$/, '')).filter((w) => w.length >= 4 && !NAME_STOPWORDS.has(w))));

/**
 * Last-resort matching for catalogs whose categories are not food words (services, books, lessons...).
 * Used ONLY when no category/food intent was found: a product matches when at least half of the
 * distinctive words of its NAME appear in the message. More than 5 matches is treated as too vague.
 */
export function matchNamedProducts(lower: string, products: Product[]): Product[] {
  const words = new Set(lower.split(/[^a-z0-9]+/).map((w) => w.replace(/s$/, '')).filter(Boolean));
  const matched = products.filter((p) => {
    const tokens = nameTokens(p.name);
    if (tokens.length === 0) return false;
    const hits = tokens.filter((t) => words.has(t)).length;
    return hits > 0 && hits / tokens.length >= 0.5;
  });
  return matched.length >= 1 && matched.length <= 5 ? matched : [];
}

export interface PlanResult {
  items: Array<{ productId: string; quantity: number }>;
  people: number;
  budgetMinor?: number;
  understood: boolean;
  fits: boolean;
  summary: string;
}

// Currency words/symbols the shopper may type. The planner understands the CONFIGURED business
// currency (a USD bookshop must read "under $40", a GBP school "under £30"), and always keeps the
// euro forms so the built-in AI Café behaviour is unchanged.
const CURRENCY_TOKENS: Record<string, string[]> = {
  EUR: ['€', 'eur', 'euro', 'euros'],
  USD: ['$', 'usd', 'dollar', 'dollars'],
  GBP: ['£', 'gbp', 'pound', 'pounds'],
  CHF: ['chf', 'franc', 'francs'],
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex alternation for the business currency's symbol/code/name. `$` MUST be escaped here. */
function budgetTokenPattern(): string {
  const tokens = CURRENCY_TOKENS[currentBusiness.currency.toUpperCase()] ?? [
    currentBusiness.currency.toLowerCase(),
  ];
  return tokens
    .map((t) => (/^[a-z]+$/i.test(t) ? `\\b${escapeRegExp(t)}\\b` : escapeRegExp(t)))
    .join('|');
}

export function parseBudgetMinor(text: string): number | undefined {
  const money = budgetTokenPattern();
  const patterns = [
    new RegExp(`(?:${money})\\s*(\\d+(?:[.,]\\d{1,2})?)`, 'i'),
    new RegExp(`(\\d+(?:[.,]\\d{1,2})?)\\s*(?:${money})`, 'i'),
    /(?:under|below|within|max(?:imum)?|budget(?:\s+of)?|up to|less than)\s+(\d+(?:[.,]\d{1,2})?)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const value = parseFloat(m[1].replace(',', '.'));
      if (isFinite(value) && value > 0 && value <= 1000) return Math.round(value * 100);
    }
  }
  return undefined;
}

export function parsePeople(text: string): number {
  const lower = text.toLowerCase();
  const words = Object.keys(NUMBER_WORDS).join('|');
  const m =
    new RegExp(`\\bfor\\s+(\\d{1,2}|${words})\\b(?!\\s*(?:€|eur|euros?|\\.\\d|,\\d))`).exec(lower) ||
    new RegExp(`\\b(\\d{1,2}|${words})\\s+(?:people|persons|guests|of us|friends|colleagues)\\b`).exec(lower);
  if (!m) return 1;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NUMBER_WORDS[m[1]];
  return Math.min(Math.max(n || 1, 1), 20);
}

export function parseDietary(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  if (/\bvegan\b/.test(lower)) out.push('vegan');
  else if (/\bvegetarian\b|\bveggie\b/.test(lower)) out.push('vegetarian');
  if (/gluten[- ]?free/.test(lower)) out.push('gluten-free');
  return out;
}

const hasWord = (lower: string, words: string[]) =>
  words.some((w) => new RegExp(`\\b${w}\\b`).test(lower));

/** Pure planner: message + profile → cart of catalog items (never alcohol). */
export function planFallbackCart(
  message: string,
  preferences: ShoppingPreferences,
  capMinor?: number,
  products: Product[] = catalog.getAll()
): PlanResult {
  const lower = message.toLowerCase();
  const people = parsePeople(message);
  const dietary = [...new Set([...preferences.dietary, ...parseDietary(message)])];
  const budgets = [parseBudgetMinor(message), preferences.maxBudgetMinor, capMinor].filter(
    (b): b is number => b !== undefined
  );
  const budgetMinor = budgets.length ? Math.min(...budgets) : undefined;

  const ok = (p: Product) => !p.dietary.includes('alcohol') && meetsDietaryPreferences(p, dietary);

  // Built-in intent words (AI Café) plus one intent per other catalog category, so a custom
  // business profile (e.g. "pastry", "bread") is understood too.
  const present = new Set(products.map((p) => p.category));
  const known = new Set(FOOD_INTENTS.map((i) => i.category));
  const dynamic = [...present]
    .filter((c) => !known.has(c) && c !== 'drinks')
    .map((c) => ({ category: c, words: [c.replace(/[-_]/g, ' '), c.replace(/[-_]/g, ' ').replace(/s$/, '')], perPerson: true }));
  const intents = [...FOOD_INTENTS.filter((i) => present.has(i.category)), ...dynamic].filter((i) =>
    hasWord(lower, i.words)
  );
  const wantsDrink = hasWord(lower, DRINK_WORDS) || intents.some((i) => i.category === 'breakfast');
  if (intents.length === 0 && !wantsDrink) {
    const named = matchNamedProducts(lower, products.filter(ok));
    if (named.length > 0) {
      const namedItems = named.map((p) => ({ productId: p.id, quantity: 1 }));
      const namedTotal = named.reduce((s, p) => s + p.priceMinor, 0);
      const namedFits = budgetMinor === undefined || namedTotal <= budgetMinor;
      const label = named.map((p) => `1× ${p.name}`).join(', ');
      return {
        items: namedItems, people, budgetMinor, understood: true, fits: namedFits,
        summary: namedFits
          ? `${label}.`
          : `${label} (${formatMoney(namedTotal, currentBusiness.currency, currentBusiness.locale)}) is over your budget of ${formatMoney(budgetMinor!, currentBusiness.currency, currentBusiness.locale)}.`,
      };
    }
    return {
      items: [], people, budgetMinor, understood: false, fits: false,
      summary: 'I could not tell what you would like. Try "vegetarian breakfast for two under €20", "a quick lunch" or "coffee and cake".',
    };
  }

  const items: Array<{ productId: string; quantity: number }> = [];
  const priceOf = (id: string) => products.find((p) => p.id === id)!.priceMinor;

  // Drink per person: the one the shopper named, else the cheapest allowed drink
  // (coffee when it fits the dietary profile).
  let drink: Product | undefined;
  if (wantsDrink) {
    const drinks = products.filter((p) => p.category === 'drinks' && ok(p)).sort((a, b) => a.priceMinor - b.priceMinor);
    const named = drinks.find((d) => hasWord(lower, [d.id.replace(/_/g, ' '), ...d.name.toLowerCase().split(' ').filter((w) => w.length > 3)]));
    drink = named ?? drinks.find((d) => d.id === 'coffee') ?? drinks[0];
  }
  const drinkTotal = drink ? drink.priceMinor * people : 0;

  // One main per intent, sized to the budget share left after drinks.
  const mainIntents = intents.length ? intents : [];
  const share = budgetMinor !== undefined ? Math.max(0, budgetMinor - drinkTotal) / Math.max(1, mainIntents.length) : undefined;
  const unmatched: string[] = [];
  for (const intent of mainIntents) {
    const candidates = products.filter((p) => p.category === intent.category && ok(p)).sort((a, b) => a.priceMinor - b.priceMinor);
    if (candidates.length === 0) {
      unmatched.push(intent.category);
      continue;
    }
    const qty = intent.perPerson ? people : 1;
    let pick: Product | undefined;
    if (share === undefined) {
      pick = candidates[Math.floor((candidates.length - 1) / 2)];
    } else {
      pick = [...candidates].reverse().find((c) => c.priceMinor * qty <= share) ?? candidates[0];
    }
    items.push({ productId: pick.id, quantity: qty });
  }
  if (drink) items.push({ productId: drink.id, quantity: people });

  // A requested kind of food has NO allowed product (typically: the dietary profile excludes the
  // whole category). Returning just the drink would silently answer a different question ("a
  // vegetarian breakfast" -> iced tea), so say what is missing and prepare no cart.
  if (unmatched.length > 0) {
    const profile = dietary.length ? ` with your dietary profile (${dietary.join(', ')})` : '';
    return {
      items: [], people, budgetMinor, understood: true, fits: false,
      summary: `Nothing in ${unmatched.join(' / ')} on the menu matches${profile}. Loosen a filter under "Edit" in your profile or ask for something else, for example a drink or a snack.`,
    };
  }

  let total = items.reduce((s, i) => s + priceOf(i.productId) * i.quantity, 0);
  // Over budget: drop the optional drink first, then fall back to cheapest mains.
  if (budgetMinor !== undefined && total > budgetMinor && drink && mainIntents.length > 0) {
    items.pop();
    total = items.reduce((s, i) => s + priceOf(i.productId) * i.quantity, 0);
  }
  const fits = items.length > 0 && (budgetMinor === undefined || total <= budgetMinor);
  const names = items.map((i) => `${i.quantity}× ${products.find((p) => p.id === i.productId)!.name}`);
  return {
    items, people, budgetMinor, understood: true, fits,
    summary: items.length === 0
      ? 'Nothing on the menu matches that together with your dietary profile.'
      : fits
        ? `${names.join(', ')}${people > 1 ? ` for ${people}` : ''}.`
        : `The cheapest match is ${names.join(', ')} (${formatMoney(total, currentBusiness.currency, currentBusiness.locale)}), which is over your budget of ${formatMoney(budgetMinor!, currentBusiness.currency, currentBusiness.locale)}.`,
  };
}

export interface FallbackReply {
  response: string;
  preparedCart: any | null;
  checkoutReady: boolean;
  mode: 'rule-based';
}

/** Builds the chat reply + a policy-checked cart. Side-effect free (no policy event). */
export function runFallbackAssistant(
  message: string,
  preferences: ShoppingPreferences,
  ctx: { sessionId: string; userId: string },
  options: { aiConfigured?: boolean } = {}
): FallbackReply {
  const policy = policyStorage.getOrCreatePolicy(ctx.userId);
  const plan = planFallbackCart(message, preferences, policy.maxPerPurchaseMinor);
  // Say WHY there is no AI: "at capacity" is wrong when no provider key is configured at all.
  const notice =
    options.aiConfigured === false
      ? 'No AI provider is configured on this server, so this answer comes from a simple rule-based planner (no AI). '
      : 'Our AI models are at capacity right now, so this answer comes from a simple rule-based planner (no AI). ';

  if (!plan.understood || plan.items.length === 0 || !plan.fits) {
    return { response: `${notice}${plan.summary}`, preparedCart: null, checkoutReady: false, mode: 'rule-based' };
  }

  const money = (m: number) => formatMoney(m, currentBusiness.currency, currentBusiness.locale);
  const validated = plan.items.map((i) => {
    const p = catalog.getById(i.productId)!;
    const lineTotalMinor = p.priceMinor * i.quantity;
    return {
      productId: p.id,
      name: p.name,
      quantity: i.quantity,
      unitPriceMinor: p.priceMinor,
      unitPriceFormatted: money(p.priceMinor),
      lineTotalMinor,
      lineTotalFormatted: money(lineTotalMinor),
    };
  });
  const totalMinor = validated.reduce((s, i) => s + i.lineTotalMinor, 0);
  const evaluation = policyService.evaluatePurchase(
    buildEvaluationOrder(ctx.sessionId, validated, totalMinor, currentBusiness.currency, OrderOrigin.HUMAN),
    policy,
    buildPolicyContext(ctx.userId, currentBusiness.businessId, dailySpendTracker)
  );
  const outcome = buildPolicyOutcome(evaluation);
  if (outcome.decision === 'BLOCK') {
    return {
      response: `${notice}I found ${plan.summary} but your spending policy blocks it: ${outcome.reason}.`,
      preparedCart: null, checkoutReady: false, mode: 'rule-based',
    };
  }
  const preparedCart = {
    items: validated,
    totalMinor,
    totalFormatted: money(totalMinor),
    currency: currentBusiness.currency,
    cartId: createCartId(ctx.sessionId, validated),
    message: `Cart prepared with ${validated.length} item(s). Total: ${money(totalMinor)}.`,
    policyDecision: outcome.decision,
    policyViolations: outcome.violations,
    requiresExplicitApproval: outcome.requiresExplicitApproval,
    retrySuggested: false,
    reason: outcome.reason,
  };
  return {
    response: `${notice}I suggest ${plan.summary} Total ${money(totalMinor)}. Review the cart, then pay with PayPal when you are ready.`,
    preparedCart,
    checkoutReady: true,
    mode: 'rule-based',
  };
}
