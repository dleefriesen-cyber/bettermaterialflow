const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Use /tmp in production (Railway) or local dir in dev
const dbPath = process.env.NODE_ENV === 'production'
  ? '/tmp/analytics.db'
  : path.join(__dirname, 'analytics.db');

let db;
let SQL;

async function initDB() {
  SQL = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize tables
  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      dealer_id TEXT NOT NULL,
      connector_recommended TEXT,
      rating INTEGER NOT NULL,
      conversation TEXT,
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

  // Seed demo dealer if none exist
  const result = db.exec('SELECT COUNT(*) as count FROM dealers');
  const count = result[0]?.values[0][0] || 0;
  if (count === 0) {
    db.run(`INSERT INTO dealers (id, name, domain, api_key) VALUES ('demo', 'Demo Dealer', 'localhost', 'demo-key-12345')`);
  }

  persist();
  console.log('Database initialized at', dbPath);
}

// Save DB to disk after writes
function persist() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Helper: run a query and return all rows as objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a query and return first row
function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

// Helper: run a write query
function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

module.exports = {
  initDB,

  createSession(sessionId, dealerId, dealerDomain, userAgent) {
    run(`INSERT OR IGNORE INTO sessions (id, dealer_id, dealer_domain, user_agent) VALUES (?, ?, ?, ?)`,
      [sessionId, dealerId, dealerDomain, userAgent]);
  },

  logEvent(sessionId, dealerId, eventType, eventData) {
    run(`INSERT INTO events (session_id, dealer_id, event_type, event_data) VALUES (?, ?, ?, ?)`,
      [sessionId, dealerId, eventType, JSON.stringify(eventData)]);
  },

  completeSession(sessionId, connectorRecommended) {
    run(`UPDATE sessions SET completed = 1, connector_recommended = ? WHERE id = ?`,
      [connectorRecommended, sessionId]);
  },

  getDealerStats(dealerId) {
    const total = get('SELECT COUNT(*) as count FROM sessions WHERE dealer_id = ?', [dealerId])?.count || 0;
    const completed = get('SELECT COUNT(*) as count FROM sessions WHERE dealer_id = ? AND completed = 1', [dealerId])?.count || 0;
    const topConnectors = all(`SELECT connector_recommended, COUNT(*) as count FROM sessions WHERE dealer_id = ? AND connector_recommended IS NOT NULL GROUP BY connector_recommended ORDER BY count DESC LIMIT 5`, [dealerId]);
    const recentSessions = all(`SELECT * FROM sessions WHERE dealer_id = ? ORDER BY created_at DESC LIMIT 20`, [dealerId]);
    const daily = all(`SELECT DATE(created_at) as date, COUNT(*) as sessions FROM sessions WHERE dealer_id = ? GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`, [dealerId]);
    return { total, completed, topConnectors, recentSessions, daily };
  },

  getGlobalStats() {
    const byDealer = all(`SELECT d.name, s.dealer_id, COUNT(*) as sessions, SUM(s.completed) as completed FROM sessions s LEFT JOIN dealers d ON d.id = s.dealer_id GROUP BY s.dealer_id ORDER BY sessions DESC`);
    const topConnectors = all(`SELECT connector_recommended, COUNT(*) as count FROM sessions WHERE connector_recommended IS NOT NULL GROUP BY connector_recommended ORDER BY count DESC`);
    const totalSessions = get('SELECT COUNT(*) as count FROM sessions')?.count || 0;
    return { byDealer, topConnectors, totalSessions };
  },

  getDealerByKey(apiKey) {
    return get('SELECT * FROM dealers WHERE api_key = ?', [apiKey]);
  },

  getAllDealers() {
    return all('SELECT * FROM dealers');
  },

  saveFeedback(sessionId, dealerId, connectorRecommended, rating, conversation) {
    run(`INSERT INTO feedback (session_id, dealer_id, connector_recommended, rating, conversation) VALUES (?, ?, ?, ?, ?)`,
      [sessionId, dealerId, connectorRecommended, rating, JSON.stringify(conversation)]);
  },

  getFeedback(dealerId) {
    return all(`SELECT * FROM feedback WHERE dealer_id = ? ORDER BY created_at DESC LIMIT 100`, [dealerId]);
  },

  getFeedbackSummary(dealerId) {
    return all(`SELECT connector_recommended, SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as thumbs_up, SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as thumbs_down, COUNT(*) as total FROM feedback WHERE dealer_id = ? GROUP BY connector_recommended ORDER BY total DESC`, [dealerId]);
  }
};
