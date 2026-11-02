import { AppError } from '../middleware/error-handler';
import { PolicyEvaluation } from './domain';

/**
 * Server-side confirmation for UNKNOWN allergen information.
 *
 * When the shopper's Wellbeing Guard lists allergen concerns and a cart item has no allergen
 * declaration from the café, the item is "unknown", never "allergen-free". The server will not
 * create the order (or split bill) until the caller explicitly acknowledges that, so a client
 * that calls the order API directly cannot skip the warning. The acknowledgement is a flag in
 * the request body; a UI must show the warning before it sets it.
 */
export const ALLERGEN_ACK_FIELD = 'acknowledgeAllergenUnknown';

export function requireAllergenAcknowledgement(evaluation: PolicyEvaluation, body: unknown): void {
  const unknown = evaluation.violations.filter((v) => v.type === 'GUARD_ALLERGEN_UNVERIFIED');
  if (unknown.length === 0) return;
  const acknowledged = (body as Record<string, unknown> | undefined)?.[ALLERGEN_ACK_FIELD] === true;
  if (acknowledged) return;
  throw new AppError(
    409,
    'Allergen information is missing for an item in your cart. Confirm explicitly to continue.',
    {
      code: 'ALLERGEN_CONFIRMATION_REQUIRED',
      acknowledgeField: ALLERGEN_ACK_FIELD,
      items: unknown.map((v) => v.message),
      guardDataVersion: evaluation.guardDataVersion,
    }
  );
}
