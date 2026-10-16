import { AppError } from '../middleware/error-handler';
import { CatalogService, Product } from '../catalog/service';
import { currentBusiness } from '../config/business-config';
import { OrderItem } from './domain';

// Centralized, testable validation of an incoming order request.
// Enforces FIX #9 (currency invariant) and FIX #12 (quantity validation) and
// produces server-authoritative line totals (never trusts client-supplied price).
export function validateOrderItems(
  rawItems: any,
  catalog: CatalogService
): OrderItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError(400, 'items array required and must be non-empty');
  }

  const validated: OrderItem[] = [];

  for (const item of rawItems) {
    const product: Product | undefined = catalog.getById(item?.productId);
    if (!product) {
      throw new AppError(400, `Product not found: ${item?.productId}`);
    }

    // FIX #9: currency invariant — product currency must match business currency.
    if (product.currency !== currentBusiness.currency) {
      throw new AppError(
        400,
        `Currency mismatch: product=${product.currency}, business=${currentBusiness.currency}`
      );
    }

    // FIX #12: quantity must be an integer in (0, 100].
    const qty = Number(item?.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100) {
      throw new AppError(400, `Invalid quantity for ${product.id}: ${item?.quantity}`);
    }

    validated.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      unitPriceMinor: product.priceMinor,
      lineTotalMinor: product.priceMinor * qty,
    });
  }

  validateOrderTotal(
    validated.reduce((total, item) => total + item.lineTotalMinor, 0)
  );

  return validated;
}

export function validateOrderTotal(totalMinor: number): void {
  if (totalMinor < currentBusiness.minOrderValueMinor) {
    throw new AppError(
      400,
      `Order total must be at least ${currentBusiness.minOrderValueMinor} minor units`
    );
  }
  if (totalMinor > currentBusiness.maxOrderValueMinor) {
    throw new AppError(
      400,
      `Order total must not exceed ${currentBusiness.maxOrderValueMinor} minor units`
    );
  }
}
