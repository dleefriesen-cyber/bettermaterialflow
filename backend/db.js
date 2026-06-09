const Database = require('better-sqlite3');
const path = require('path');

// Use /tmp in production (Railway containers) or local __dirname in dev
const dbPath = process.env.NODE_ENV === 'production'
  ? '/tmp/analytics.db'
  : path.join(__dirname, 'analytics.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    dealer_id TEXT NOT NULL,
    connector_recommended TEXT,
    rating INTEGER NOT NULL, -- 1 = thumbs up, -1 = thumbs down
    conversation TEXT,       -- full JSON of the conversation
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    dealer_id TEXT NOT NULL,
    dealer_domain TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed INTEGER DEFAULT 0,
    connector_recommended TEXT,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    dealer_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dealers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    api_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed a demo dealer if none exist
const existingDealers = db.prepare('SELECT COUNT(*) as count FROM dealers').get();
if (existingDealers.count === 0) {
  db.prepare(`
    INSERT INTO dealers (id, name, domain, api_key)
    VALUES ('demo', 'Demo Dealer', 'localhost', 'demo-key-12345')
  `).run();
}

module.exports = {
  // Track a new session start
  createSession(sessionId, dealerId, dealerDomain, userAgent) {
    return db.prepare(`
      INSERT OR IGNORE INTO sessions (id, dealer_id, dealer_domain, user_agent)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, dealerId, dealerDomain, userAgent);
  },

  // Log an event (message sent, connector recommended, etc.)
  logEvent(sessionId, dealerId, eventType, eventData) {
    return db.prepare(`
      INSERT INTO events (session_id, dealer_id, event_type, event_data)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, dealerId, eventType, JSON.stringify(eventData));
  },

  // Mark session complete with recommendation
  completeSession(sessionId, connectorRecommended) {
    return db.prepare(`
      UPDATE sessions SET completed = 1, connector_recommended = ?
      WHERE id = ?
    `).run(connectorRecommended, sessionId);
  },

  // Analytics: summary for a dealer
  getDealerStats(dealerId) {
    const total = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE dealer_id = ?').get(dealerId);
    const completed = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE dealer_id = ? AND completed = 1').get(dealerId);
    const topConnectors = db.prepare(`
      SELECT connector_recommended, COUNT(*) as count
      FROM sessions
      WHERE dealer_id = ? AND connector_recommended IS NOT NULL
      GROUP BY connector_recommended
      ORDER BY count DESC
      LIMIT 5
    `).all(dealerId);
    const recentSessions = db.prepare(`
      SELECT * FROM sessions WHERE dealer_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).all(dealerId);
    const daily = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as sessions
      FROM sessions WHERE dealer_id = ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC LIMIT 30
    `).all(dealerId);

    return { total: total.count, completed: completed.count, topConnectors, recentSessions, daily };
  },

  // Analytics: global summary (for Lamello HQ view)
  getGlobalStats() {
    const byDealer = db.prepare(`
      SELECT d.name, s.dealer_id, COUNT(*) as sessions,
             SUM(s.completed) as completed
      FROM sessions s
      LEFT JOIN dealers d ON d.id = s.dealer_id
      GROUP BY s.dealer_id
      ORDER BY sessions DESC
    `).all();
    const topConnectors = db.prepare(`
      SELECT connector_recommended, COUNT(*) as count
      FROM sessions WHERE connector_recommended IS NOT NULL
      GROUP BY connector_recommended
      ORDER BY count DESC
    `).all();
    const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
    return { byDealer, topConnectors, totalSessions: totalSessions.count };
  },

  // Validate dealer API key
  getDealerByKey(apiKey) {
    return db.prepare('SELECT * FROM dealers WHERE api_key = ?').get(apiKey);
  },

  getAllDealers() {
    return db.prepare('SELECT * FROM dealers').all();
  },

  // Save user feedback (👍/👎) with full conversation
  saveFeedback(sessionId, dealerId, connectorRecommended, rating, conversation) {
    return db.prepare(`
      INSERT INTO feedback (session_id, dealer_id, connector_recommended, rating, conversation)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, dealerId, connectorRecommended, rating, JSON.stringify(conversation));
  },

  // Get all feedback for a dealer, newest first
  getFeedback(dealerId) {
    return db.prepare(`
      SELECT * FROM feedback WHERE dealer_id = ?
      ORDER BY created_at DESC LIMIT 100
    `).all(dealerId);
  },

  // Feedback summary: thumbs up/down counts per connector
  getFeedbackSummary(dealerId) {
    return db.prepare(`
      SELECT
        connector_recommended,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as thumbs_up,
        SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as thumbs_down,
        COUNT(*) as total
      FROM feedback
      WHERE dealer_id = ?
      GROUP BY connector_recommended
      ORDER BY total DESC
    `).all(dealerId);
  }
};
