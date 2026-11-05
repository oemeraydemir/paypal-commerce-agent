/* Validates a merchant profile BEFORE deploying it and prints exactly what the shopper-facing policy
 * will enforce. Usage: npm run profile:validate -- examples/business-profiles/corner-bakery.json */
import fs from 'fs';
import path from 'path';
import { parseBusinessProfile } from '../src/config/business-profile';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run profile:validate -- <profile.json>');
  process.exit(2);
}
const resolved = path.resolve(process.cwd(), file);
try {
  const profile = parseBusinessProfile(JSON.parse(fs.readFileSync(resolved, 'utf8')), `profile ${resolved}`);
  const b = profile.business;
  const fmt = (m: number) => `${b.currency} ${(m / 100).toFixed(2)}`;
  const limit = b.maxOrderValueMinor;
  const threshold = Math.min(b.confirmationThresholdMinor ?? 1000, limit);
  const daily = b.dailySpendLimitMinor ?? Math.max(10000, limit * 5);
  const unbuyable = profile.products.filter((p) => p.priceMinor > limit).map((p) => p.id);
  console.log(`OK  ${b.name} (${b.businessId})  products=${profile.products.length}`);
  console.log(`    per-purchase limit ${fmt(limit)} | approval above ${fmt(threshold)} | daily budget ${fmt(daily)}`);
  if (unbuyable.length) {
    console.error(`FAIL products priced above the per-purchase limit can never be bought: ${unbuyable.join(', ')}`);
    process.exit(1);
  }
} catch (err: any) {
  console.error(err?.message ?? err);
  process.exit(1);
}
