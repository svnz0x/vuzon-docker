process.env.CF_API_TOKEN = process.env.CF_API_TOKEN || 'token';
process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || 'account';
process.env.CF_ZONE_ID = process.env.CF_ZONE_ID || 'zone';
process.env.DOMAIN = process.env.DOMAIN || 'example.com';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, setCfClientForTesting } = require('../server');

afterEach(() => {
  setCfClientForTesting();
});

test('POST /api/rules rechaza localPart inválido', async () => {
  setCfClientForTesting({
    async post() {
      throw new Error('No debería invocar Cloudflare con datos inválidos');
    }
  });

  const response = await request(app)
    .post('/api/rules')
    .send({ localPart: 'alias+invalido', destEmail: 'dest@example.com' });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: 'El alias solo puede contener letras, números, puntos y guiones'
  });
});

test('POST /api/rules rechaza destEmail inválido', async () => {
  setCfClientForTesting({
    async post() {
      throw new Error('No debería invocar Cloudflare con datos inválidos');
    }
  });

  const response = await request(app)
    .post('/api/rules')
    .send({ localPart: 'alias.valido', destEmail: 'destinoinvalido' });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: 'destEmail debe ser un correo válido'
  });
});

test('POST /api/rules trimmea valores y crea la regla', async () => {
  const calls = [];
  setCfClientForTesting({
    async post(path, body) {
      calls.push({ path, body });
      return { data: { success: true } };
    }
  });

  const response = await request(app)
    .post('/api/rules')
    .send({ localPart: '  alias.valido  ', destEmail: '  dest@example.com  ', name: '  Nombre personalizado  ' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/zones/zone/email/routing/rules');
  assert.deepEqual(calls[0].body, {
    enabled: true,
    name: 'Nombre personalizado',
    matchers: [{ type: 'literal', field: 'to', value: 'alias.valido@example.com' }],
    actions: [{ type: 'forward', value: ['dest@example.com'] }]
  });
});
