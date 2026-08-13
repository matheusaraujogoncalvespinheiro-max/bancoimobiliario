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

// --- PRESENÇA ONLINE ---
const onlineUsers = new Map(); // socket.id -> userId

const broadcastOnlineUsers = () => {
  io.emit('online_users', Array.from(new Set(onlineUsers.values())));
};

// --- UTILS ---
const checkBankruptcy = (userId, balance) => {
  if (balance <= -1500000) {
    db.prepare('UPDATE users SET isBankrupt = 1 WHERE id = ?').run(userId);
    return true;
  }
  return false;
};

const isJailed = (userId) => {
  const u = db.prepare('SELECT jailedRounds FROM users WHERE id = ?').get(userId);
  return u ? Number(u.jailedRounds) > 0 : false;
};

// Aplica o efeito de um cartão especial (retorna mensagem de erro ou null se ok)
const applyCardEffect = (user, card, receiverId, amount) => {
  const banco = db.prepare("SELECT id FROM users WHERE username = 'Banco'").get();
  const ferias = db.prepare("SELECT id FROM users WHERE username = 'Férias'").get();

  if (card.effect === 'patria') {
    const tx = db.prepare('SELECT * FROM transactions WHERE senderId = ? AND receiverId = ? AND status = \'completed\' ORDER BY id DESC LIMIT 1')
      .get(user.id, ferias.id);
    if (tx) {
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(tx.amount, user.id);
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(tx.amount, ferias.id);
      db.prepare('UPDATE transactions SET status = \'refunded\' WHERE id = ?').run(tx.id);
      const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
      io.to(`user_${user.id}`).emit('pix_received', { from: 'PATRIA EXPRESS (isenção de imposto)', amount: tx.amount, newBalance: row?.balance });
    }
    return null;
  }

  if (card.effect === 'snopy') {
    if (user.balance >= 0) return 'A pessoa já está com saldo positivo.';
    const owed = -user.balance;
    db.prepare('UPDATE users SET balance = 0 WHERE id = ?').run(user.id);
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(owed, banco.id);
    const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
    io.to(`user_${user.id}`).emit('pix_received', { from: 'SNOPY CARD (saí do vermelho)', amount: owed, newBalance: row?.balance });
    return null;
  }

  if (card.effect === 'adventure') {
    if (!receiverId || !amount || amount <= 0) return 'Dados do pagamento inválidos.';
    const receiver = db.prepare('SELECT id, role, isBankrupt, username FROM users WHERE id = ?').get(receiverId);
    if (!receiver || receiver.role !== 'player' || Number(receiver.id) === Number(user.id)) return 'Destinatário inválido.';
    if (receiver.isBankrupt) return 'Esse jogador já faliu e está fora do jogo.';
    if (isJailed(receiver.id)) return `O jogador ${receiver.username} está preso na cadeia e não pode receber pagamentos.`;
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, banco.id);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, receiver.id);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(banco.id, receiver.id, amount);
    const rRow = db.prepare('SELECT balance FROM users WHERE id = ?').get(receiver.id);
    io.to(`user_${receiver.id}`).emit('pix_received', { from: `ADVENTURE CARD (${user.username})`, amount, newBalance: rRow?.balance });
    return null;
  }

  if (card.effect === 'caveira') {
    if (!receiverId) return 'Escolha quem vai para a cadeia.';
    const receiver = db.prepare('SELECT id, role, isBankrupt, jailedRounds FROM users WHERE id = ?').get(receiverId);
    if (!receiver || receiver.role !== 'player' || Number(receiver.id) === Number(user.id)) return 'Destinatário inválido.';
    if (receiver.isBankrupt) return 'Esse jogador já faliu e está fora do jogo.';
    if (Number(receiver.jailedRounds) > 0) return 'Esse jogador já está preso na cadeia.';
    db.prepare('UPDATE users SET jailedRounds = 2 WHERE id = ?').run(receiver.id);
    io.to(`user_${receiver.id}`).emit('jail_sent', { rounds: 2, by: user.username });
    return null;
  }

  if (card.effect === 'fugir') {
    const jailed = db.prepare('SELECT jailedRounds FROM users WHERE id = ?').get(user.id);
    if (!jailed || Number(jailed.jailedRounds) <= 0) return 'Você não está preso na cadeia.';
    db.prepare('UPDATE users SET jailedRounds = 0 WHERE id = ?').run(user.id);
    io.to(`user_${user.id}`).emit('jail_released');
    return null;
  }

  if (card.effect === 'cassudo') {
    if (!receiverId || !amount || amount <= 0) return 'Escolha a pessoa e o valor a pagar.';
    if (amount % 1000 !== 0) return 'O valor deve ser múltiplo de 1.000.';
    const receiver = db.prepare('SELECT id, role, isBankrupt, username FROM users WHERE id = ?').get(receiverId);
    if (!receiver || receiver.role !== 'player' || Number(receiver.id) === Number(user.id)) return 'Destinatário inválido.';
    if (receiver.isBankrupt) return 'Esse jogador já faliu e está fora do jogo.';
    if (isJailed(receiver.id)) return `O jogador ${receiver.username} está preso na cadeia e não pode receber pagamentos.`;
    const discount = Math.floor((amount * 0.4) / 1000) * 1000;
    const payerPays = amount - discount;
    if (user.balance < payerPays) {
      return `Saldo insuficiente. Você precisa de M$ ${payerPays.toLocaleString('pt-BR')} (40% a menos de M$ ${amount.toLocaleString('pt-BR')}).`;
    }
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(payerPays, user.id);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, receiver.id);
    if (discount > 0 && banco) db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(discount, banco.id);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(user.id, receiver.id, amount);
    const rRow = db.prepare('SELECT balance FROM users WHERE id = ?').get(receiver.id);
    const sRow = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
    io.to(`user_${receiver.id}`).emit('pix_received', { from: `CASCUDO EXPRESS (${user.username})`, amount, newBalance: rRow?.balance });
    io.to(`user_${user.id}`).emit('pix_success', { amount: payerPays, newBalance: sRow?.balance, to: receiver.username });
    return null;
  }

  return 'Este cartão é passivo e não precisa ser usado.';
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
  const users = db.prepare("SELECT id, username, role, balance, isBankrupt, jailedRounds FROM users WHERE role IN ('player', 'system')").all();
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

// Histórico de vendas de imóveis
app.get('/api/market/history', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.description, p.numHouses, p.askingPrice, p.bankOffer, p.soldPrice, p.soldAt,
           u.username as sellerName, b.username as buyerName
    FROM properties p 
    JOIN users u ON p.sellerId = u.id 
    LEFT JOIN users b ON p.buyerId = b.id
    WHERE p.status = 'sold' AND p.soldAt IS NOT NULL
    ORDER BY p.soldAt DESC
  `).all();
  res.json(rows || []);
});

// Cartões especiais disponíveis (com dono)
app.get('/api/special_cards', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username as ownerName
    FROM special_cards c
    LEFT JOIN users u ON c.ownerId = u.id
    ORDER BY c.price ASC
  `).all();
  res.json(rows || []);
});

// Pedidos de uso de cartão (admin: sem filtro; jogador: ?userId=só os dele)
app.get('/api/card_use_requests', (req, res) => {
  const userId = req.query.userId;
  const where = userId
    ? `WHERE r.status = 'pending' AND r.userId = ?`
    : `WHERE r.status = 'pending'`;
  const params = userId ? [userId] : [];
  const rows = db.prepare(`
    SELECT r.id, r.cardId, r.userId, r.receiverId, r.amount, r.status, r.createdAt,
           c.name as cardName, c.emoji, c.image,
           u.username as username, rcv.username as receiverName
    FROM card_use_requests r
    JOIN special_cards c ON r.cardId = c.id
    JOIN users u ON r.userId = u.id
    LEFT JOIN users rcv ON r.receiverId = rcv.id
    ${where}
    ORDER BY r.createdAt DESC
  `).all(...params);
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
    userId = String(userId);
    socket.data.userId = userId;
    onlineUsers.set(socket.id, userId);
    socket.join(`user_${userId}`);
    broadcastOnlineUsers();
  });

  socket.on('disconnect', () => {
    if (socket.data.userId) {
      onlineUsers.delete(socket.id);
      broadcastOnlineUsers();
    }
  });

  // Logout: sai da lista de online sem desconectar o socket
  socket.on('leave', () => {
    if (socket.data.userId) {
      socket.leave(`user_${socket.data.userId}`);
      onlineUsers.delete(socket.id);
      delete socket.data.userId;
      broadcastOnlineUsers();
    }
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
    db.prepare('DELETE FROM card_use_requests').run();
    db.prepare('UPDATE special_cards SET ownerId = NULL, usesUsed = 0').run();
    db.prepare('UPDATE users SET jailedRounds = 0').run();
    db.prepare("DELETE FROM users WHERE role = 'player'").run();
    db.prepare("UPDATE users SET balance = 999999999 WHERE username = 'Banco'").run();
    db.prepare("UPDATE users SET balance = 0 WHERE username = 'Férias'").run();
    db.prepare('UPDATE game_state SET round = 0, isStarted = 0 WHERE id = 1').run();
    io.emit('game_reset');
    io.emit('ferias_updated', { balance: 0 });
    io.emit('market_updated');
    io.emit('game_updated');
  });

  // Admin remover um jogador (conta + tudo ligado a ele)
  socket.on('remove_player', (userId) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(userId);
    if (!user) return socket.emit('pix_error', 'Jogador não encontrado.');

    // Cartões do jogador voltam ao mercado
    db.prepare('UPDATE special_cards SET ownerId = NULL, usesUsed = 0 WHERE ownerId = ?').run(userId);
    // Anúncios não vendidos do jogador são excluídos (junto com os lances deles)
    const listings = db.prepare("SELECT id FROM properties WHERE sellerId = ? AND status != 'sold'").all(userId);
    listings.forEach(p => db.prepare('DELETE FROM property_bids WHERE propertyId = ?').run(p.id));
    db.prepare("DELETE FROM properties WHERE sellerId = ? AND status != 'sold'").run(userId);
    // Lances do jogador nos anúncios dos outros
    db.prepare('DELETE FROM property_bids WHERE bidderId = ?').run(userId);
    // Empréstimos e pedidos de uso de cartão
    db.prepare('DELETE FROM loans WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM card_use_requests WHERE userId = ? OR receiverId = ?').run(userId, userId);

    // Expulsa da partida se estiver online
    let wasOnline = false;
    for (const s of io.sockets.sockets.values()) {
      if (s.data.userId === String(userId)) {
        wasOnline = true;
        s.emit('account_removed', { username: user.username });
        s.leave(`user_${userId}`);
        onlineUsers.delete(s.id);
        delete s.data.userId;
      }
    }
    if (wasOnline) broadcastOnlineUsers();

    // Remove a conta
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    io.emit('game_updated');
    io.emit('market_updated');
    io.emit('cards_updated');
    io.emit('card_requests_updated');
  });

  // Admin soltar um preso (encerrar a pena antes do tempo)
  socket.on('release_jail', (userId) => {
    const user = db.prepare("SELECT username, jailedRounds FROM users WHERE id = ? AND role = 'player'").get(userId);
    if (!user) return socket.emit('pix_error', 'Jogador não encontrado.');
    if (Number(user.jailedRounds) <= 0) return socket.emit('pix_error', `${user.username} não está preso.`);
    db.prepare('UPDATE users SET jailedRounds = 0 WHERE id = ?').run(userId);
    io.to(`user_${userId}`).emit('jail_released');
    io.emit('game_updated');
  });

  // Admin Avançar Rodada
  socket.on('next_round', () => {
    db.prepare('UPDATE game_state SET round = round + 1 WHERE id = 1').run();
    db.prepare('UPDATE loans SET roundsLeft = roundsLeft - 1').run();

    // Cadeia: quem estava com 1 rodada restam liberta agora
    const released = db.prepare("SELECT id FROM users WHERE jailedRounds = 1").all();
    released.forEach(p => io.to(`user_${p.id}`).emit('jail_released'));
    db.prepare("UPDATE users SET jailedRounds = MAX(COALESCE(jailedRounds,0) - 1, 0) WHERE role = 'player'").run();

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

    const sender = db.prepare('SELECT balance, role, username, isBankrupt FROM users WHERE id = ?').get(senderId);
    if (!sender) return socket.emit('pix_error', 'Remetente não encontrado.');

    if (sender.isBankrupt) {
      socket.emit('pix_error', 'Você faliu e está fora do jogo. Não pode enviar nem receber dinheiro.');
      return;
    }

    const receiver = db.prepare('SELECT username, role, balance, isBankrupt FROM users WHERE id = ?').get(receiverId);
    if (!receiver) return socket.emit('pix_error', 'Destinatário não encontrado.');
    if (receiver.isBankrupt) {
      socket.emit('pix_error', `${receiver.username} faliu e está fora do jogo. Não é possível enviar dinheiro para ele.`);
      return;
    }
    if (receiver.role === 'player' && isJailed(receiverId)) {
      socket.emit('pix_error', `${receiver.username} está preso na cadeia e não pode receber pagamentos.`);
      return;
    }

    // Regra saldo zerado: só pode pagar outros jogadores e impostos (Férias)
    if (sender.role === 'player' && sender.balance <= 0) {
      const canPay = receiver.role === 'player' || receiver.username === 'Férias';
      if (!canPay) {
        socket.emit('pix_error', 'Seu saldo está zerado. Você só pode pagar outros jogadores e impostos (Férias).');
        return;
      }
    }

    if (sender.role === 'player' && (sender.balance - amount) < -1500000) {
      socket.emit('pix_error', 'Limite de saldo negativo excedido (-1.500.000).');
      return;
    }

    const banco = db.prepare("SELECT id FROM users WHERE username = 'Banco'").get();

    let effectiveAmount = amount;
    // BIQUINI EXPRESS: +10% no que o jogador recebe do Banco do Governo
    // (bônus arredondado PARA CIMA até o múltiplo de 1.000, pois só aceita Pix múltiplos de 1.000)
    if (sender.role === 'system' && sender.username === 'Banco' && receiver.role === 'player') {
      const biquini = db.prepare("SELECT id FROM special_cards WHERE effect = 'biquini' AND ownerId = ?").get(receiverId);
      if (biquini) {
        const bonus = Math.ceil((amount * 0.1) / 1000) * 1000;
        effectiveAmount = amount + bonus;
      }
    }

// KING JAMES: +25% em TODO pix que o dono do cartão receber (o extra é pago pelo Banco)
    let kingBonus = 0;
if (receiver.role === 'player' && receiver.balance < 1000000) {
      const king = db.prepare("SELECT id FROM special_cards WHERE effect = ? AND ownerId = ?").get('king', receiverId);
      if (king) {
        kingBonus = Math.ceil((effectiveAmount * 0.25) / 1000) * 1000;
        if (banco) db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(kingBonus, banco.id);
      }
    }
    // CASCUDO EXPRESS agora é cartão ativo (uso via Admin). O desconto de 40% é aplicado em applyCardEffect.
    let paidToReceiver = effectiveAmount + kingBonus;

// TIGRINHO EXPRESS: dobro ao receber Férias (apenas para jogadores)
    if (receiver.role === 'player') {
      const tigrinho = db.prepare("SELECT id FROM special_cards WHERE effect = ? AND ownerId = ?").get('tigrinho', receiverId);
      if (tigrinho && sender && sender.username === 'Férias') {
        paidToReceiver *= 2;
      }
    }

db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(effectiveAmount, senderId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(paidToReceiver, receiverId);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(senderId, receiverId, paidToReceiver);

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
      amount: paidToReceiver,
      newBalance: receiverRow?.balance
    });
  });

  // Estorno (Admin)
  socket.on('refund_transaction', (transactionId) => {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ? AND status = \'completed\'').get(transactionId);
    if (!tx) return;
    const refundRecipient = db.prepare('SELECT isBankrupt FROM users WHERE id = ?').get(tx.senderId);
    if (refundRecipient && refundRecipient.isBankrupt) {
      io.to(`user_${tx.senderId}`).emit('pix_error', 'Jogador faliu e está fora do jogo. Estorno não permitido.');
      return;
    }
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

  // Comprar cartão especial (1 unidade por cartão, sem revenda)
  socket.on('buy_special_card', ({ userId, cardId }) => {
    const user = db.prepare('SELECT balance, isBankrupt FROM users WHERE id = ?').get(userId);
    if (!user) return socket.emit('pix_error', 'Usuário não encontrado.');
    if (user.isBankrupt) return socket.emit('pix_error', 'Você faliu e está fora do jogo.');
    if (user.balance <= 0) {
      return socket.emit('pix_error', 'Seu saldo está zerado. Você não pode comprar cartões.');
    }
    const card = db.prepare('SELECT * FROM special_cards WHERE id = ?').get(cardId);
    if (!card) return socket.emit('pix_error', 'Cartão não encontrado.');
    if (card.ownerId) {
      const owner = db.prepare('SELECT username FROM users WHERE id = ?').get(card.ownerId);
      return socket.emit('pix_error', `Este cartão já foi comprado por ${owner?.username || 'outro jogador'}. Só existe 1 unidade e não há revenda.`);
    }
    if (user.balance < card.price) {
      socket.emit('pix_error', `Saldo insuficiente. O cartão ${card.name} custa M$ ${card.price.toLocaleString('pt-BR')}.`);
      return;
    }

    const banco = db.prepare("SELECT id FROM users WHERE username = 'Banco'").get();
    db.prepare('UPDATE special_cards SET ownerId = ? WHERE id = ?').run(userId, card.id);
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(card.price, userId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(card.price, banco.id);
    db.prepare('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)').run(userId, banco.id, card.price);

    const row = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
    io.emit('game_updated');
    io.emit('cards_updated');
    socket.emit('pix_success', { amount: card.price, newBalance: row?.balance, to: `Cartão ${card.name}` });
  });

  // Jogador solicita usar um cartão (aguarda autorização do Admin)
  socket.on('request_card_use', ({ userId, cardId, receiverId, amount }) => {
    const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId);
    const card = db.prepare('SELECT * FROM special_cards WHERE id = ?').get(cardId);
    if (!user || !card) return socket.emit('pix_error', 'Cartão ou usuário não encontrado.');
    if (card.ownerId !== user.id) return socket.emit('pix_error', 'Você não possui este cartão.');
    if (card.maxUses > 0 && card.usesUsed >= card.maxUses) {
      return socket.emit('pix_error', 'Este cartão não tem mais usos disponíveis.');
    }
    const already = db.prepare('SELECT * FROM card_use_requests WHERE cardId = ? AND userId = ? AND status = \'pending\'')
      .get(card.id, user.id);
    if (already) return socket.emit('pix_error', 'Já existe um pedido em aprovação para este cartão.');

    if (card.effect === 'adventure') {
      if (!receiverId || !amount || amount <= 0) return socket.emit('pix_error', 'Escolha a pessoa e o valor a pagar.');
      if (amount % 1000 !== 0) return socket.emit('pix_error', 'O valor deve ser múltiplo de 1.000.');
      const receiver = db.prepare('SELECT id, role, isBankrupt FROM users WHERE id = ?').get(receiverId);
      if (!receiver || receiver.role !== 'player' || Number(receiver.id) === Number(user.id)) {
        return socket.emit('pix_error', 'Destinatário inválido. Escolha outro jogador.');
      }
      if (receiver.isBankrupt) return socket.emit('pix_error', 'Esse jogador faliu e está fora do jogo.');
    }
    if (card.effect === 'cassudo') {
      if (!receiverId || !amount || amount <= 0) return socket.emit('pix_error', 'Escolha a pessoa e o valor a pagar.');
      if (amount % 1000 !== 0) return socket.emit('pix_error', 'O valor deve ser múltiplo de 1.000.');
      const receiver = db.prepare('SELECT id, role, isBankrupt FROM users WHERE id = ?').get(receiverId);
      if (!receiver || receiver.role !== 'player' || Number(receiver.id) === Number(user.id)) {
        return socket.emit('pix_error', 'Destinatário inválido. Escolha outro jogador.');
      }
      if (receiver.isBankrupt) return socket.emit('pix_error', 'Esse jogador faliu e está fora do jogo.');
    }
    if (card.effect === 'snopy' && user.balance >= 0) {
      return socket.emit('pix_error', 'Seu saldo já está positivo. Use o cartão quando estiver no vermelho.');
    }
    if (card.effect === 'caveira') {
      if (!receiverId) return socket.emit('pix_error', 'Escolha quem vai para a cadeia.');
      const receiver = db.prepare('SELECT id, role, isBankrupt, jailedRounds FROM users WHERE id = ?').get(receiverId);
      if (!receiver || receiver.role !== 'player' || Number(receiver.id) === Number(user.id)) {
        return socket.emit('pix_error', 'Destinatário inválido. Escolha outro jogador.');
      }
      if (receiver.isBankrupt) return socket.emit('pix_error', 'Esse jogador faliu e está fora do jogo.');
      if (Number(receiver.jailedRounds) > 0) return socket.emit('pix_error', 'Esse jogador já está preso na cadeia.');
    }

    db.prepare('INSERT INTO card_use_requests (cardId, userId, receiverId, amount) VALUES (?, ?, ?, ?)')
      .run(card.id, user.id, receiverId || null, amount || null);
    io.emit('card_requests_updated');
    io.emit('cards_updated');
    socket.emit('card_request_sent', { cardName: card.name });
  });

  // Admin autoriza ou nega o uso do cartão
  socket.on('approve_card_use', ({ requestId, approved }) => {
    const req = db.prepare('SELECT * FROM card_use_requests WHERE id = ? AND status = \'pending\'').get(requestId);
    if (!req) return;
    const card = db.prepare('SELECT * FROM special_cards WHERE id = ?').get(req.cardId);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!card || !user) return;

    if (approved) {
      const err = applyCardEffect(user, card, req.receiverId, req.amount);
      if (err) {
        db.prepare('UPDATE card_use_requests SET status = \'denied\' WHERE id = ?').run(requestId);
        io.to(`user_${req.userId}`).emit('pix_error', `Uso do cartão ${card.name} negado: ${err}`);
        io.emit('card_requests_updated');
        return;
      }
      db.prepare('UPDATE card_use_requests SET status = \'approved\' WHERE id = ?').run(requestId);
      if (card.maxUses > 0) db.prepare('UPDATE special_cards SET usesUsed = usesUsed + 1 WHERE id = ?').run(card.id);
      io.to(`user_${req.userId}`).emit('card_use_approved', { cardName: card.name });
      io.emit('game_updated');
    } else {
      db.prepare('UPDATE card_use_requests SET status = \'denied\' WHERE id = ?').run(requestId);
      io.to(`user_${req.userId}`).emit('pix_error', `O Admin negou o uso do cartão ${card.name}.`);
    }
    io.emit('cards_updated');
    io.emit('card_requests_updated');
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

  // Dono do anúncio exclui (remove de vez) o próprio anúncio
  socket.on('delete_listing', ({ propertyId, sellerId }) => {
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!prop) return;
    if (Number(prop.sellerId) !== Number(sellerId)) {
      return socket.emit('pix_error', 'Você só pode excluir os seus próprios anúncios.');
    }
    if (prop.status === 'sold') {
      return socket.emit('pix_error', 'Imóvel já vendido não pode ser excluído.');
    }
    db.prepare('DELETE FROM property_bids WHERE propertyId = ?').run(propertyId);
    db.prepare('DELETE FROM properties WHERE id = ?').run(propertyId);
    io.emit('market_updated');
  });

  // Compra entre jogadores: um jogador compra imóvel de outro
  socket.on('buy_property', ({ buyerId, propertyId }) => {
    const prop = db.prepare('SELECT * FROM properties WHERE id = ? AND status = \'active\'').get(propertyId);
    if (!prop) return socket.emit('pix_error', 'Imóvel não disponível.');

    const buyer = db.prepare('SELECT balance, username FROM users WHERE id = ?').get(buyerId);
    if (!buyer) return;
    if (buyer.balance <= 0) {
      return socket.emit('pix_error', 'Seu saldo está zerado. Você não pode comprar imóveis.');
    }
    if (buyer.balance < prop.askingPrice) {
      return socket.emit('pix_error', 'Saldo insuficiente para comprar este imóvel.');
    }

    const seller = db.prepare('SELECT isBankrupt FROM users WHERE id = ?').get(prop.sellerId);
    if (seller && seller.isBankrupt) {
      return socket.emit('pix_error', 'O vendedor faliu e está fora do jogo. Não é possível comprar este imóvel.');
    }

    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(prop.askingPrice, buyerId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(prop.askingPrice, prop.sellerId);
    db.prepare("UPDATE properties SET status = 'sold', buyerId = ?, soldPrice = ?, soldAt = CURRENT_TIMESTAMP WHERE id = ?")
      .run(buyerId, prop.askingPrice, propertyId);
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
    const seller = db.prepare('SELECT isBankrupt FROM users WHERE id = ?').get(prop.sellerId);
    if (seller && seller.isBankrupt) return;
    const banco = db.prepare("SELECT id FROM users WHERE username = 'Banco'").get();
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(prop.bankOffer, prop.sellerId);
    db.prepare("UPDATE properties SET status = 'sold', buyerId = ?, soldPrice = ?, soldAt = CURRENT_TIMESTAMP WHERE id = ?")
      .run(banco.id, prop.bankOffer, propertyId);
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