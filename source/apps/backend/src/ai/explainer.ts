import { formatMoney } from '../utils/money';
import { currentBusiness } from '../config/business-config';

/**
 * Grounded, per-choice recommendation explanations for the deterministic catalog-discovery path.
 *
 * Why this exists: the web storefront sends every chat recommendation request with
 * `intent: "catalog_discovery"`, which is answered by `formatDiscoveryReply` without calling an
 * LLM. That reply previously listed product names only. These helpers produce one short,
 * meaningful explanation per recommended option using ONLY real catalog metadata:
 *   - the product's own `description` (never invented ingredients),
 *   - its server-owned `priceMinor` (budget fit is computed from it),
 *   - its `dietary` labels, always phrased as *informational* ("sample menu") — never as a
 *     verified allergen guarantee.
 * Nothing here decides prices, cart totals or policy; those stay with the server after the
 * shopper picks an option (prepare_cart re-checks pricing + purchase policy).
 */

export interface ExplainableChoice {
  productId: string;
  name: string;
  quantity: number;
  totalMinor: number;
  priceMinor?: number;
  currency?: string;
  description?: string;
  dietary?: string[];
}

export interface ExplanationOpts {
  budgetMinor?: number;
  currency?: string;
  locale?: string;
  language?: 'en' | 'tr';
}

function money(minor: number, currency: string, locale: string): string {
  return formatMoney(minor, currency, locale);
}

function dietaryPhrase(dietary: string[] | undefined, language: 'en' | 'tr'): string {
  if (!dietary || dietary.length === 0) return '';
  const list = dietary.join(', ');
  return language === 'tr'
    ? `Menüde ${list} olarak işaretli (örnek veri; alerji garantisi değil).`
    : `The sample menu labels it ${list} (sample data; not a verified allergen guarantee).`;
}

function budgetPhrase(
  totalMinor: number,
  budgetMinor: number | undefined,
  currency: string,
  locale: string,
  language: 'en' | 'tr'
): string {
  if (budgetMinor === undefined) return '';
  const b = money(budgetMinor, currency, locale);
  return totalMinor <= budgetMinor
    ? language === 'tr'
      ? `${b} bütçenizin içinde.`
      : `Within your ${b} budget.`
    : language === 'tr'
      ? `${b} bütçenizin üzerinde.`
      : `It is over your ${b} budget.`;
}

/**
 * Formats one numbered option with its own grounded explanation.
 * Example (EN):
 *   1. Caprese Panini — €8.90
 *      A vegetarian ciabatta panini with mozzarella, tomato and basil pesto. Within your €12.00 budget.
 */
export function explainChoiceLine(
  index: number,
  choice: ExplainableChoice,
  opts: ExplanationOpts = {}
): string {
  const language = opts.language ?? 'en';
  const currency = opts.currency ?? currentBusiness.currency;
  const locale = opts.locale ?? currentBusiness.locale;

  const priceMinor = choice.priceMinor;
  const price =
    priceMinor !== undefined ? money(priceMinor, currency, locale) : '';
  const title = price ? `${choice.name} — ${price}` : choice.name;

  const parts: string[] = [];
  if (choice.description && choice.description.trim()) {
    parts.push(choice.description.trim().replace(/[.\s]+$/, '') + '.');
  }
  const diet = dietaryPhrase(choice.dietary, language);
  if (diet) parts.push(diet);
  const bud = budgetPhrase(
    choice.totalMinor,
    opts.budgetMinor,
    currency,
    locale,
    language
  );
  if (bud) parts.push(bud);

  const explanation =
    parts.length > 0
      ? parts.join(' ')
      : language === 'tr'
        ? 'Menümüzdeki bir seçenek.'
        : 'A menu option matching your request.';

  return `${index}. ${title}\n   ${explanation}`;
}
