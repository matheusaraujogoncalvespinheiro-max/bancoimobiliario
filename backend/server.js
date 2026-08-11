const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- UTILS ---
const checkBankruptcy = (userId, balance) => {
  if (balance <= -1500000) {
    db.prepare('UPDATE users SET isBankrupt = 1 WHERE id = ?').run(userId);
    return true;
  }
  return false;
};

// --- ROTAS HTTP ---

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (!row) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (row.isBankrupt) return res.status(403).json({ error: 'Você faliu e está fora do jogo!' });
  res.json(row);
});

app.get('/api/game_state', (req, res) => {
  const state = db.prepare('SELECT * FROM game_state WHERE id = 1').get();
  const users = db.prepare("SELECT id, username, role, balance, isBankrupt FROM users WHERE role IN ('player', 'system')").all();
  res.json({ state: state || { round: 0, isStarted: 0 }, users: users || [] });
});

app.get('/api/history', (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.amount, t.timestamp, t.status, 
           s.username as sender, r.username as receiver
    FROM transactions t
    LEFT JOIN users s ON t.senderId = s.id
    LEFT JOIN users r ON t.receiverId = r.id
    ORDER BY t.timestamp DESC LIMIT 200
  `).all();
  res.json(rows || []);
});

app.get('/api/history/:userId', (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.amount, t.timestamp, t.status, 
           s.username as sender, r.username as receiver
    FROM transactions t
    LEFT JOIN users s ON t.senderId = s.id
    LEFT JOIN users r ON t.receiverId = r.id
    WHERE t.senderId = ? OR t.receiverId = ?
    ORDER BY t.timestamp DESC
  `).all(req.params.userId, req.params.userId);
  res.json(rows || []);
});

// Admin cria user
app.post('/api/users', (req, res) => {
  const { username, password, initialBalance } = req.body;
  try {
    db.prepare('INSERT INTO users (username, password, balance, role) VALUES (?, ?, ?, ?)')
      .run(username, password, initialBalance || 0, 'player');
    io.emit('game_updated');
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Erro ao criar usuário' });
  }
});

// Empréstimos ativos de um usuário
app.get('/api/loans/:userId', (req, res) => {
  const rows = db.prepare('SELECT * FROM loans WHERE userId = ?').all(req.params.userId);
  res.json(rows || []);
});

// Todos os empréstimos (admin)
app.get('/api/loans', (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, u.username 
    FROM loans l JOIN users u ON l.userId = u.id
  `).all();
  res.json(rows || []);
});

// Mercado - Jogadores veem só anuncios ativos; Admin vê tudo
app.get('/api/market', (req, res) => {
  const { role } = req.query;
  const statusFilter = role === 'admin'
    ? `WHERE p.status IN ('pending_admin', 'active', 'pending_bank')`
    : `WHERE p.status = 'active'`;
  const rows = db.prepare(`
    SELECT p.*, u.username as sellerName 
    FROM properties p JOIN users u ON p.sellerId = u.id 
    ${statusFilter}
    ORDER BY p.createdAt DESC
  `).all();
  res.json(rows || []);
});

// Mercado - próprios anúncios do jogador
app.get('/api/market/mine/:userId', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.username as sellerName 
    FROM properties p JOIN users u ON p.sellerId = u.id 
    WHERE p.sellerId = ? AND p.status NOT IN ('sold', 'canceled')
    ORDER BY p.createdAt DESC
  `).all(req.params.userId);
  res.json(rows || []);
});

// Servir o site (frontend buildado) quando estiver pronto pra produção
const distDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'frontend', 'dist');
const indexFile = path.join(distDir, 'index.html');
app.use(express.static(distDir));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  next();
});


// --- SOCKET.IO ---

io.on('connection', (socket) => {

  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
  });

  // Admin Iniciar Jogo
  socket.on('start_game', () => {
    db.prepare('UPDATE game_state SET isStarted = 1 WHERE id = 1').run();
    io.emit('game_updated');
  });

  // Admin Zerar o Jogo (novo jogo do zero)
  socket.on('reset_game', () => {
    db.prepare('DELETE FROM property_bids').run();
    db.prepare('DELETE FROM properties').run();
    db.prepare('DELETE FROM loans').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare("DELETE FROM users WHERE role = 'player'").run();
    db.prepare("UPDATE users SET balance = 999999999 WHERE username = 'Banco'").run();
    db.prepare("UPDATE users SET balance = 0 WHERE username = 'Férias'").run();
    db.prepare('UPDATE game_state SET round = 0, isStarted = 0 WHERE id = 1').run();
    io.emit('game_reset');
    io.emit('ferias_updated', { balance: 0 });
    io.emit('market_updated');
    io.emit('game_updated');
  });

  // Admin Avançar Rodada
  socket.on('next_round', () => {
    db.prepare('UPDATE game_state SET round = round + 1 WHERE id = 1').run();
    db.prepare('UPDATE loans SET roundsLeft = roundsLeft - 1').run();

    // Cobra empréstimos vencidos
    const loans = db.prepare('SELECT * FROM loans WHERE roundsLeft <= 0').all();
    loans.forEach(loan => {
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(loan.totalToPay, loan.userId);
      db.prepare('DELETE FROM loans WHERE id = ?').run(loan.id);
      const u = db.prepare('SELECT balance FROM users WHERE id = ?').get(loan.userId);
      if (u) {
        if (checkBankruptcy(loan.userId, u.balance)) {
          io.to(`user_${loan.userId}`).emit('bankrupt');
        }
        io.to(`user_${loan.userId}`).emit('debt_collected', {
          amount: loan.totalToPay, newBalance: u.balance
        });
      }
    });

    io.emit('game_updated');
  });

  // Pegar Empréstimo
  socket.on('take_loan', ({ userId, amount }) => {
    const user = db.prepare('SELECT balance, isBankrupt FROM users WHERE id = ?').get(userId);
    if (!user) return socket.emit('pix_error', 'Usuário não encontrado.');
    if (user.isBankrupt) return socket.emit('pix_error', 'Você faliu e não pode pegar empréstimos.');
    const maxLoan = Math.max(0, user.balance * 0.5);
    if (amount > maxLoan || amount <= 0) {
      socket.emit('pix_error', `Você só pode pedir até 50% do seu saldo. Máximo: M$ ${maxLoan.toLocaleString('pt-BR')}`);
      return;
    }
    if (amount % 1000 !== 0) {
      socket.emit('pix_error', 'Empréstimo deve ser múltiplo de 1.000');
      return;
    }
    const totalToPay = amount * 1.5;

    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
    db.prepare('INSERT INTO loans (userId, amount, totalToPay, roundsLeft) VALUES (?, ?, ?, 6)').run(userId, amount, totalToPay);
    const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
    io.emit('game_updated');
    socket.emit('loan_approved', { amount, totalToPay, newBalance: row?.balance });
  });

  // PIX
  socket.on('pix', ({ senderId, receiverId, amount }) => {
    if (amount % 1000 !== 0) {
      socket.emit('pix_error', 'Transferências devem ser múltiplos de 1.000!');
      return;
    }

    const sender = db.prepare('SELECT balance, role, username FROM users WHERE id = ?').get(senderId);
    if (!sender) return socket.emit('pix_error', 'Remetente não encontrado.');

    if (sender.role === 'player' && (sender.balance - amount) < -1500000) {
      socket.emit('pix_error', 'Limite de saldo negativo excedido (-1.500.000).');
      return;
    }

    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, senderId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, receiverId);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(senderId, receiverId, amount);

    // Buscar novos saldos e usernames para resposta
    const senderRow = db.prepare('SELECT balance, username FROM users WHERE id = ?').get(senderId);
    const receiverRow = db.prepare('SELECT balance, username FROM users WHERE id = ?').get(receiverId);
    io.emit('game_updated');

    if (sender.role === 'player') {
      if (checkBankruptcy(senderId, senderRow.balance)) {
        io.to(`user_${senderId}`).emit('bankrupt');
      }
    }

    // Notifica remetente com novo saldo
    socket.emit('pix_success', {
      amount,
      newBalance: senderRow.balance,
      to: receiverRow?.username
    });

    // Notifica destinatário com novo saldo
    io.to(`user_${receiverId}`).emit('pix_received', {
      from: senderRow.username,
      amount,
      newBalance: receiverRow?.balance
    });
  });

  // Estorno (Admin)
  socket.on('refund_transaction', (transactionId) => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND status = \'completed\'').get(transactionId);
    if (!tx) return;
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(tx.amount, tx.senderId);
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(tx.amount, tx.receiverId);
    db.prepare('UPDATE transactions SET status = \'refunded\' WHERE id = ?').run(transactionId);

    const sRow = db.prepare('SELECT username, balance FROM users WHERE id = ?').get(tx.senderId);
    const rRow = db.prepare('SELECT username, balance FROM users WHERE id = ?').get(tx.receiverId);
    io.emit('game_updated');

    // Devolve o dinheiro pra quem tinha enviado (o jogador)
    io.to(`user_${tx.senderId}`).emit('pix_received', {
      from: `Estorno (${rRow?.username || 'Banco'})`,
      amount: tx.amount,
      newBalance: sRow?.balance
    });
  });

  // Mercado - Jogador cria anuncio (fica pending_admin)
  socket.on('sell_property', ({ sellerId, askingPrice, description, numHouses }) => {
    const bankOffer = askingPrice * 0.5;
    db.prepare(
      'INSERT INTO properties (sellerId, askingPrice, bankOffer, description, numHouses, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sellerId, askingPrice, bankOffer, description || '', numHouses || 0, 'pending_admin');
    io.emit('market_updated');
  });

  // Admin aprova a PUBLICAÇÃO do anúncio
  socket.on('approve_listing', (propertyId) => {
    db.prepare('UPDATE properties SET status = \'active\' WHERE id = ? AND status = \'pending_admin\'').run(propertyId);
    io.emit('market_updated');
  });

  // Admin ou dono cancela anúncio
  socket.on('cancel_listing', (propertyId) => {
    db.prepare('UPDATE properties SET status = \'canceled\' WHERE id = ?').run(propertyId);
    io.emit('market_updated');
  });

  // Compra entre jogadores: um jogador compra imóvel de outro
  socket.on('buy_property', ({ buyerId, propertyId }) => {
    const prop = db.prepare('SELECT * FROM properties WHERE id = ? AND status = \'active\'').get(propertyId);
    if (!prop) return socket.emit('pix_error', 'Imóvel não disponível.');

    const buyer = db.prepare('SELECT balance, username FROM users WHERE id = ?').get(buyerId);
    if (!buyer) return;
    if (buyer.balance < prop.askingPrice) {
      return socket.emit('pix_error', 'Saldo insuficiente para comprar este imóvel.');
    }

    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(prop.askingPrice, buyerId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(prop.askingPrice, prop.sellerId);
    db.prepare('UPDATE properties SET status = \'sold\' WHERE id = ?').run(propertyId);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(buyerId, prop.sellerId, prop.askingPrice);

    const bRow = db.prepare('SELECT balance FROM users WHERE id = ?').get(buyerId);
    const sRow = db.prepare('SELECT balance FROM users WHERE id = ?').get(prop.sellerId);
    io.emit('game_updated');
    io.emit('market_updated');

    socket.emit('pix_success', {
      amount: prop.askingPrice,
      newBalance: bRow?.balance,
      to: 'Compra de Imóvel'
    });

    io.to(`user_${prop.sellerId}`).emit('property_sold', {
      property: prop.description,
      amount: prop.askingPrice,
      newBalance: sRow?.balance
    });

    io.to(`user_${prop.sellerId}`).emit('pix_received', {
      from: `${buyer.username} (compra de imóvel)`,
      amount: prop.askingPrice,
      newBalance: sRow?.balance
    });
  });

  // Admin aprova COMPRA do banco
  socket.on('approve_bank_purchase', (propertyId) => {
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!prop) return;
    const banco = db.prepare("SELECT id FROM users WHERE username = 'Banco'").get();
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(prop.bankOffer, prop.sellerId);
    db.prepare('UPDATE properties SET status = \'sold\' WHERE id = ?').run(propertyId);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(banco.id, prop.sellerId, prop.bankOffer);
    const sRow = db.prepare('SELECT balance FROM users WHERE id = ?').get(prop.sellerId);
    io.emit('market_updated');
    io.emit('game_updated');
    io.to(`user_${prop.sellerId}`).emit('property_sold', {
      property: prop.description,
      amount: prop.bankOffer,
      newBalance: sRow?.balance
    });
    io.to(`user_${prop.sellerId}`).emit('pix_received', {
      from: 'Banco (compra de imóvel)',
      amount: prop.bankOffer,
      newBalance: sRow?.balance
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log('Servidor rodando na porta ' + PORT); });