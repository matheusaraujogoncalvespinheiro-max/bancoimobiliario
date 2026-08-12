import { useState, useEffect } from 'react';
import { LogOut, PlusCircle, Gift, Landmark, Clock, RefreshCcw, ScrollText, PiggyBank, HandCoins, CreditCard, Check, X } from 'lucide-react';
import { syncGameSnapshot, syncTransaction, syncMarket, syncLoans } from '../services/firebase';
import { API_URL } from '../config';

export default function AdminPanel({ socket, onLogout }) {
  const [activeTab, setActiveTab] = useState('jogadores'); // jogadores, mercado, extrato, emprestimos

  const [gameState, setGameState] = useState(null);
  const [users, setUsers] = useState([]);
  const [market, setMarket] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [history, setHistory] = useState([]);
  const [loans, setLoans] = useState([]);
  const [specialCards, setSpecialCards] = useState([]);
  const [cardRequests, setCardRequests] = useState([]);

  const [bancoId, setBancoId] = useState(null);
  const [feriasId, setFeriasId] = useState(null);
  const [feriasBalance, setFeriasBalance] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Formulários
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  
  const [payPlayerId, setPayPlayerId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [feriasWinnerId, setFeriasWinnerId] = useState('');

  const [message, setMessage] = useState('');

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/game_state`);
      const data = await res.json();
      if (data.state) setGameState(data.state);
      
      if (data.users && Array.isArray(data.users)) {
        const players = data.users.filter(u => u.role === 'player');
        setUsers(players);
        syncGameSnapshot(data.state, data.users);

        const banco = data.users.find(u => u.username === 'Banco');
        if (banco) setBancoId(banco.id);

        const ferias = data.users.find(u => u.username === 'Férias');
        if (ferias) {
          setFeriasId(ferias.id);
          setFeriasBalance(ferias.balance);
        }
      }
    } catch (e) { console.error(e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/history`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
        data.forEach(tx => syncTransaction(tx));
      }
    } catch (e) { console.error(e); }
  };

  const fetchMarket = async () => {
    try {
      const [res, hRes] = await Promise.all([
        fetch(`${API_URL}/api/market?role=admin`),
        fetch(`${API_URL}/api/market/history`)
      ]);
      const data = await res.json();
      const hData = await hRes.json();
      if (Array.isArray(data)) {
        setMarket(data);
        data.forEach(p => syncMarket(p));
      }
      if (Array.isArray(hData)) setSalesHistory(hData);
    } catch (e) { console.error(e); }
  };

  const fetchLoans = async () => {
    try {
      const res = await fetch(`${API_URL}/api/loans`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoans(data);
        syncLoans(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchSpecialCards = async () => {
    try {
      const res = await fetch(`${API_URL}/api/special_cards`);
      const data = await res.json();
      if (Array.isArray(data)) setSpecialCards(data);
    } catch (e) { console.error(e); }
  };

  const fetchCardRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/api/card_use_requests`);
      const data = await res.json();
      if (Array.isArray(data)) setCardRequests(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchData();
    fetchHistory();
    fetchMarket();
    fetchLoans();
    fetchSpecialCards();
    fetchCardRequests();

    socket.on('game_updated', () => { fetchData(); fetchHistory(); fetchLoans(); });
    socket.on('market_updated', () => { fetchMarket(); fetchHistory(); });
    socket.on('online_users', (ids) => setOnlineUsers(ids));
    socket.on('cards_updated', () => fetchSpecialCards());
    socket.on('card_requests_updated', () => fetchCardRequests());

    return () => {
      socket.off('game_updated');
      socket.off('market_updated');
      socket.off('online_users');
      socket.off('cards_updated');
      socket.off('card_requests_updated');
    };
  }, [socket]);

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  // Controles de Jogo
  const handleStartGame = () => socket.emit('start_game');
  const handleNextRound = () => socket.emit('next_round');

  // Criar Usuário
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, initialBalance: Number(initialBalance) })
      });
      if (res.ok) {
        showMessage('Conta criada com sucesso!');
        setUsername(''); setPassword(''); setInitialBalance('');
      } else {
        const data = await res.json();
        showMessage(data.error);
      }
    } catch (err) {
      showMessage('Erro ao criar conta');
    }
  };

  const handlePayFromBank = (e) => {
    e.preventDefault();
    if (!payPlayerId || !payAmount || !bancoId) return;
    socket.emit('pix', { senderId: bancoId, receiverId: Number(payPlayerId), amount: Number(payAmount) });
    showMessage(`M$ ${Number(payAmount).toLocaleString('pt-BR')} pago com sucesso!`);
    setPayAmount(''); setPayPlayerId('');
  };

  const handleReleaseFerias = (e) => {
    e.preventDefault();
    if (!feriasWinnerId || !feriasId || feriasBalance <= 0) return showMessage('Pote vazio ou jogador não selecionado.');
    socket.emit('pix', { senderId: feriasId, receiverId: Number(feriasWinnerId), amount: feriasBalance });
    showMessage('Férias liberadas!');
    setFeriasWinnerId('');
  };

  const handleRefund = (txId) => {
    if (confirm('Tem certeza que deseja estornar esta transação?')) {
      socket.emit('refund_transaction', txId);
      showMessage('Estorno solicitado!');
    }
  };

  const statusLabel = (status) => ({
    completed: 'Concluído',
    refunded: '🔁 Estornado'
  }[status] || status);

  const handleApprovePurchase = (propertyId) => {
    socket.emit('approve_bank_purchase', propertyId);
    showMessage('Compra pelo banco aprovada!');
  };

  const handleApproveCardUse = (requestId, approved) => {
    socket.emit('approve_card_use', { requestId, approved });
    showMessage(approved ? 'Uso do cartão autorizado!' : 'Uso do cartão negado.');
  };

  const handleResetGame = () => {
    const typed = prompt(
      'Isso vai APAGAR TUDO (jogadores, saldos, transações, imóveis, empréstimos e rodadas) e começar um novo jogo.\n\nDigite ZERAR para confirmar:'
    );
    if (typed !== 'ZERAR') return showMessage('Jogo NÃO foi zerado.');
    socket.emit('reset_game');
    showMessage('Jogo zerado! Novos jogadores podem ser criados.');
  };

  return (
    <div className="container animate-slide-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ color: 'var(--primary)', margin: 0 }}>Banqueiro</h2>
        <button className="btn-secondary" style={{ width: 'auto', padding: '8px 16px', color: 'var(--danger)' }} onClick={onLogout}>
          <LogOut size={18} /> Sair
        </button>
      </div>

      {/* Barra de quem está online */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', marginBottom: '24px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          🟢 {users.filter(u => onlineUsers.includes(String(u.id))).length} online
        </span>
        {users.map(u => {
          const isOnline = onlineUsers.includes(String(u.id));
          return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isOnline ? '#f0fdf4' : 'white', borderRadius: '20px', padding: '4px 10px', border: `1px solid ${isOnline ? '#bbf7d0' : '#e2e8f0'}`, flexShrink: 0 }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: isOnline ? '#22c55e' : '#cbd5e1' }} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: isOnline ? '#166534' : 'var(--text-muted)' }}>{u.username}</span>
            </div>
          );
        })}
      </div>

      {gameState && (
        <div className="glass" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--primary)', color: 'white' }}>
          <div>
            <h3 style={{ margin: 0 }}>Status do Jogo</h3>
            <p style={{ margin: 0, opacity: 0.8 }}>Rodada Atual: {gameState.round}</p>
          </div>
          <div>
            {!gameState.isStarted ? (
              <button className="btn-secondary" onClick={handleStartGame}>Iniciar Jogo</button>
            ) : (
              <button className="btn-secondary" onClick={handleNextRound}><RefreshCcw size={18}/> Avançar Rodada</button>
            )}
          </div>
        </div>
      )}

      {message && <div style={{ background: 'var(--success)', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{message}</div>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button className={activeTab === 'jogadores' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('jogadores')}>Controle</button>
        <button className={activeTab === 'emprestimos' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('emprestimos')}>Empréstimos</button>
        <button className={activeTab === 'extrato' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('extrato')}>Extrato Global</button>
        <button className={activeTab === 'mercado' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('mercado')}>Mercado</button>
        <button className={activeTab === 'cartoes' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('cartoes')}>Cartões</button>
      </div>

      {activeTab === 'jogadores' && (
        <div className="grid-dashboard">
          <div className="glass">
            <h3><PlusCircle size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Criar Jogador</h3>
            <form onSubmit={handleCreateAccount}>
              <input className="input-field" type="text" placeholder="Nome" value={username} onChange={e => setUsername(e.target.value)} required />
              <input className="input-field" type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required />
              <input className="input-field" type="number" placeholder="Saldo Inicial" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} required />
              <button className="btn-primary" type="submit">Criar Conta</button>
            </form>
          </div>

          <div className="glass">
            <h3><Landmark size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Pagamento do Banco Central</h3>
            <form onSubmit={handlePayFromBank}>
              <select className="input-field" value={payPlayerId} onChange={e => setPayPlayerId(e.target.value)} required>
                <option value="" disabled>Para quem?</option>
                {users.map(u => <option key={u.id} value={u.id} disabled={!!u.isBankrupt}>{u.username}{u.isBankrupt ? ' (Faliu)' : ''}</option>)}
              </select>
              <input className="input-field" type="number" step="1000" placeholder="Valor (Múltiplos de 1.000)" value={payAmount} onChange={e => setPayAmount(e.target.value)} required />
              <button className="btn-primary" type="submit">Pagar Jogador</button>
            </form>
          </div>

          <div className="glass" style={{ border: '2px solid #fde68a', background: '#fff9e6' }}>
            <h3 style={{ color: '#92400e' }}><PiggyBank size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Liberar Férias (M$ {feriasBalance.toLocaleString('pt-BR')})</h3>
            <form onSubmit={handleReleaseFerias}>
              <select className="input-field" style={{ background: 'white' }} value={feriasWinnerId} onChange={e => setFeriasWinnerId(e.target.value)} required>
                <option value="" disabled>Quem caiu nas Férias?</option>
                {users.map(u => <option key={u.id} value={u.id} disabled={!!u.isBankrupt}>{u.username}{u.isBankrupt ? ' (Faliu)' : ''}</option>)}
              </select>
              <button className="btn-primary" type="submit" style={{ background: '#d97706' }}>Liberar Pote</button>
            </form>
          </div>

          <div className="glass">
            <h3>Jogadores Atuais</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontWeight: '600', textDecoration: u.isBankrupt ? 'line-through' : 'none' }}>{u.username} {Number(u.jailedRounds) > 0 ? '⛓️' : ''}</span>
                  <span style={{ color: u.balance < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>M$ {u.balance.toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass" style={{ border: '2px solid #fecaca', background: '#fff5f5' }}>
            <h3 style={{ color: 'var(--danger)' }}>🗑️ Zerar Jogo</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>
              Apaga TUDO (jogadores, saldos, transações, imóveis, empréstimos e rodadas) para começar um novo jogo do zero.
            </p>
            <button
              className="btn-primary"
              style={{ background: 'var(--danger)', width: '100%' }}
              onClick={handleResetGame}
            >Zerar Jogo e Começar de Novo</button>
          </div>
        </div>
      )}

      {activeTab === 'emprestimos' && (
        <div className="glass">
          <h3><HandCoins size={20} style={{ verticalAlign: 'middle' }}/> Empréstimos dos Jogadores</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
            Os empréstimos são liberados automaticamente (até 50% do saldo, juros de 50%, pagos em 6 rodadas).
            Aqui você acompanha todas as dívidas ativas dos jogadores.
          </p>
          {loans.length === 0
            ? <p style={{ color: 'var(--text-muted)' }}>Nenhum empréstimo ativo no momento.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {loans.map(l => (
                  <div key={l.id} style={{ padding: '14px', border: '1px solid #fecaca', borderRadius: '10px', background: '#fff5f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '6px' }}>
                      <span>{l.username}</span>
                      <span>M$ {l.amount.toLocaleString('pt-BR')}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Devolve: <strong style={{ color: 'var(--danger)' }}>M$ {l.totalToPay.toLocaleString('pt-BR')}</strong>
                      {' · '}Rodadas restantes: <strong style={{ color: l.roundsLeft <= 2 ? 'var(--danger)' : '#d97706' }}>{l.roundsLeft}</strong>
                    </div>
                  </div>
                ))}
              </div>
          }
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '16px' }}>
            ⏱️ Ao avançar a rodada, o total devido dos empréstimos vencidos é descontado automaticamente do jogador.
          </p>
        </div>
      )}

      {activeTab === 'extrato' && (
        <div className="glass">
          <h3><ScrollText size={20} style={{ verticalAlign: 'middle' }}/> Extrato de Transações</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map(tx => (
              <div key={tx.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600' }}>{tx.sender} ➔ {tx.receiver}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(tx.timestamp).toLocaleString('pt-BR')} | Status: {statusLabel(tx.status)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '18px' }}>M$ {tx.amount.toLocaleString('pt-BR')}</span>
                  {tx.status === 'completed' && (tx.receiver === 'Banco' || tx.receiver === 'Férias' || tx.receiver === 'admin') && (
                    <button className="btn-secondary" style={{ padding: '8px', background: '#fee2e2', color: 'var(--danger)' }} onClick={() => handleRefund(tx.id)}>Estornar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'mercado' && (
        <div className="glass">
          <h3>Mercado de Imóveis</h3>

          {/* Pendentes de publicação */}
          {market.filter(p => p.status === 'pending_admin').length > 0 && (
            <>
              <h4 style={{ color: '#b45309', borderBottom: '2px solid #fde68a', paddingBottom: '8px' }}>⏳ Aguardando Aprovação de Publicação</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {market.filter(p => p.status === 'pending_admin').map(p => (
                  <div key={p.id} style={{ padding: '16px', border: '2px solid #fde68a', borderRadius: '8px', background: '#fff9e6' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{p.description}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                      {p.numHouses > 0 ? `${p.numHouses} casa(s)/hotel` : 'Terreno'} · Vendedor: {p.sellerName}
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <span>Valor pedido: <strong>M$ {p.askingPrice.toLocaleString('pt-BR')}</strong></span><br/>
                      <span style={{ color: 'var(--primary)' }}>Oferta do banco (50%): <strong>M$ {p.bankOffer.toLocaleString('pt-BR')}</strong></span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-primary" style={{ flex: 1 }} onClick={() => { socket.emit('approve_listing', p.id); showMessage('Anúncio publicado!'); }}>Aprovar Publicação</button>
                      <button className="btn-secondary" style={{ flex: 1, color: 'var(--danger)' }} onClick={() => { socket.emit('cancel_listing', p.id); showMessage('Anúncio recusado.'); }}>Recusar</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Imóveis Publicados (ativos) */}
          {market.filter(p => p.status === 'active').length > 0 && (
            <>
              <h4 style={{ color: '#166534', borderBottom: '2px solid #bbf7d0', paddingBottom: '8px' }}>✅ Publicados - Visível para Todos</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {market.filter(p => p.status === 'active').map(p => (
                  <div key={p.id} style={{ padding: '16px', border: '1px solid #bbf7d0', borderRadius: '8px', background: '#f0fdf4' }}>
                    <div style={{ fontWeight: 'bold' }}>{p.description}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                      {p.numHouses > 0 ? `${p.numHouses} casa(s)/hotel` : 'Terreno'} · Vendedor: {p.sellerName}
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <span>Valor pedido: <strong>M$ {p.askingPrice.toLocaleString('pt-BR')}</strong></span><br/>
                      <span style={{ color: 'var(--primary)' }}>Oferta do banco (50%): <strong>M$ {p.bankOffer.toLocaleString('pt-BR')}</strong></span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-primary" style={{ flex: 1 }} onClick={() => { socket.emit('approve_bank_purchase', p.id); showMessage('Venda ao banco aprovada!'); }}>Aprovar Venda ao Banco</button>
                      <button className="btn-secondary" style={{ flex: 1, color: 'var(--danger)' }} onClick={() => { socket.emit('cancel_listing', p.id); showMessage('Anúncio removido.'); }}>Remover Anúncio</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {market.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhum imóvel no momento.</p>}

          {/* Histórico de Vendas */}
          <h4 style={{ color: '#3730a3', borderBottom: '2px solid #c7d2fe', paddingBottom: '8px', marginTop: '28px' }}>🕐 Histórico de Vendas</h4>
          {salesHistory.length === 0
            ? <p style={{ color: 'var(--text-muted)' }}>Nenhuma venda realizada ainda.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {salesHistory.map(p => (
                  <div key={p.id} style={{ padding: '14px', border: '1px solid #bbf7d0', borderRadius: '10px', background: '#f0fdf4' }}>
                    <div style={{ fontWeight: 'bold' }}>{p.description}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '6px 0' }}>
                      {p.numHouses > 0 ? `${p.numHouses} casa(s)/hotel` : 'Terreno'} · Vendeu: <strong>{p.sellerName}</strong> · Comprou: <strong>{p.buyerName || 'Banco'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--primary)' }}>M$ {p.soldPrice.toLocaleString('pt-BR')}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🕐 {new Date(p.soldAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {activeTab === 'cartoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Solicitações de uso pendentes */}
          <div className="glass" style={{ border: cardRequests.length > 0 ? '2px solid #fde68a' : '1px solid #e2e8f0', background: cardRequests.length > 0 ? '#fff9e6' : 'white' }}>
            <h3 style={{ color: '#92400e' }}><Clock size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Autorizar Uso de Cartão</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
              Quando um jogador pedir para usar um cartão, autorize ou negue aqui para controlar a partida.
            </p>
            {cardRequests.length === 0
              ? <p style={{ color: 'var(--text-muted)' }}>Nenhuma solicitação de uso pendente.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {cardRequests.map(r => (
                    <div key={r.id} style={{ padding: '12px', border: '1px solid #fde68a', borderRadius: '10px', background: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={`/cards/${r.image}`} alt={r.cardName} style={{ width: '72px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 'bold' }}>{r.username} quer usar <span style={{ color: 'var(--primary)' }}>{r.cardName}</span></div>
                          {r.receiverName && (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              {r.amount
                                ? <>Pagando para: <strong>{r.receiverName}</strong> · M$ {Number(r.amount).toLocaleString('pt-BR')}</>
                                : <>Mandando <strong>{r.receiverName}</strong> para a cadeia ⛓️</>}
                            </div>
                          )}
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🕐 {new Date(r.createdAt).toLocaleString('pt-BR')}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button className="btn-primary" style={{ flex: 1, background: '#16a34a' }} onClick={() => handleApproveCardUse(r.id, true)}>
                          <Check size={16} style={{ verticalAlign: 'middle' }}/> Autorizar
                        </button>
                        <button className="btn-secondary" style={{ flex: 1, color: 'var(--danger)', background: '#fee2e2' }} onClick={() => handleApproveCardUse(r.id, false)}>
                          <X size={16} style={{ verticalAlign: 'middle' }}/> Negar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Mercado de Cartões */}
          <div className="glass">
            <h3><CreditCard size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Mercado de Cartões</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
              Cada cartão tem apenas 1 unidade. Veja quem já comprou cada um.
            </p>
            {specialCards.length === 0
              ? <p style={{ color: 'var(--text-muted)' }}>Nenhum cartão cadastrado.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {specialCards.map(c => (
                    <div key={c.id} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={`/cards/${c.image}`} alt={c.name} style={{ width: '96px', height: '68px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 'bold' }}>{c.name} <span style={{ color: 'var(--primary)' }}>M$ {c.price.toLocaleString('pt-BR')}</span></div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0' }}>{c.description}</div>
                          <div style={{ fontSize: '12px', fontWeight: '600' }}>
                            {c.ownerName
                              ? <span style={{ color: '#166534' }}>👤 Dono: {c.ownerName}{c.maxUses > 0 ? ` · Uso: ${c.usesUsed}/${c.maxUses}` : ''}</span>
                              : <span style={{ color: '#92400e' }}>Disponível para compra</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}
