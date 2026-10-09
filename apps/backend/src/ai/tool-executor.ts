import { CatalogService } from '../catalog/service';
import { currentBusiness } from '../config/business-config';
import { formatMoney } from '../utils/money';
import { validateOrderTotal } from '../orders/validation';
import { OrderOrigin, createCartId } from '../orders/domain';
import { policyService } from '../policy/service';
import { policyStorage } from '../policy/storage';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { defaultPolicy, getDemoUserId } from '../policy/default-policy';
import {
  buildEvaluationOrder,
  buildPolicyContext,
  buildPolicyOutcome,
} from '../policy/context-builder';

// NOTE: this module imports ONLY the catalog + business config + the
// deterministic policy engine. It has NO access to PayPalClient / the PayPal SDK.
// That is the structural safety boundary: the AI can prepare a cart but can never
// execute a payment. Policy evaluation here is ADVISORY only — it never reserves
// spend or touches PayPal (R1/R4/R5).
const catalogService = new CatalogService();

export interface ShoppingPreferences {
  dietary: string[];
  maxBudgetMinor?: number;
}

// S10 (R2): optional context carrying the stable session/cart identity so the
// advisory PolicyEvent can correlate to the authoritative one. Backwards
// compatible — existing callers that omit it still type-check.
export interface ToolExecutionContext {
  sessionId?: string;
}

function meetsDietaryPreferences(
  product: { dietary: string[]; category: string },
  preferences: string[]
): boolean {
  if (product.category === 'gifts' && product.dietary.length === 0) {
    return true;
  }
  return preferences.every((preference) =>
    preference === 'vegetarian'
      ? product.dietary.includes('vegetarian') || product.dietary.includes('vegan')
      : product.dietary.includes(preference)
  );
}

export async function executeTool(
  toolName: string,
  args: any,
  preferences: ShoppingPreferences = { dietary: [] },
  context?: ToolExecutionContext
): Promise<any> {
  switch (toolName) {
    case 'search_products': {
      const results = catalogService.search({
        query: args.query,
        category: args.category,
        tags: args.tags,
        dietary: args.dietary,
        occasion: args.occasion,
        maxPriceMinor: args.maxPriceMinor,
        matchMode: 'any',
      }).filter((product) =>
        meetsDietaryPreferences(product, preferences.dietary)
      );

      return {
        count: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          priceMinor: p.priceMinor,
          priceFormatted: formatMoney(p.priceMinor, p.currency, currentBusiness.locale),
          currency: p.currency,
          category: p.category,
          tags: p.tags,
          dietary: p.dietary,
          occasion: p.occasion,
        })),
      };
    }

    case 'get_product_details': {
      const product = catalogService.getById(args.productId);
      if (!product) {
        throw new Error(`Product not found: ${args.productId}`);
      }

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        priceMinor: product.priceMinor,
        priceFormatted: formatMoney(product.priceMinor, product.currency, currentBusiness.locale),
        currency: product.currency,
        category: product.category,
        tags: product.tags,
        dietary: product.dietary,
        occasion: product.occasion,
        available: product.available,
      };
    }

    case 'prepare_cart': {
      const items = args.items || [];

      // Validate items exist and calculate totals (authoritative pricing).
      const validatedItems: any[] = [];
      let totalMinor = 0;
      const seenProductIds = new Set<string>();

      for (const item of items) {
        if (seenProductIds.has(item.productId)) {
          throw new Error(`Duplicate product in cart: ${item.productId}`);
        }
        seenProductIds.add(item.productId);

        const product = catalogService.getById(item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        const unmetDietaryPreferences = preferences.dietary.filter((diet) =>
          !meetsDietaryPreferences(product, [diet])
        );
        if (unmetDietaryPreferences.length > 0) {
          throw new Error(
            `${product.name} does not meet the shopper's dietary preferences: ${unmetDietaryPreferences.join(', ')}`
          );
        }

        if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100) {
          throw new Error(`Invalid quantity for ${item.productId}: ${item.quantity}`);
        }

        const lineTotalMinor = product.priceMinor * item.quantity;
        totalMinor += lineTotalMinor;

        validatedItems.push({
          productId: product.id,
          name: product.name,
          quantity: item.quantity,
          unitPriceMinor: product.priceMinor,
          unitPriceFormatted: formatMoney(product.priceMinor, product.currency, currentBusiness.locale),
          lineTotalMinor,
          lineTotalFormatted: formatMoney(lineTotalMinor, product.currency, currentBusiness.locale),
        });
      }

      if (
        args.maxBudgetMinor !== undefined &&
        (!Number.isInteger(args.maxBudgetMinor) || args.maxBudgetMinor < 0)
      ) {
        throw new Error('maxBudgetMinor must be a non-negative integer');
      }
      const maxBudgetMinor = [
        args.maxBudgetMinor,
        preferences.maxBudgetMinor,
      ].filter((budget): budget is number => budget !== undefined)
        .reduce<number | undefined>(
          (lowest, budget) => lowest === undefined ? budget : Math.min(lowest, budget),
          undefined
        );
      if (maxBudgetMinor !== undefined && totalMinor > maxBudgetMinor) {
        throw new Error(
          `Cart total ${totalMinor} minor units exceeds the maximum budget of ${maxBudgetMinor} minor units`
        );
      }
      validateOrderTotal(totalMinor);

      // S10 (R4/R5): ADVISORY policy evaluation. The catalog validation and
      // authoritative pricing above have already run. Now a policy snapshot is
      // evaluated, an advisory PolicyEvent is stored, and the metadata is
      // returned to the AI/tool caller. A BLOCK must NOT reserve spend or call
      // PayPal.
      const userId = getDemoUserId();
      const sessionId = context?.sessionId;
      const cartId = createCartId(sessionId ?? '', validatedItems);
      let policy = policyStorage.getPolicy(userId);
      if (!policy) {
        policy = defaultPolicy;
        policyStorage.setPolicy(defaultPolicy);
      }
      const policyContext = buildPolicyContext(
        userId,
        currentBusiness.businessId,
        dailySpendTracker
      );
      const evaluation = policyService.evaluatePurchase(
        buildEvaluationOrder(
          sessionId ?? '',
          validatedItems,
          totalMinor,
          currentBusiness.currency,
          OrderOrigin.AI_AGENT
        ),
        policy,
        policyContext
      );
      const outcome = buildPolicyOutcome(evaluation);
      policyStorage.recordEvent({
        userId,
        sessionId,
        cartId,
        orderId: undefined,
        agent: 'AI_AGENT',
        amountMinor: totalMinor,
        currency: currentBusiness.currency,
        evaluation,
        policy,
      });

      return {
        items: validatedItems,
        totalMinor,
        totalFormatted: formatMoney(totalMinor, currentBusiness.currency, currentBusiness.locale),
        currency: currentBusiness.currency,
        cartId,
        message: `Cart prepared with ${validatedItems.length} item(s). Total: ${formatMoney(
          totalMinor,
          currentBusiness.currency,
          currentBusiness.locale
        )}. Ready for user confirmation and payment.`,
        policyDecision: outcome.decision,
        policyViolations: outcome.violations,
        requiresExplicitApproval: outcome.requiresExplicitApproval,
        retrySuggested: outcome.retrySuggested,
        reason: outcome.reason,
      };
    }

    default:
      throw new Error(
        `Unknown tool: ${toolName}. Allowed tools: search_products, get_product_details, prepare_cart`
      );
  }
}
