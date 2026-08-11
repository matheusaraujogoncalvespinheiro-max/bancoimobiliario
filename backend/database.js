const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'banco.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    round INTEGER DEFAULT 0,
    isStarted BOOLEAN DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    balance REAL DEFAULT 0,
    isBankrupt BOOLEAN DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    senderId INTEGER,
    receiverId INTEGER,
    amount REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed',
    FOREIGN KEY(senderId) REFERENCES users(id),
    FOREIGN KEY(receiverId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    amount REAL,
    totalToPay REAL,
    roundsLeft INTEGER,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sellerId INTEGER,
    description TEXT,
    numHouses INTEGER DEFAULT 0,
    askingPrice REAL,
    bankOffer REAL,
    status TEXT DEFAULT 'pending_admin',
    -- status: pending_admin = aguardando admin publicar, active = visível a todos, pending_bank = aguardando admin aprovar venda ao banco, sold, canceled
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sellerId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS property_bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propertyId INTEGER,
    bidderId INTEGER,
    amount REAL,
    FOREIGN KEY(propertyId) REFERENCES properties(id),
    FOREIGN KEY(bidderId) REFERENCES users(id)
  );
`);

// Adicionar colunas novas caso o banco já exista sem elas
const safeAlter = (sql) => {
  try { db.exec(sql); } catch (e) { /* coluna já existe */ }
};
safeAlter("ALTER TABLE properties ADD COLUMN description TEXT");
safeAlter("ALTER TABLE properties ADD COLUMN numHouses INTEGER DEFAULT 0");
safeAlter("ALTER TABLE users ADD COLUMN isBankrupt BOOLEAN DEFAULT 0");
safeAlter("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'completed'");
safeAlter("ALTER TABLE game_state ADD COLUMN feriasTax REAL DEFAULT 50000");

// Configs globais do jogo (linha padrão)
const gs = db.prepare('SELECT * FROM game_state').get();
if (!gs) {
  db.prepare('INSERT INTO game_state (id, round, isStarted) VALUES (1, 0, 0)').run();
}

// Default Users
if (!db.prepare("SELECT * FROM users WHERE role = 'admin'").get()) {
  db.prepare("INSERT INTO users (username, password, role) VALUES ('admin', '1234', 'admin')").run();
}

if (!db.prepare("SELECT * FROM users WHERE username = 'Banco'").get()) {
  db.prepare("INSERT INTO users (username, password, role, balance) VALUES ('Banco', 'sistema', 'system', 999999999)").run();
}

if (!db.prepare("SELECT * FROM users WHERE username = 'Férias'").get()) {
  db.prepare("INSERT INTO users (username, password, role, balance) VALUES ('Férias', 'sistema', 'system', 0)").run();
}

module.exports = db;
