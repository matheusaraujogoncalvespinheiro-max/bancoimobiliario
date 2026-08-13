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

  CREATE TABLE IF NOT EXISTS special_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    emoji TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT NOT NULL,
    effect TEXT NOT NULL,
    maxUses INTEGER NOT NULL DEFAULT 1,
    ownerId INTEGER,
    usesUsed INTEGER DEFAULT 0,
    image TEXT,
    FOREIGN KEY(ownerId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS card_use_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId INTEGER,
    userId INTEGER,
    receiverId INTEGER,
    amount REAL,
    status TEXT DEFAULT 'pending',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cardId) REFERENCES special_cards(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Adicionar colunas novas caso o banco já exista sem elas
const safeAlter = (sql) => {
  try { db.exec(sql); } catch (e) { /* coluna já existe */ }
};
safeAlter("ALTER TABLE properties ADD COLUMN description TEXT");
safeAlter("ALTER TABLE properties ADD COLUMN numHouses INTEGER DEFAULT 0");
safeAlter("ALTER TABLE properties ADD COLUMN buyerId INTEGER");
safeAlter("ALTER TABLE properties ADD COLUMN soldPrice REAL");
safeAlter("ALTER TABLE properties ADD COLUMN soldAt DATETIME");
safeAlter("ALTER TABLE users ADD COLUMN isBankrupt BOOLEAN DEFAULT 0");
safeAlter("ALTER TABLE users ADD COLUMN jailedRounds INTEGER DEFAULT 0");
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

// Cartões especiais (1 unidade de cada; quem comprar primeiro fica com ele)
safeAlter('ALTER TABLE special_cards ADD COLUMN image TEXT');
if (!db.prepare('SELECT COUNT(*) as c FROM special_cards').get().c) {
  const insert = db.prepare(`
    INSERT INTO special_cards (name, emoji, price, description, effect, maxUses, image) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['CAVEIRA CARD', '💀', 1250000, 'Manda um jogador para a cadeia por 2 rodadas: enquanto preso, ele NÃO recebe pagamentos.', 'caveira', 1, 'caveira-card.png'],
    ['PATRIA EXPRESS', '🏛️', 450000, 'Use para pagar o imposto (Férias) por você: digita o valor e o Banco paga no seu lugar. Uso 3 vezes no jogo.', 'patria', 3, 'patria-express.png'],
    ['ADVENTURE CARD', '🚀', 1000000, 'Pague alguém sem descontar do seu saldo: o Banco paga a pessoa escolhida por você. Uso único no jogo.', 'adventure', 1, 'adventure-card.png'],
    ['BIQUINI EXPRESS', '🩱', 1000000, 'Passivo: você recebe +10% em todo dinheiro que o Banco do Governo pagar para você.', 'biquini', 0, 'biquini-express.png'],
    ['KING JAMES', '👑', 1250000, 'Passivo: você recebe +25% em TODOS os Pix que chegar para você (o Banco paga o extra).', 'king', 0, 'king-james.png'],
    ['SNOPY CARD', '🐶', 2250000, 'Sai do vermelho e fica limpo: zera o seu saldo uma vez no jogo (o Banco absorve a dívida).', 'snopy', 1, 'snopy.png'],
    ['TIGRINHO EXPRESS', '🎠', 1500000, 'Ganha o dobro quando recebe as parcelas da Férias (o seu recebimento é dobrado).', 'tigrinho', 0, 'tigrinho-express.png'],
    ['FUGA EXPRESS', '🏃', 350000, 'Liberte-se da cadeia: acabe a pena imediatamente. Uso único no jogo.', 'fugir', 1, 'fugue-express.png'],
    ['CASCUDO EXPRESS', '🐚', 750000, 'Use para pagar alguém: você paga 40% a menos e a pessoa recebe o valor integral. Uso 3 vezes no jogo.', 'cassudo', 3, 'cassudo-express.png'],
  ].forEach(c => insert.run(...c));
}
[
  ['patria-express.png', 'patria'],
  ['adventure-card.png', 'adventure'],
  ['biquini-express.png', 'biquini'],
  ['caveira-card.png', 'caveira'],
  ['king-james.png', 'king'],
  ['snopy.png', 'snopy'],
  ['tigrinho-express.png', 'tigrinho'],
  ['fugue-express.png', 'fugir'],
  ['cassudo-express.png', 'cassudo'],
].forEach(([img, eff]) => {
  db.prepare('UPDATE special_cards SET image = ? WHERE effect = ?').run(img, eff);
});

// TIGRINHO / FUGA / CASCUDO: cartões novos (insere se não existirem)
[
  ['TIGRINHO EXPRESS', '🎠', 1500000, 'Ganha o dobro quando recebe as parcelas da Férias (o seu recebimento é dobrado).', 'tigrinho', 0, 'tigrinho-express.png'],
  ['FUGA EXPRESS', '🏃', 350000, 'Liberte-se da cadeia: acabe a pena imediatamente. Uso único no jogo.', 'fugir', 1, 'fugue-express.png'],
  ['CASCUDO EXPRESS', '🐚', 750000, 'Use para pagar alguém: você paga 40% a menos e a pessoa recebe o valor integral. Uso 3 vezes no jogo.', 'cassudo', 3, 'cassudo-express.png'],
].forEach(([name, emoji, price, description, effect, maxUses, image]) => {
  const existing = db.prepare('SELECT id FROM special_cards WHERE effect = ?').get(effect);
  if (!existing) {
    db.prepare('INSERT INTO special_cards (name, emoji, price, description, effect, maxUses, image) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, emoji, price, description, effect, maxUses, image);
  } else {
    db.prepare('UPDATE special_cards SET name = ?, emoji = ?, price = ?, description = ?, maxUses = ?, image = ? WHERE effect = ?')
      .run(name, emoji, price, description, maxUses, image, effect);
  }
});

// CAVEIRA CARD agora custa 1.5M e prende alguém por 2 rodadas (aplica em bases já existentes)
db.prepare("UPDATE special_cards SET price = 1500000, description = 'Manda um jogador para a cadeia por 2 rodadas: enquanto preso, ele NÃO recebe pagamentos.' WHERE effect = 'caveira'").run();

// KING JAMES agora dá +25% em todo Pix recebido (aplica em bases já existentes)
db.prepare("UPDATE special_cards SET description = 'Passivo: você recebe +25% em TODOS os Pix que chegar para você (o Banco paga o extra).' WHERE effect = 'king'").run();

// PATRIA EXPRESS agora paga o imposto no lugar do jogador (Banco cobre) - aplica em bases já existentes
db.prepare("UPDATE special_cards SET description = 'Use para pagar o imposto (Férias) por você: digita o valor e o Banco paga no seu lugar. Uso 3 vezes no jogo.' WHERE effect = 'patria'").run();

// Todos os cartões ficaram 250 mil mais baratos (aplica em bases já existentes)
[
  ['caveira', 1250000],
  ['patria', 450000],
  ['adventure', 1000000],
  ['biquini', 1000000],
  ['king', 1250000],
  ['snopy', 2250000],
  ['cassudo', 750000],
].forEach(([eff, price]) => {
  db.prepare('UPDATE special_cards SET price = ? WHERE effect = ?').run(price, eff);
});

module.exports = db;
