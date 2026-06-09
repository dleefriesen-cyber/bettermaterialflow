require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const db = require('./db');
const { LAMELLO_CATALOG } = require('./connectors');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─────────────────────────────────────────────
// SYSTEM PROMPT (cached — same for every user)
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a friendly Lamello connector expert assistant embedded on a dealer's website. Your job is to help customers find the right Lamello connector for their woodworking project through a short, friendly conversation.

PRODUCT CATALOG:
${LAMELLO_CATALOG}

CONVERSATION RULES:
1. Ask ONE question at a time — never overwhelm the customer.
2. Keep answers SHORT (2-3 sentences max unless explaining a recommendation).
3. After 2-3 questions, make a clear recommendation with the product name in **bold**.
4. Always end recommendations with: "Would you like to ask your dealer about availability?"
5. Be friendly and conversational — this is a retail context.
6. If asked about price, say the dealer can provide current pricing.
7. Never recommend a competitor product.

START: When the conversation begins, greet the user warmly and ask what project they're working on.`;

// ─────────────────────────────────────────────
// WIDGET CHAT ENDPOINT
// POST /api/chat
// Body: { sessionId, dealerId, messages, userAgent, domain }
// ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { sessionId, dealerId, messages, userAgent, domain } = req.body;

  if (!dealerId) {
    return res.status(400).json({ error: 'dealerId is required' });
  }

  // Create or continue session tracking
  const sid = sessionId || uuidv4();
  if (!sessionId) {
    db.createSession(sid, dealerId, domain, userAgent);
    db.logEvent(sid, dealerId, 'session_start', { domain });
  }

  // Log the user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === 'user') {
    db.logEvent(sid, dealerId, 'user_message', { text: lastMessage.content });
  }

  try {
    // Call Claude Haiku (fast + cheap for this use case)
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    const assistantText = response.content[0].text;

    // Log assistant response
    db.logEvent(sid, dealerId, 'assistant_message', { text: assistantText });

    // Detect if a connector was recommended (look for bold product names)
    const connectorMatch = assistantText.match(/\*\*(Clamex|Cabineo|Zeta|Simplex)[^*]+\*\*/i);
    if (connectorMatch) {
      const connectorName = connectorMatch[0].replace(/\*\*/g, '').trim();
      db.completeSession(sid, connectorName);
      db.logEvent(sid, dealerId, 'recommendation', { connector: connectorName });
    }

    res.json({
      sessionId: sid,
      message: assistantText,
      usage: response.usage,
    });

  } catch (err) {
    console.error('Claude API error:', err);
    db.logEvent(sid, dealerId, 'error', { message: err.message });
    res.status(500).json({ error: 'Failed to get recommendation. Please try again.' });
  }
});

// ─────────────────────────────────────────────
// FEEDBACK ENDPOINT
// POST /api/feedback
// Body: { sessionId, dealerId, connectorRecommended, rating (1 or -1), conversation }
// ─────────────────────────────────────────────
app.post('/api/feedback', (req, res) => {
  const { sessionId, dealerId, connectorRecommended, rating, conversation } = req.body;

  if (!sessionId || !dealerId || !rating) {
    return res.status(400).json({ error: 'sessionId, dealerId, and rating are required' });
  }
  if (rating !== 1 && rating !== -1) {
    return res.status(400).json({ error: 'rating must be 1 (👍) or -1 (👎)' });
  }

  db.saveFeedback(sessionId, dealerId, connectorRecommended, rating, conversation);
  db.logEvent(sessionId, dealerId, 'feedback', { rating, connectorRecommended });

  res.json({ ok: true });
});

// GET /api/feedback/:dealerId — get feedback for dashboard
app.get('/api/feedback/:dealerId', (req, res) => {
  const { dealerId } = req.params;
  const apiKey = req.headers['x-api-key'];
  const dealer = db.getDealerByKey(apiKey);
  if (!dealer && apiKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  const feedback = db.getFeedback(dealerId);
  const summary = db.getFeedbackSummary(dealerId);
  res.json({ feedback, summary });
});

// ─────────────────────────────────────────────
// ANALYTICS ENDPOINTS
// ─────────────────────────────────────────────

// GET /api/analytics/:dealerId — dealer-specific stats
// Requires header: x-api-key
app.get('/api/analytics/:dealerId', (req, res) => {
  const { dealerId } = req.params;
  const apiKey = req.headers['x-api-key'];

  // Simple key check (in production, use proper auth)
  const dealer = db.getDealerByKey(apiKey);
  if (!dealer && apiKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  const stats = db.getDealerStats(dealerId);
  res.json(stats);
});

// GET /api/analytics/global/all — global view (admin only)
app.get('/api/analytics/global/all', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Admin only' });
  }
  res.json(db.getGlobalStats());
});

// GET /api/dealers — list all dealers (admin)
app.get('/api/dealers', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Admin only' });
  }
  res.json(db.getAllDealers());
});

// ─────────────────────────────────────────────
// WIDGET SCRIPT ENDPOINT
// GET /widget.js?id=DEALER_ID
// Returns the widget JS with dealer ID baked in
// ─────────────────────────────────────────────
app.get('/widget.js', (req, res) => {
  const dealerId = req.query.id || 'unknown';
  const fs = require('fs');
  const path = require('path');

  const widgetSrc = fs.readFileSync(path.join(__dirname, '../widget/widget.js'), 'utf8');

  // Inject dealer ID and API base URL into the widget
  const injected = widgetSrc
    .replace('__DEALER_ID__', dealerId)
    .replace('__API_BASE__', process.env.API_BASE_URL || `http://localhost:${PORT}`);

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(injected);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize DB then start server
db.initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🔌 Lamello Widget API running on http://localhost:${PORT}`);
    console.log(`📊 Analytics dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`\nDemo embed code:`);
    console.log(`  <script src="http://localhost:${PORT}/widget.js?id=demo"></script>\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
