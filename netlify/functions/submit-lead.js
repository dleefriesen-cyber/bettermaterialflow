const GAS_URL = process.env.GAS_URL;

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  const name  = String(payload.name  || '').trim().slice(0, 200);
  const email = String(payload.email || '').trim().slice(0, 200);
  const phone = String(payload.phone || '').trim().slice(0, 50);

  if (!name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required' }) };
  }
  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email address' }) };
  }
  if (!GAS_URL) {
    console.error('GAS_URL environment variable not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const sanitized = {
    name,
    email,
    phone,
    formType:         String(payload.formType         || '').slice(0, 50),
    company:          String(payload.company          || '').slice(0, 200),
    currentEquipment: String(payload.currentEquipment || '').slice(0, 100),
    sheetsPerDay:     String(payload.sheetsPerDay     || '').slice(0, 50),
    decisionTimeline: String(payload.decisionTimeline || '').slice(0, 50),
    source:           String(payload.source           || '').slice(0, 200),
    page:             String(payload.page             || '').slice(0, 500),
    timestamp:        new Date().toISOString(),
    utm_source:       String(payload.utm_source       || '').slice(0, 100),
    utm_medium:       String(payload.utm_medium       || '').slice(0, 100),
    utm_campaign:     String(payload.utm_campaign     || '').slice(0, 100),
    utm_keyword:      String(payload.utm_keyword      || '').slice(0, 100),
    utm_content:      String(payload.utm_content      || '').slice(0, 100),
  };

  // GAS web apps issue a 302 redirect on POST; follow it manually so the
  // body is re-sent as POST instead of being dropped as a GET.
  try {
    let url = GAS_URL;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized),
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        url = res.headers.get('location');
        if (!url) break;
        continue;
      }
      break;
    }
  } catch (err) {
    console.error('GAS forwarding failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to save submission' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
