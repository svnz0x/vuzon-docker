const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CF_API_TOKEN = 'token';
process.env.CF_ACCOUNT_ID = 'account';
process.env.CF_ZONE_ID = 'zone';
process.env.DOMAIN = 'example.com';

const { updateRuleEnabled } = require('../server.js');

function createMockClient(overrides = {}) {
  const client = {
    putCalls: [],
    getCalls: [],
    async put(path, body) {
      this.putCalls.push({ path, body });
      if (overrides.put) {
        return overrides.put.call(this, path, body);
      }
      return { data: { ok: true } };
    },
    async get(path) {
      this.getCalls.push(path);
      if (overrides.get) {
        return overrides.get.call(this, path);
      }
      return { data: {} };
    }
  };
  return client;
}

test('updateRuleEnabled realiza la actualización directa cuando no hay errores', async (t) => {
  const client = createMockClient({
    async get(path) {
      throw Object.assign(new Error('no debe solicitar la regla'), { code: 'UNEXPECTED_GET' });
    }
  });

  const result = await updateRuleEnabled('rule-1', true, client);

  assert.equal(result.data?.ok, true);
  assert.equal(client.putCalls.length, 1);
  assert.deepEqual(client.putCalls[0], {
    path: '/zones/zone/email/routing/rules/rule-1',
    body: { enabled: true }
  });
  assert.equal(client.getCalls.length, 0);
});

test('updateRuleEnabled reintenta con la regla completa tras error inicial', async (t) => {
  const rulePayload = {
    id: 'rule-1',
    name: 'Alias de prueba',
    priority: 1,
    matchers: [{ type: 'literal', field: 'to', value: 'a@example.com' }],
    actions: [{ type: 'forward', value: 'b@example.com' }]
  };

  const client = createMockClient({
    async put(path, body) {
      if (this.putCalls.length === 1) {
        const err = new Error('faltan campos');
        err.response = { status: 409 };
        throw err;
      }
      return { data: { ok: true, attempt: this.putCalls.length } };
    },
    async get(path) {
      return { data: { result: rulePayload } };
    }
  });

  const result = await updateRuleEnabled('rule-1', false, client);

  assert.equal(client.putCalls.length, 2);
  assert.deepEqual(client.putCalls[0], {
    path: '/zones/zone/email/routing/rules/rule-1',
    body: { enabled: false }
  });
  assert.deepEqual(client.putCalls[1], {
    path: '/zones/zone/email/routing/rules/rule-1',
    body: {
      actions: rulePayload.actions,
      matchers: rulePayload.matchers,
      name: rulePayload.name,
      priority: rulePayload.priority,
      enabled: false
    }
  });
  assert.deepEqual(client.getCalls, [
    '/zones/zone/email/routing/rules/rule-1'
  ]);
  assert.equal(result.data?.ok, true);
  assert.equal(result.data?.attempt, 2);
});

test('updateRuleEnabled lanza error si no se puede recuperar matchers/actions', async () => {
  const client = createMockClient({
    async put(path, body) {
      const err = new Error('faltan campos');
      err.response = { status: 409 };
      throw err;
    },
    async get(path) {
      if (path.endsWith('/rules/rule-1')) {
        return { data: { result: { id: 'rule-1', matchers: [{ field: 'to' }] } } };
      }
      return { data: { result: [{ id: 'rule-1', matchers: [{ field: 'to' }] }] } };
    }
  });

  await assert.rejects(
    updateRuleEnabled('rule-1', true, client),
    /Regla incompleta: faltan matchers o actions/
  );
  assert.equal(client.putCalls.length, 1);
  assert.ok(client.getCalls.length >= 1);
});
