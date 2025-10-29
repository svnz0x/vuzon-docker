const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const { PORT = 3000, CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN } = process.env;
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('Faltan variables en .env (CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN)');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/icons', express.static('icons'));
app.get('/site.webmanifest', (req,res)=>res.sendFile(require('path').join(__dirname,'site.webmanifest')));

const cf = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' }
});

async function fetchAllPages(path, { client = cf, perPage = 100, params = {} } = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  let baseInfo = null;

  while (page <= totalPages) {
    const query = { ...params, page };
    if (perPage != null) {
      query.per_page = perPage;
    }

    const response = await client.get(path, { params: query });
    const data = response.data ?? {};
    const pageItems = data.result?.result ?? data.result ?? [];

    if (Array.isArray(pageItems)) {
      items.push(...pageItems);
    }

    const info = data.result_info ?? data.result?.result_info;
    if (!baseInfo && info) {
      baseInfo = info;
    }
    if (info) {
      const reportedTotal = Number(info.total_pages ?? info.totalPages);
      if (Number.isFinite(reportedTotal) && reportedTotal > 0) {
        totalPages = Math.max(totalPages, reportedTotal);
      }
    } else {
      break;
    }

    if (page >= totalPages) {
      break;
    }

    page += 1;
  }

  const resultInfo = baseInfo
    ? {
        ...baseInfo,
        page: 1,
        count: items.length,
        total_count: baseInfo.total_count ?? items.length,
        total_pages: Math.max(totalPages, 1)
      }
    : undefined;

  return { items, resultInfo };
}

function normalizeRulePayload(rule) {
  if (!rule) return null;
  const payload = {};
  // Conservar id para usar en el path si el cliente envió un tag
  if (rule.id) payload.id = rule.id;


  if (Array.isArray(rule.matchers)) {
    payload.matchers = rule.matchers.map(m => ({ ...m }));
  }

  if (Array.isArray(rule.actions)) {
    payload.actions = rule.actions.map(a => ({ ...a }));
  }

  if (rule.name !== undefined && rule.name !== null) {
    payload.name = rule.name;
  }

  if (typeof rule.priority === 'number') {
    payload.priority = rule.priority;
  }

  return Object.keys(payload).length ? payload : null;
}

async function getRuleForUpdate(ruleIdentifier, id, client) {
  const detailPath = `/zones/${CF_ZONE_ID}/email/routing/rules/${id}`;
  try {
    const ruleResp = await client.get(detailPath);
    const rule = ruleResp.data?.result ?? ruleResp.data;
    const normalized = normalizeRulePayload(rule);
    if (normalized?.matchers && normalized?.actions) {
      return normalized;
    }
  } catch (err) {
    if (err.response?.status && err.response.status !== 404) {
      throw err;
    }
  }

  const listPath = `/zones/${CF_ZONE_ID}/email/routing/rules`;
  const { items: listData } = await fetchAllPages(listPath, { client });
  const target = (listData || []).find(r => (r.id ?? r.tag) === ruleIdentifier);
  const normalized = normalizeRulePayload(target);
  if (normalized?.matchers && normalized?.actions) {
    return normalized;
  }
  return null;
}

async function updateRuleEnabled(ruleIdentifier, enabled, client = cf) {
  const id = encodeURIComponent(ruleIdentifier);
  const payload = await getRuleForUpdate(ruleIdentifier, id, client);

  if (!payload?.matchers || !payload?.actions) {
    const error = new Error('Regla incompleta: faltan matchers o actions');
    throw error;
  }

  const pathId = encodeURIComponent(payload.id || ruleIdentifier);
  const { id: _omit, ...body } = payload;

  try {
    return await client.put(`/zones/${CF_ZONE_ID}/email/routing/rules/${pathId}`, {
      ...body,
      enabled
    });
  } catch (err) {
    const status = err.response?.status;
    if (
      status &&
      (status < 400 || status === 401 || status === 403 || status >= 500)
    ) {
      throw err;
    }

    if (pathId !== id) {
      try {
        return await client.put(`/zones/${CF_ZONE_ID}/email/routing/rules/${id}`, {
          ...body,
          enabled
        });
      } catch (innerErr) {
        throw innerErr.response?.data ? innerErr : err;
      }
    }

    throw err;
  }
}

/** ------- DESTINATARIOS (Accounts) ------- */
app.get('/api/addresses', async (_req, res) => {
  try {
    const path = `/accounts/${CF_ACCOUNT_ID}/email/routing/addresses`;
    const { items, resultInfo } = await fetchAllPages(path);
    res.json({ success: true, result: items, ...(resultInfo ? { result_info: resultInfo } : {}) });
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

app.post('/api/addresses', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email requerido' });
    const r = await cf.post(`/accounts/${CF_ACCOUNT_ID}/email/routing/addresses`, { email });
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

app.delete('/api/addresses/:id', async (req, res) => {
  try {
    const r = await cf.delete(`/accounts/${CF_ACCOUNT_ID}/email/routing/addresses/${req.params.id}`);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

/** ------- ALIAS / REGLAS (Zones) ------- */
app.get('/api/rules', async (_req, res) => {
  try {
    const path = `/zones/${CF_ZONE_ID}/email/routing/rules`;
    const { items, resultInfo } = await fetchAllPages(path);
    res.json({ success: true, result: items, ...(resultInfo ? { result_info: resultInfo } : {}) });
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    const { localPart, destEmail, name } = req.body;
    if (!localPart || !destEmail) {
      return res.status(400).json({ error: 'localPart y destEmail requeridos' });
    }
    const alias = `${localPart}@${DOMAIN}`;
    const body = {
      enabled: true,
      name: name || `${alias} -> ${destEmail}`,
      matchers: [{ type: 'literal', field: 'to', value: alias }],
      actions: [{ type: 'forward', value: [destEmail] }]
    };
    const r = await cf.post(`/zones/${CF_ZONE_ID}/email/routing/rules`, body);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    const r = await cf.delete(`/zones/${CF_ZONE_ID}/email/routing/rules/${req.params.id}`);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

app.post('/api/rules/:id/disable', async (req, res) => {
  try {
    const r = await updateRuleEnabled(req.params.id, false);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

app.post('/api/rules/:id/enable', async (req, res) => {
  try {
    const r = await updateRuleEnabled(req.params.id, true);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

/** (Opcional) habilitar routing en la zona */
app.post('/api/enable-routing', async (_req, res) => {
  try {
    const r = await cf.post(`/zones/${CF_ZONE_ID}/email/routing/dns`);
    res.json(r.data);
  } catch (e) {
    const status = e.response?.status ?? 500;
    const payload = e.response?.data ?? { error: e.message };
    res.status(status).json(payload);
  }
});

// Health endpoint for container healthcheck
app.get('/health', (req, res) => res.status(200).send('ok'));


if (require.main === module) {
  app.listen(PORT, () => console.log(`App lista en http://0.0.0.0:${PORT}`));
}

module.exports = { app, updateRuleEnabled };
