import fs from 'fs';
import path from 'path';

// Every third-party script on the dashboard (which holds the ops key in sessionStorage) must be
// version-pinned and carry a Subresource Integrity hash.
describe('dashboard third-party scripts', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  const tags = html.match(/<script[^>]+src="https?:\/\/[^"]+"[^>]*>/g) ?? [];

  it('loads at least the AG Grid CDN script', () => {
    expect(tags.length).toBeGreaterThan(0);
  });

  it.each(tags.map((t) => [t]))('is pinned + integrity-checked: %s', (tag) => {
    expect(tag).toMatch(/@\d+\.\d+\.\d+/);
    expect(tag).toMatch(/integrity="sha384-[A-Za-z0-9+/=]{64}"/);
    expect(tag).toContain('crossorigin="anonymous"');
  });
});
