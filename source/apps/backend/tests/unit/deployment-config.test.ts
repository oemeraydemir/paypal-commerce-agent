/**
 * FIX-05 (verification findings R1/R2/R3): the deployment CONFIG itself must require
 * durable persistence.
 *
 * render.yaml is the single source of truth for the hosted service. If it ever stops
 * declaring a PostgreSQL database, stops wiring DATABASE_URL to it, or drops
 * REQUIRE_PERSISTENCE=true, the service can boot on volatile storage and silently lose
 * orders — exactly the defect this gate exists to prevent. These assertions are
 * deliberately textual (no YAML dependency) and fail loudly on any regression.
 */
import fs from 'fs';
import path from 'path';

// render.yaml is committed with CRLF line endings on this checkout; normalise so the
// assertions below read the same on any platform.
// Render reads the blueprint from the repository ROOT; the backend copy is only a fallback for old checkouts.
const renderYamlPath = [
  path.join(__dirname, '..', '..', '..', '..', '..', 'render.yaml'), // repository root
  path.join(__dirname, '..', '..', 'render.yaml'),
].find((p) => fs.existsSync(p)) as string;
const renderYaml = fs.readFileSync(renderYamlPath, 'utf8').replace(/\r\n/g, '\n');

describe('render.yaml deployment config (FIX-05)', () => {
  test('declares a PostgreSQL database for the service', () => {
    expect(renderYaml).toMatch(/^databases:/m);
    expect(renderYaml).toMatch(/- name: aicafe-db/);
  });

  test('wires DATABASE_URL to that database', () => {
    expect(renderYaml).toMatch(/- key: DATABASE_URL\n\s+fromDatabase:\n\s+name: aicafe-db/);
  });

  test('requires persistence (no silent fallback to memory)', () => {
    expect(renderYaml).toMatch(/- key: REQUIRE_PERSISTENCE\n\s+value: true/);
  });

  test('sets the private Render database SSL mode explicitly', () => {
    expect(renderYaml).toMatch(/- key: DATABASE_SSL\n\s+value: false/);
  });

  test('declares the Cart Mandate signing key slot (set in the dashboard, never committed)', () => {
    expect(renderYaml).toMatch(/- key: MANDATE_SIGNING_KEY\n\s+sync: false/);
    // A secret must never be inlined in the repository.
    expect(renderYaml).not.toMatch(/MANDATE_SIGNING_KEY\n\s+value:/);
  });

  test('health check path is the endpoint that reports storage mode', () => {
    expect(renderYaml).toMatch(/healthCheckPath: \/api\/health/);
  });
});
