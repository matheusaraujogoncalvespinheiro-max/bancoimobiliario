const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'banco.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Configs globais do jogo
  db.run(`
    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      round INTEGER DEFAULT 0,
      isStarted BOOLEAN DEFAULT 0
    )
  `);

  db.get("SELECT * FROM game_state", (err, row) => {
    if (!row) {
      db.run("INSERT INTO game_state (id, round, isStarted) VALUES (1, 0, 0)");
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      balance REAL DEFAULT 0,
      isBankrupt BOOLEAN DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      senderId INTEGER,
      receiverId INTEGER,
      amount REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'completed',
      FOREIGN KEY(senderId) REFERENCES users(id),
      FOREIGN KEY(receiverId) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      amount REAL,
      totalToPay REAL,
      roundsLeft INTEGER,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);

  db.run(`
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
    )
  `);

  // Adicionar colunas novas caso o banco já exista sem elas
  const safeAlter = (sql) => db.run(sql, (err) => {});
  safeAlter("ALTER TABLE properties ADD COLUMN description TEXT");
  safeAlter("ALTER TABLE properties ADD COLUMN numHouses INTEGER DEFAULT 0");
  safeAlter("ALTER TABLE users ADD COLUMN isBankrupt BOOLEAN DEFAULT 0");
  safeAlter("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'completed'");
  safeAlter("ALTER TABLE game_state ADD COLUMN feriasTax REAL DEFAULT 50000");

  db.run(`
    CREATE TABLE IF NOT EXISTS property_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      propertyId INTEGER,
      bidderId INTEGER,
      amount REAL,
      FOREIGN KEY(propertyId) REFERENCES properties(id),
      FOREIGN KEY(bidderId) REFERENCES users(id)
    )
  `);

  // Default Users
  db.get("SELECT * FROM users WHERE role = 'admin'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, password, role) VALUES ('admin', '1234', 'admin')");
    }
  });

  db.get("SELECT * FROM users WHERE username = 'Banco'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, password, role, balance) VALUES ('Banco', 'sistema', 'system', 999999999)");
    }
  });

  db.get("SELECT * FROM users WHERE username = 'Férias'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username, password, role, balance) VALUES ('Férias', 'sistema', 'system', 0)");
    }
  });
});

module.exports = db;
