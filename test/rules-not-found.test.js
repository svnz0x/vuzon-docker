process.env.CF_API_TOKEN = process.env.CF_API_TOKEN || 'token';
process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'account';
process.env.CF_ZONE_ID = process.env.CF_ZONE_ID || 'zone';
process.env.DOMAIN = process.env.DOMAIN || 'example.com';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, setCfClientForTesting } = require('../server');

function createNotFoundClient(tracker) {
  return {
    async get(path) {
      tracker.gets.push(path);
      if (/\/rules\/[^/]+$/.test(path)) {
        const error = new Error('Not Found');
        error.response = { status: 404 };
        throw error;
      }

      return {
        data: {
          result: [],
          result_info: {
            page: 1,
            count: 0,
            total_count: 0,
            total_pages: 1
          }
        }
      };
    },
    async put() {
      tracker.puts += 1;
      throw new Error('PUT should not be called when rule is missing');
    }
  };
}

afterEach(() => {
  setCfClientForTesting();
});

test('POST /api/rules/:id/disable returns 404 when rule is missing', { concurrency: false }, async () => {
  const tracker = { gets: [], puts: 0 };
  const client = createNotFoundClient(tracker);
  setCfClientForTesting(client);

  const response = await request(app).post('/api/rules/missing-rule/disable').send();

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Regla no encontrada' });
  assert.equal(tracker.puts, 0);
});

test('POST /api/rules/:id/enable returns 404 when rule is missing', { concurrency: false }, async () => {
  const tracker = { gets: [], puts: 0 };
  const client = createNotFoundClient(tracker);
  setCfClientForTesting(client);

  const response = await request(app).post('/api/rules/missing-rule/enable').send();

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Regla no encontrada' });
  assert.equal(tracker.puts, 0);
});
