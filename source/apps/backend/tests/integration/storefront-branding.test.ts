import request from 'supertest';
import path from 'path';

describe('storefront branding follows the merchant profile', () => {
  const load = (profile?: string) => {
    const prev = process.env.BUSINESS_PROFILE_PATH;
    if (profile) process.env.BUSINESS_PROFILE_PATH = profile;
    else delete process.env.BUSINESS_PROFILE_PATH;
    let app: any;
    jest.isolateModules(() => {
      app = require('../../src/app').createApp();
    });
    if (prev === undefined) delete process.env.BUSINESS_PROFILE_PATH;
    else process.env.BUSINESS_PROFILE_PATH = prev;
    return app;
  };

  it('default deployment says AI Café', async () => {
    const res = await request(load()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>AI Café');
  });

  it('corner-bakery profile says Corner Bakery in title and heading, never AI Café', async () => {
    const res = await request(load(path.resolve(__dirname, '../../examples/business-profiles/corner-bakery.json'))).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Corner Bakery');
    expect(res.text).toContain('Corner Bakery</h1>');
    expect(res.text).not.toContain('AI Café');
  });
});
