// FIX-05 (verification findings R1/R2/R3): the release gate for a deployment.
//
// `npm run verify:deployment <url>` walks the live service and must FAIL when the
// deployment is not durable:
//   * storage mode 'memory'  → orders, reservations, idempotency keys and sessions are
//     volatile: they are lost on every restart/redeploy even though the deployment
//     config claims REQUIRE_PERSISTENCE=true.
//   * mandate keyPersistence 'ephemeral' → Cart Mandates signed before the last restart
//     can no longer be verified, silently breaking the advertised guarantee.
//   * mandate keyPersistence 'invalid'   → /api/health answers 503 and mandates are
//     unusable outright.
//
// The logic lives here (not inline in the script) so it is unit-testable against
// fixture payloads without a live host.

export interface DeploymentCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** The subset of GET /api/health this gate needs. */
export interface HealthPayload {
  status?: string;
  storage?: { mode?: string; durable?: boolean };
  mandates?: { keyPersistence?: string; error?: string };
}

export function evaluateDurabilityGates(health: HealthPayload | null | undefined): DeploymentCheck[] {
  const storage = health?.storage;
  const mode = storage?.mode;
  const durable = storage?.durable === true && mode === 'postgres';
  const checks: DeploymentCheck[] = [
    {
      name: 'storage is durable (PostgreSQL)',
      ok: durable,
      detail: durable
        ? 'mode=postgres durable=true'
        : `mode=${mode ?? 'missing'} durable=${String(storage?.durable ?? false)} — orders/reservations/idempotency do not survive a restart`,
    },
  ];

  const keyPersistence = health?.mandates?.keyPersistence;
  const configured = keyPersistence === 'configured';
  checks.push({
    name: 'Cart Mandate signing key is persistent',
    ok: configured,
    detail: configured
      ? 'keyPersistence=configured'
      : `keyPersistence=${keyPersistence ?? 'missing'}${health?.mandates?.error ? ` (${health.mandates.error})` : ''} — mandates signed before a restart cannot be verified`,
  });

  return checks;
}

/** Overall verdict for the durability gate: every check must pass. */
export function durabilityGatePasses(health: HealthPayload | null | undefined): boolean {
  return evaluateDurabilityGates(health).every((c) => c.ok);
}
