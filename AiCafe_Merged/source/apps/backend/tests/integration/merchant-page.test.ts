import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../src/app';

const app = createApp();

test('merchant walkthrough page is served and states it is not live onboarding', async () => {
  const res = await request(app).get('/merchant.html');
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/does <b>not<\/b> connect a real PayPal merchant account/);
  expect(res.text).toMatch(/Sandbox/);
  expect(res.text).toMatch(/not PayPal’s price list/);
});

test('merchant page script reads real health and never uses innerHTML', () => {
  const js = fs.readFileSync(path.join(__dirname, '../../public/merchant.js'), 'utf8');
  expect(js).toMatch(/\/api\/health/);
  expect(js).not.toMatch(/innerHTML|eval\(|document\.write/);
});

test('page makes no unverifiable savings or fee-rate claims', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/merchant.html'), 'utf8');
  expect(html).not.toMatch(/guarantee|increase sales by|save \d+%|official PayPal partner/i);
});
