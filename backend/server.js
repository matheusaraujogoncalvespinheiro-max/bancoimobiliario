const express = require('express');
const http = require('http');
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
    db.run('UPDATE users SET isBankrupt = 1 WHERE id = ?', [userId]);
    return true;
  }
  return false;
};

// --- ROTAS HTTP ---

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (row.isBankrupt) return res.status(403).json({ error: 'Você faliu e está fora do jogo!' });
    res.json(row);
  });
});

app.get('/api/game_state', (req, res) => {
  db.get('SELECT * FROM game_state WHERE id = 1', (err, state) => {
    db.all("SELECT id, username, role, balance, isBankrupt FROM users WHERE role IN ('player', 'system')", (err, users) => {
      res.json({ state: state || { round: 0, isStarted: 0 }, users: users || [] });
    });
  });
});

app.get('/api/history', (req, res) => {
  db.all(`
    SELECT t.id, t.amount, t.timestamp, t.status, 
           s.username as sender, r.username as receiver
    FROM transactions t
    LEFT JOIN users s ON t.senderId = s.id
    LEFT JOIN users r ON t.receiverId = r.id
    ORDER BY t.timestamp DESC LIMIT 200
  `, (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/history/:userId', (req, res) => {
  db.all(`
    SELECT t.id, t.amount, t.timestamp, t.status, 
           s.username as sender, r.username as receiver
    FROM transactions t
    LEFT JOIN users s ON t.senderId = s.id
    LEFT JOIN users r ON t.receiverId = r.id
    WHERE t.senderId = ? OR t.receiverId = ?
    ORDER BY t.timestamp DESC
  `, [req.params.userId, req.params.userId], (err, rows) => {
    res.json(rows || []);
  });
});

// Admin cria user
app.post('/api/users', (req, res) => {
  const { username, password, initialBalance } = req.body;
  db.run('INSERT INTO users (username, password, balance, role) VALUES (?, ?, ?, ?)', 
    [username, password, initialBalance || 0, 'player'], 
    function(err) {
      if (err) return res.status(400).json({ error: 'Erro ao criar usuário' });
      io.emit('game_updated');
      res.status(201).json({ success: true });
  });
});

// Empréstimos ativos de um usuário
app.get('/api/loans/:userId', (req, res) => {
  db.all('SELECT * FROM loans WHERE userId = ?', [req.params.userId], (err, rows) => {
    res.json(rows || []);
  });
});

// Todos os empréstimos (admin)
app.get('/api/loans', (req, res) => {
  db.all(`
    SELECT l.*, u.username 
    FROM loans l JOIN users u ON l.userId = u.id
  `, (err, rows) => {
    res.json(rows || []);
  });
});

// Mercado - Jogadores veem só anuncios ativos; Admin vê tudo
app.get('/api/market', (req, res) => {
  const { role } = req.query;
  const statusFilter = role === 'admin'
    ? `WHERE p.status IN ('pending_admin', 'active', 'pending_bank')`
    : `WHERE p.status = 'active'`;
  db.all(`
    SELECT p.*, u.username as sellerName 
    FROM properties p JOIN users u ON p.sellerId = u.id 
    ${statusFilter}
    ORDER BY p.createdAt DESC
  `, (err, rows) => {
    res.json(rows || []);
  });
});

// Mercado - próprios anúncios do jogador
app.get('/api/market/mine/:userId', (req, res) => {
  db.all(`
    SELECT p.*, u.username as sellerName 
    FROM properties p JOIN users u ON p.sellerId = u.id 
    WHERE p.sellerId = ? AND p.status NOT IN ('sold', 'canceled')
    ORDER BY p.createdAt DESC
  `, [req.params.userId], (err, rows) => {
    res.json(rows || []);
  });
});


// --- SOCKET.IO ---

io.on('connection', (socket) => {
  
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
  });

  // Admin Iniciar Jogo
  socket.on('start_game', () => {
    db.run('UPDATE game_state SET isStarted = 1 WHERE id = 1', () => {
      io.emit('game_updated');
    });
  });

  // Admin Avançar Rodada
  socket.on('next_round', () => {
    db.serialize(() => {
      db.run('UPDATE game_state SET round = round + 1 WHERE id = 1');
      db.run('UPDATE loans SET roundsLeft = roundsLeft - 1');

      // Cobra o potinho de Férias de TODOS os jogadores ativos a cada rodada
      const collectFerias = () => {
        db.get('SELECT feriasTax FROM game_state WHERE id = 1', (err, gs) => {
          const tax = gs && gs.feriasTax ? gs.feriasTax : 50000;
          db.get("SELECT id, balance FROM users WHERE username = 'Férias'", (err, ferias) => {
            db.all("SELECT id FROM users WHERE role = 'player' AND isBankrupt = 0", (err, players) => {
              if (!players || players.length === 0) {
                io.emit('game_updated');
                return;
              }
              let done = 0;
              players.forEach(p => {
                if (ferias) {
                  db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [tax, ferias.id]);
                }
                db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [tax, p.id]);
                db.get('SELECT balance FROM users WHERE id = ?', [p.id], (err, u) => {
                  if (u) {
                    if (checkBankruptcy(p.id, u.balance)) {
                      io.to(`user_${p.id}`).emit('bankrupt');
                    }
                    io.to(`user_${p.id}`).emit('ferias_charged', {
                      amount: tax, newBalance: u.balance
                    });
                  }
                  done++;
                  if (done === players.length) {
                    if (ferias) {
                      db.get('SELECT balance FROM users WHERE id = ?', [ferias.id], (err, f) => {
                        io.emit('ferias_updated', { balance: f ? f.balance : 0 });
                        io.emit('game_updated');
                      });
                    } else {
                      io.emit('game_updated');
                    }
                  }
                });
              });
            });
          });
        });
      };

      db.all('SELECT * FROM loans WHERE roundsLeft <= 0', (err, loans) => {
        if (!loans || loans.length === 0) {
          collectFerias();
          return;
        }

        let done = 0;
        loans.forEach(loan => {
          db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [loan.totalToPay, loan.userId]);
          db.run('DELETE FROM loans WHERE id = ?', [loan.id]);

          db.get('SELECT balance FROM users WHERE id = ?', [loan.userId], (err, u) => {
            if (u) {
              if (checkBankruptcy(loan.userId, u.balance)) {
                io.to(`user_${loan.userId}`).emit('bankrupt');
              }
              io.to(`user_${loan.userId}`).emit('debt_collected', {
                amount: loan.totalToPay, newBalance: u.balance
              });
            }
            done++;
            if (done === loans.length) collectFerias();
          });
        });
      });
    });
  });

  // Pegar Empréstimo
  socket.on('take_loan', ({ userId, amount }) => {
    db.get('SELECT balance, isBankrupt FROM users WHERE id = ?', [userId], (err, user) => {
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
      
      db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, userId]);
      db.run('INSERT INTO loans (userId, amount, totalToPay, roundsLeft) VALUES (?, ?, ?, 6)', [userId, amount, totalToPay], () => {
        db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, row) => {
          io.emit('game_updated');
          socket.emit('loan_approved', { amount, totalToPay, newBalance: row?.balance });
        });
      });
    });
  });

  // PIX
  socket.on('pix', ({ senderId, receiverId, amount }) => {
    if (amount % 1000 !== 0) {
      socket.emit('pix_error', 'Transferências devem ser múltiplos de 1.000!');
      return;
    }

    db.serialize(() => {
      db.get('SELECT balance, role, username FROM users WHERE id = ?', [senderId], (err, sender) => {
        if (!sender) return socket.emit('pix_error', 'Remetente não encontrado.');

        if (sender.role === 'player' && (sender.balance - amount) < -1500000) {
          socket.emit('pix_error', 'Limite de saldo negativo excedido (-1.500.000).');
          return;
        }

        db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, senderId]);
        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, receiverId]);
        db.run('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)', [senderId, receiverId, amount]);

        // Buscar novos saldos e usernames para resposta
        db.get('SELECT balance, username FROM users WHERE id = ?', [senderId], (err, senderRow) => {
          db.get('SELECT balance, username FROM users WHERE id = ?', [receiverId], (err, receiverRow) => {
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
        });
      });
    });
  });

  // Estorno (Admin)
  socket.on('refund_transaction', (transactionId) => {
    db.get('SELECT * FROM transactions WHERE id = ? AND status = "completed"', [transactionId], (err, tx) => {
      if (!tx) return;
      db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [tx.amount, tx.senderId]);
      db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [tx.amount, tx.receiverId]);
      db.run('UPDATE transactions SET status = "refunded" WHERE id = ?', [transactionId], () => {
        io.emit('game_updated');
        db.get('SELECT username FROM users WHERE id = ?', [tx.receiverId], (err, r) => {
          io.to(`user_${tx.senderId}`).emit('pix_received', { 
            from: `Estorno (${r?.username || 'Banco'})`, 
            amount: tx.amount 
          });
        });
      });
    });
  });

  // Mercado - Jogador cria anuncio (fica pending_admin)
  socket.on('sell_property', ({ sellerId, askingPrice, description, numHouses }) => {
    const bankOffer = askingPrice * 0.5;
    db.run(
      'INSERT INTO properties (sellerId, askingPrice, bankOffer, description, numHouses, status) VALUES (?, ?, ?, ?, ?, ?)',
      [sellerId, askingPrice, bankOffer, description || '', numHouses || 0, 'pending_admin'],
      () => { io.emit('market_updated'); }
    );
  });

  // Admin aprova a PUBLICAÇÃO do anúncio
  socket.on('approve_listing', (propertyId) => {
    db.run('UPDATE properties SET status = "active" WHERE id = ? AND status = "pending_admin"', [propertyId], () => {
      io.emit('market_updated');
    });
  });

  // Admin ou dono cancela anúncio
  socket.on('cancel_listing', (propertyId) => {
    db.run('UPDATE properties SET status = "canceled" WHERE id = ?', [propertyId], () => {
      io.emit('market_updated');
    });
  });

  // Compra entre jogadores: um jogador compra imóvel de outro
  socket.on('buy_property', ({ buyerId, propertyId }) => {
    db.get('SELECT * FROM properties WHERE id = ? AND status = "active"', [propertyId], (err, prop) => {
      if (!prop) return socket.emit('pix_error', 'Imóvel não disponível.');
      
      db.get('SELECT balance, username FROM users WHERE id = ?', [buyerId], (err, buyer) => {
        if (!buyer) return;
        if (buyer.balance < prop.askingPrice) {
          return socket.emit('pix_error', 'Saldo insuficiente para comprar este imóvel.');
        }

        db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [prop.askingPrice, buyerId]);
        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [prop.askingPrice, prop.sellerId]);
        db.run('UPDATE properties SET status = "sold" WHERE id = ?', [propertyId]);
        db.run('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)', [buyerId, prop.sellerId, prop.askingPrice]);

        db.get('SELECT balance FROM users WHERE id = ?', [buyerId], (err, bRow) => {
          db.get('SELECT balance FROM users WHERE id = ?', [prop.sellerId], (err, sRow) => {
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
        });
      });
    });
  });

  // Admin aprova COMPRA do banco
  socket.on('approve_bank_purchase', (propertyId) => {
    db.get('SELECT * FROM properties WHERE id = ?', [propertyId], (err, prop) => {
      if (!prop) return;
      db.get("SELECT id FROM users WHERE username = 'Banco'", (err, banco) => {
        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [prop.bankOffer, prop.sellerId]);
        db.run('UPDATE properties SET status = "sold" WHERE id = ?', [propertyId]);
        db.run('INSERT INTO transactions (senderId, receiverId, amount) VALUES (?, ?, ?)', [banco.id, prop.sellerId, prop.bankOffer], () => {
          db.get('SELECT balance FROM users WHERE id = ?', [prop.sellerId], (err, sRow) => {
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
      });
    });
  });
});

const PORT = 3001;
server.listen(PORT, () => { console.log('Servidor rodando na porta ' + PORT); });
