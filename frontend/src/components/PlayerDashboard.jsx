import { useState, useEffect } from 'react';
import { LogOut, Send, PiggyBank, Landmark, ScrollText, HandCoins, Clock, Tag, ShoppingCart, Home, CreditCard } from 'lucide-react';
import { syncGameSnapshot, syncTransaction, syncMarket, syncLoans } from '../services/firebase';
import { API_URL } from '../config';

function formatarNumero(valor) {
  const num = String(valor).replace(/\D/g, '');
  if (!num) return '';
  return Number(num).toLocaleString('pt-BR');
}

function desformatarNumero(valor) {
  if (!valor) return 0;
  return Number(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
}

// Cores/tom de cada cartão (usado para personalizar o site quando ativado)
const CARD_THEMES = {
  caveira:   { primary: '#0f172a', hover: '#1e293b', bg: '#0b1120', grad: 'linear-gradient(135deg, #0b1120, #1e293b)', shadow: '0 10px 25px rgba(15, 23, 42, 0.55)' },
  patria:    { primary: '#047857', hover: '#065f46', bg: '#ecfdf5', grad: 'linear-gradient(135deg, #064e3b, #047857)', shadow: '0 10px 25px rgba(4, 120, 87, 0.5)' },
  adventure: { primary: '#4f46e5', hover: '#4338ca', bg: '#eef2ff', grad: 'linear-gradient(135deg, #312e81, #6d28d9)', shadow: '0 10px 25px rgba(79, 70, 229, 0.45)' },
  biquini:   { primary: '#db2777', hover: '#be185d', bg: '#fdf2f8', grad: 'linear-gradient(135deg, #831843, #db2777)', shadow: '0 10px 25px rgba(219, 39, 119, 0.45)' },
  king:      { primary: '#b45309', hover: '#92400e', bg: '#fffbeb', grad: 'linear-gradient(135deg, #78350f, #d97706)', shadow: '0 10px 25px rgba(180, 83, 9, 0.45)' },
  snopy:     { primary: '#0d9488', hover: '#0f766e', bg: '#f0fdfa', grad: 'linear-gradient(135deg, #134e4a, #0f766e)', shadow: '0 10px 25px rgba(13, 148, 136, 0.45)' },
  cassudo:   { primary: '#c2410c', hover: '#9a3412', bg: '#fff7ed', grad: 'linear-gradient(135deg, #7c2d12, #ea580c)', shadow: '0 10px 25px rgba(194, 65, 12, 0.45)' },
  adventurex:{ primary: '#7c3aed', hover: '#6d28d9', bg: '#f5f3ff', grad: 'linear-gradient(135deg, #4c1d95, #9333ea)', shadow: '0 10px 25px rgba(124, 58, 237, 0.45)' },
  tigrinho:  { primary: '#059669', hover: '#047857', bg: '#ecfdf5', grad: 'linear-gradient(135deg, #064e3b, #10b981)', shadow: '0 10px 25px rgba(5, 150, 105, 0.45)' },
  fugir:     { primary: '#0369a1', hover: '#075985', bg: '#f0f9ff', grad: 'linear-gradient(135deg, #0c4a6e, #0284c7)', shadow: '0 10px 25px rgba(3, 105, 161, 0.45)' },
  deep:      { primary: '#0e7490', hover: '#155e75', bg: '#ecfeff', grad: 'linear-gradient(135deg, #164e63, #06b6d4)', shadow: '0 10px 25px rgba(14, 116, 144, 0.45)' },
  curry:     { primary: '#7a5c2e', hover: '#6b4e26', bg: '#fbf7ee', grad: 'linear-gradient(135deg, #4a3412, #b8860b)', shadow: '0 10px 25px rgba(122, 92, 46, 0.45)' },
};

export default function PlayerDashboard({ user, setUser, socket, onLogout }) {
  const [activeTab, setActiveTab] = useState('home');
  const [allUsers, setAllUsers] = useState([]); // todos (jogadores + sistema)
  const [allPlayers, setAllPlayers] = useState([]); // todos os jogadores (para a barra online)
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [feriasBalance, setFeriasBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [market, setMarket] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [loans, setLoans] = useState([]);
  const [specialCards, setSpecialCards] = useState([]);
  const [myCardRequests, setMyCardRequests] = useState([]);
  const [activeCardId, setActiveCardId] = useState(() => Number(localStorage.getItem(`activeCard_${user.id}`)) || null);

  // Transferência
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [amountDisplay, setAmountDisplay] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

  // Compra de imóvel
  const [buyModal, setBuyModal] = useState(null); // property object

  // Cartão ADVENTURE (pagar alguém sem desconto)
  const [adventureModal, setAdventureModal] = useState(null);
  const [adventureReceiverId, setAdventureReceiverId] = useState('');
  const [adventureAmountDisplay, setAdventureAmountDisplay] = useState('');

  // Cartão CASCUDO (pagar com 40% de desconto)
  const [cascudoModal, setCascudoModal] = useState(null);
  const [cascudoReceiverId, setCascudoReceiverId] = useState('');
  const [cascudoAmountDisplay, setCascudoAmountDisplay] = useState('');

  // Cartão PATRIA (pagar imposto/Férias no seu lugar - Banco cobre)
  const [patriaModal, setPatriaModal] = useState(null);
  const [patriaAmountDisplay, setPatriaAmountDisplay] = useState('');

  // Cartão CAVEIRA (mandar alguém para a cadeia)
  const [jailModal, setJailModal] = useState(null);
  const [jailReceiverId, setJailReceiverId] = useState('');

  // Comprovante
  const [receiptTx, setReceiptTx] = useState(null);

  // Empréstimo
  const [loanDisplay, setLoanDisplay] = useState('');

  // Mercado / Vender
  const [propertyDesc, setPropertyDesc] = useState('');
  const [propertyHouses, setPropertyHouses] = useState('');
  const [propertyPriceDisplay, setPropertyPriceDisplay] = useState('');

  const uid = parseInt(user.id);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/game_state`);
      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        setAllUsers(data.users.filter(u => parseInt(u.id) !== uid));
        setAllPlayers(data.users.filter(u => u.role === 'player' && !u.isBankrupt));
        const ferias = data.users.find(u => u.username === 'Férias');
        if (ferias) setFeriasBalance(ferias.balance);
        // Atualizar saldo do próprio user
        const me = data.users.find(u => parseInt(u.id) === uid);
        if (me) setUser(prev => ({ ...prev, balance: me.balance, jailedRounds: me.jailedRounds }));
        syncGameSnapshot(data.state, data.users);
      }
    } catch(e) { console.error(e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/history/${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
        data.forEach(tx => syncTransaction(tx));
      }
    } catch(e) {}
  };

  const fetchMarket = async () => {
    try {
      const [mRes, meRes, hRes] = await Promise.all([
        fetch(`${API_URL}/api/market`),
        fetch(`${API_URL}/api/market/mine/${user.id}`),
        fetch(`${API_URL}/api/market/history`)
      ]);
      const mData = await mRes.json();
      const meData = await meRes.json();
      const hData = await hRes.json();
      if (Array.isArray(mData)) {
        setMarket(mData.filter(p => parseInt(p.sellerId) !== uid));
        mData.forEach(p => syncMarket(p));
      }
      if (Array.isArray(meData)) {
        setMyListings(meData);
        meData.forEach(p => syncMarket(p));
      }
      if (Array.isArray(hData)) setSalesHistory(hData);
    } catch(e) {}
  };

  const fetchLoans = async () => {
    try {
      const res = await fetch(`${API_URL}/api/loans/${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoans(data);
        syncLoans(data);
      }
    } catch(e) {}
  };

  const fetchSpecialCards = async () => {
    try {
      const res = await fetch(`${API_URL}/api/special_cards`);
      const data = await res.json();
      if (Array.isArray(data)) setSpecialCards(data);
    } catch(e) {}
  };

  const fetchMyCardRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/api/card_use_requests?userId=${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setMyCardRequests(data);
    } catch(e) {}
  };

  useEffect(() => {
    fetchData(); fetchHistory(); fetchMarket(); fetchLoans(); fetchSpecialCards(); fetchMyCardRequests();
    socket.on('game_updated', () => { fetchData(); fetchHistory(); fetchLoans(); });
    socket.on('market_updated', () => fetchMarket());
    socket.on('ferias_updated', (data) => { setFeriasBalance(data.balance ?? 0); });
    socket.on('online_users', (ids) => setOnlineUsers(ids));
    socket.on('cards_updated', () => fetchSpecialCards());
    socket.on('card_requests_updated', () => fetchMyCardRequests());
    return () => {
      socket.off('game_updated');
      socket.off('market_updated');
      socket.off('ferias_updated');
      socket.off('online_users');
      socket.off('cards_updated');
      socket.off('card_requests_updated');
    };
  }, [socket]);

  // Personaliza o site com o tom do cartão ativo (e limpa tudo ao desativar/sair)
  useEffect(() => {
    const root = document.documentElement;
    const card = specialCards.find(c => Number(c.ownerId) === uid && Number(c.id) === Number(activeCardId));
    const theme = card ? CARD_THEMES[card.effect] || CARD_THEMES.adventure : null;
    if (theme) {
      root.style.setProperty('--primary', theme.primary);
      root.style.setProperty('--primary-hover', theme.hover);
      root.style.setProperty('--bg-color', theme.bg);
      localStorage.setItem(`activeCard_${uid}`, activeCardId);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-hover');
      root.style.removeProperty('--bg-color');
      localStorage.removeItem(`activeCard_${uid}`);
    }
    return () => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-hover');
      root.style.removeProperty('--bg-color');
    };
  }, [activeCardId, uid, specialCards]);

  if (user.isBankrupt) {
    return (
      <div className="login-wrapper">
        <div className="login-box animate-slide-up" style={{ textAlign: 'center' }}>
          <h1 style={{ color: 'var(--danger)', fontSize: '48px', margin: '0 0 16px 0' }}>☠️ FALÊNCIA!</h1>
          <p style={{ color: 'var(--text-muted)' }}>Seu saldo chegou a -1.5M. Você está fora do jogo.</p>
          <button className="btn-secondary" style={{ marginTop: '16px' }} onClick={onLogout}>Sair da Conta</button>
        </div>
      </div>
    );
  }

  const pixAmount = desformatarNumero(amountDisplay);
  const loanAmount = desformatarNumero(loanDisplay);
  const propertyPrice = desformatarNumero(propertyPriceDisplay);

  // Só jogadores (sem banco, sem férias) para pix entre pessoas
  const playerReceivers = allUsers.filter(u => u.role === 'player' && !u.isBankrupt);
  // Contas de sistema
  const bancoUser = allUsers.find(u => u.username === 'Banco');
  const feriasUser = allUsers.find(u => u.username === 'Férias');

  const handlePix = () => {
    if (!selectedReceiver || pixAmount <= 0) return;
    if (pixAmount % 1000 !== 0) return alert('Transferências apenas em múltiplos de 1.000!');
    if (user.balance <= 0 && selectedReceiver.username === 'Banco') {
      return alert('Seu saldo está zerado. Você só pode pagar outros jogadores e impostos (Férias).');
    }
    socket.emit('pix', { senderId: uid, receiverId: selectedReceiver.id, amount: pixAmount });
    setConfirmModal(false);
    setAmountDisplay('');
    setSelectedReceiver(null);
  };

  const handleTakeLoan = (e) => {
    e.preventDefault();
    const max = Math.max(0, user.balance * 0.5);
    if (loanAmount > max) return alert(`Máximo permitido: M$ ${max.toLocaleString('pt-BR')}`);
    if (loanAmount <= 0 || loanAmount % 1000 !== 0) return alert('Valor inválido. Use múltiplos de 1.000.');
    socket.emit('take_loan', { userId: uid, amount: loanAmount });
    setLoanDisplay('');
  };

  const handleSellProperty = (e) => {
    e.preventDefault();
    if (!propertyPrice || !propertyDesc) return;
    socket.emit('sell_property', {
      sellerId: uid,
      askingPrice: propertyPrice,
      description: propertyDesc,
      numHouses: Number(propertyHouses) || 0
    });
    alert('Anúncio enviado! Aguarde aprovação do Admin.');
    setPropertyDesc(''); setPropertyHouses(''); setPropertyPriceDisplay('');
  };

  const handleBuyProperty = (prop) => {
    if (user.balance <= 0) return alert('Seu saldo está zerado. Você não pode comprar imóveis.');
    if (user.balance < prop.askingPrice) return alert('Saldo insuficiente!');
    socket.emit('buy_property', { buyerId: uid, propertyId: prop.id });
    setBuyModal(null);
  };

  const handleDeleteListing = (p) => {
    if (!confirm(`Excluir o anúncio "${p.description}"? Essa ação não pode ser desfeita.`)) return;
    socket.emit('delete_listing', { propertyId: p.id, sellerId: uid });
  };

  const handleBuyCard = (c) => {
    if (user.balance <= 0) return alert('Seu saldo está zerado. Você não pode comprar cartões.');
    if (user.balance < c.price) return alert(`Saldo insuficiente! O cartão custa M$ ${c.price.toLocaleString('pt-BR')}.`);
    if (!confirm(`Comprar o cartão ${c.emoji} ${c.name} por M$ ${c.price.toLocaleString('pt-BR')}?`)) return;
    socket.emit('buy_special_card', { userId: uid, cardId: c.id });
  };

  const handleUseCard = (c) => {
    if (c.effect === 'adventure') {
      setAdventureReceiverId('');
      setAdventureAmountDisplay('');
      setAdventureModal(c);
      return;
    }
    if (c.effect === 'cassudo') {
      setCascudoReceiverId('');
      setCascudoAmountDisplay('');
      setCascudoModal(c);
      return;
    }
    if (c.effect === 'adventurex') {
      setCascudoReceiverId('');
      setCascudoAmountDisplay('');
      setCascudoModal(c);
      return;
    }
    if (c.effect === 'patria') {
      setPatriaAmountDisplay('');
      setPatriaModal(c);
      return;
    }
    if (c.effect === 'deep') {
      setPatriaAmountDisplay('');
      setPatriaModal(c);
      return;
    }
    if (c.effect === 'caveira') {
      setJailReceiverId('');
      setJailModal(c);
      return;
    }
    if (!confirm(`Usar o cartão ${c.name} agora? O uso precisa da autorização do Admin.`)) return;
    socket.emit('request_card_use', { userId: uid, cardId: c.id });
  };

  const handleConfirmJail = () => {
    if (!jailReceiverId) return alert('Escolha quem vai para a cadeia.');
    socket.emit('request_card_use', { userId: uid, cardId: jailModal.id, receiverId: Number(jailReceiverId) });
    setJailModal(null);
  };

  const handleConfirmAdventure = () => {
    const val = desformatarNumero(adventureAmountDisplay);
    if (!adventureReceiverId || val <= 0) return alert('Escolha o jogador e informe o valor.');
    if (val % 1000 !== 0) return alert('O valor deve ser múltiplo de 1.000.');
    socket.emit('request_card_use', { userId: uid, cardId: adventureModal.id, receiverId: Number(adventureReceiverId), amount: val });
    setAdventureModal(null);
  };

  const handleConfirmCascudo = () => {
    const val = desformatarNumero(cascudoAmountDisplay);
    if (!cascudoReceiverId || val <= 0) return alert('Escolha o jogador e informe o valor.');
    if (val % 1000 !== 0) return alert('O valor deve ser múltiplo de 1.000.');
    socket.emit('request_card_use', { userId: uid, cardId: cascudoModal.id, receiverId: Number(cascudoReceiverId), amount: val });
    setCascudoModal(null);
  };

  const handleConfirmPatria = () => {
    const val = desformatarNumero(patriaAmountDisplay);
    if (val <= 0) return alert('Informe o valor do imposto.');
    if (val % 1000 !== 0) return alert('O valor deve ser múltiplo de 1.000.');
    socket.emit('request_card_use', { userId: uid, cardId: patriaModal.id, amount: val });
    setPatriaModal(null);
  };

  const statusLabel = (status) => ({
    pending_admin: '⏳ Aguardando aprovação',
    active: '✅ Publicado',
    sold: '✔️ Vendido',
    canceled: '❌ Cancelado',
    completed: 'Concluído',
    refunded: '🔁 Estornado'
  }[status] || status);

  const tabs = [
    ['home', '💳 Pix'],
    ['casas', '🏠 Comprar Casa'],
    ['bandeiras', '💎 Cartões'],
    ['extrato', '📄 Extrato'],
    ['emprestimo', '💰 Empréstimos'],
    ['mercado', '🏘️ Mercado'],
  ];

  const ownedCards = specialCards.filter(c => Number(c.ownerId) === uid);
  const activeCard = ownedCards.find(c => Number(c.id) === Number(activeCardId)) || null;
  const activeTheme = activeCard ? CARD_THEMES[activeCard.effect] || CARD_THEMES.adventure : null;
  const playerReceiversForAdventure = allUsers.filter(u => u.role === 'player' && !u.isBankrupt && parseInt(u.id) !== uid);
  const jailCandidates = playerReceiversForAdventure.filter(u => !(Number(u.jailedRounds) > 0));

  return (
    <div className="container animate-slide-up" style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ color: 'var(--primary)', margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Olá, {user.username}
        </h2>
        <button className="btn-secondary" style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }} onClick={onLogout}>
          <LogOut size={18} /> Sair
        </button>
      </div>

      {/* Barra de quem está online */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', marginBottom: '20px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          🟢 {allPlayers.filter(u => onlineUsers.includes(String(u.id))).length} online
        </span>
        {allPlayers.map(u => {
          const isOnline = onlineUsers.includes(String(u.id));
          return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isOnline ? '#f0fdf4' : 'white', borderRadius: '20px', padding: '4px 10px', border: `1px solid ${isOnline ? '#bbf7d0' : '#e2e8f0'}`, flexShrink: 0 }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: isOnline ? '#22c55e' : '#cbd5e1' }} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: isOnline ? '#166534' : 'var(--text-muted)' }}>{u.username}</span>
            </div>
          );
        })}
      </div>

      {user.jailedRounds > 0 && (
        <div style={{ background: '#1e293b', color: '#fecaca', border: '1px solid #475569', borderRadius: '12px', padding: '10px 14px', marginBottom: '20px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>
          ⛓️ VOCÊ ESTÁ PRESO NA CADEIA · não pode receber pagamentos ({user.jailedRounds} rodada(s) restante(s))
        </div>
      )}

      {/* Cartão */}
      <div className="credit-card" style={{ marginBottom: '24px', width: '100%', maxWidth: '100%', background: activeCard ? activeTheme.grad : undefined, boxShadow: activeTheme ? activeTheme.shadow : undefined }}>
        {activeCard && (
          <img src={`/cards/${activeCard.image}`} alt={activeCard.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45, borderRadius: '16px' }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="card-label">Saldo Disponível</div>
          <h2 className="card-balance" style={{ fontSize: '28px', color: user.balance < 0 ? '#fecaca' : 'white' }}>
            M$ {user.balance.toLocaleString('pt-BR')}
          </h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
          <div>
            <div className="card-name">{user.username}</div>
            {activeCard && (
              <div style={{ fontSize: '12px', opacity: 0.9, fontWeight: '600', marginTop: '4px', textTransform: 'none', letterSpacing: '0' }}>
                {activeCard.emoji} {activeCard.name}
              </div>
            )}
          </div>
          {ownedCards.length > 0 ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '46px' }}>
              {ownedCards.map(c => {
                const on = Number(c.id) === Number(activeCardId);
                return (
                  <img
                    key={c.id}
                    src={`/cards/${c.image}`}
                    alt={c.name}
                    title={`${c.name} (clique para ${on ? 'desativar' : 'ativar'} o tema)`}
                    onClick={() => setActiveCardId(on ? null : c.id)}
                    style={{ height: '42px', width: '60px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: on ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.35)', transform: on ? 'scale(1.1)' : 'none', transition: '0.2s', boxShadow: on ? '0 0 0 3px rgba(255,255,255,0.25)' : 'none' }}
                  />
                );
              })}
            </div>
          ) : (
            <Landmark size={28} opacity={0.5} />
          )}
        </div>
      </div>

      {/* Seletor de tema do site (visível quando o jogador tem cartões) */}
      {ownedCards.length > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '12px 14px', marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px' }}>
            🎨 Tema do site (toque no cartão para ativar)
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ownedCards.map(c => {
              const on = Number(c.id) === Number(activeCardId);
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveCardId(on ? null : c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                    background: on ? 'var(--primary)' : '#f1f5f9',
                    border: on ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                    borderRadius: '10px', padding: '6px 10px', transition: '0.2s'
                  }}
                >
                  <img src={`/cards/${c.image}`} alt={c.name} style={{ width: '34px', height: '24px', objectFit: 'cover', borderRadius: '4px' }} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: on ? 'white' : 'var(--text-main)' }}>
                    {c.emoji} {c.name.split(' ')[0]}{on ? ' ✓' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Férias badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff9e6', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
        <PiggyBank size={24} color="#d97706" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: '#b45309' }}>Pote de Férias Acumulado</div>
          <div style={{ fontWeight: 'bold', color: '#92400e' }}>M$ {feriasBalance.toLocaleString('pt-BR')}</div>
        </div>
      </div>

      {/* Hint pro comprar casa */}
      <div
        onClick={() => setActiveTab('casas')}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '12px',
          padding: '12px 16px', marginBottom: '20px', cursor: 'pointer'
        }}
      >
        <Home size={24} color="#4f46e5" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#3730a3' }}>Comprar Casa / Propriedade</div>
          <div style={{ fontSize: '12px', color: '#4f46e5' }}>Toque aqui e pague direto pro Banco com Pix</div>
        </div>
        <span style={{ color: '#4f46e5', fontWeight: 'bold', fontSize: '18px' }}>›</span>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '6px' }}>
        {tabs.map(([tab, label]) => (
          <button key={tab}
            className={activeTab === tab ? 'btn-primary' : 'btn-secondary'}
            style={{ minWidth: 'fit-content', padding: '10px 16px', fontSize: '13px' }}
            onClick={() => setActiveTab(tab)}
          >{label}</button>
        ))}
      </div>

      {/* ====== ABA PIX ====== */}
      {activeTab === 'home' && (
        <div className="glass">
          <h3 style={{ marginBottom: '16px' }}>Selecione quem vai receber</h3>

          {playerReceivers.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>Nenhum outro jogador criado ainda.</p>
          )}

          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
            Toque em um círculo para escolher quem vai receber o Pix.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {playerReceivers.map(u => (
              <div key={u.id}
                onClick={() => { setSelectedReceiver(u); setAmountDisplay(''); }}
                style={{
                  width: '76px', height: '76px', borderRadius: '50%',
                  background: selectedReceiver?.id === u.id ? 'var(--primary)' : '#e2e8f0',
                  color: selectedReceiver?.id === u.id ? 'white' : 'var(--text-main)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', cursor: 'pointer', textAlign: 'center',
                  transition: '0.2s', fontSize: '11px', fontWeight: 'bold', padding: '4px'
                }}
              >{Number(u.jailedRounds) > 0 ? '⛓️' : '👤'}<br/>{u.username}</div>
            ))}
            {feriasUser && (
              <div onClick={() => { setSelectedReceiver(feriasUser); setAmountDisplay(''); }}
                style={{
                  width: '76px', height: '76px', borderRadius: '50%',
                  background: selectedReceiver?.id === feriasUser.id ? '#d97706' : '#fef3c7',
                  color: selectedReceiver?.id === feriasUser.id ? 'white' : '#92400e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', cursor: 'pointer', textAlign: 'center',
                  transition: '0.2s', fontSize: '11px', fontWeight: 'bold', padding: '4px'
                }}
              >🏖️<br/>Imposto</div>
            )}
            {bancoUser && user.balance > 0 && (
              <div onClick={() => { setSelectedReceiver(bancoUser); setAmountDisplay(''); }}
                style={{
                  width: '76px', height: '76px', borderRadius: '50%',
                  background: selectedReceiver?.id === bancoUser.id ? '#334155' : '#e2e8f0',
                  color: selectedReceiver?.id === bancoUser.id ? 'white' : 'var(--text-main)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', cursor: 'pointer', textAlign: 'center',
                  transition: '0.2s', fontSize: '11px', fontWeight: 'bold', padding: '4px'
                }}
              >🏦<br/>Banco</div>
            )}
          </div>

          {selectedReceiver && (
            <div>
              <p style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>
                Enviando para: <strong style={{ color: 'var(--text-main)' }}>{selectedReceiver.username === 'Férias' ? '🏖️ Imposto (Férias)' : selectedReceiver.username}</strong>
              </p>
              <input
                className="input-field"
                type="text"
                inputMode="numeric"
                placeholder="Valor (mínimo 1.000)"
                value={amountDisplay}
                onChange={e => setAmountDisplay(formatarNumero(e.target.value))}
              />
              {pixAmount > 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '12px' }}>Você vai enviar: <strong>M$ {pixAmount.toLocaleString('pt-BR')}</strong></p>}
              <button className="btn-primary" onClick={() => setConfirmModal(true)}><Send size={18}/> Continuar</button>
            </div>
          )}
        </div>
      )}

      {/* ====== ABA COMPRAR CASA ====== */}
      {activeTab === 'casas' && (
        <div className="glass">
          <h3><Home size={20} style={{ verticalAlign: 'middle' }}/> Comprar Casa / Propriedade</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
            Para <strong>comprar uma casa</strong> no jogo, faça um <strong>Pix direto para o Banco</strong> com o valor da propriedade. O valor cai na conta do Banco e o comprovante fica salvo no seu Extrato (com data, horário e para quem foi).
          </p>
          {user.balance <= 0 ? (
            <p style={{ color: 'var(--danger)', fontSize: '14px', background: '#fff0f0', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px' }}>
              ⚠️ Seu saldo está zerado. Com saldo zerado você <strong>não pode comprar casas nem terrenos</strong> —
              apenas pagar outros jogadores e impostos (Férias).
            </p>
          ) : bancoUser ? (
            <div>
              <input
                className="input-field"
                type="text"
                inputMode="numeric"
                placeholder="Valor da casa/propriedade"
                value={amountDisplay}
                onChange={e => setAmountDisplay(formatarNumero(e.target.value))}
              />
              {pixAmount > 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '12px' }}>Pagando ao Banco: <strong>M$ {pixAmount.toLocaleString('pt-BR')}</strong></p>}
              <button className="btn-primary" onClick={() => { setSelectedReceiver(bancoUser); setConfirmModal(true); }}>
                🏦 Pagar ao Banco
              </button>
              <p style={{ color: '#b45309', fontSize: '12px', marginTop: '12px' }}>⚠️ Se o valor estiver errado, somente o Admin pode fazer o estorno na aba Extrato.</p>
            </div>
          ) : <p style={{ color: 'var(--text-muted)' }}>Banco não encontrado. Aguarde o Admin iniciar o jogo.</p>}
        </div>
      )}

      {/* ====== ABA CARTÕES ESPECIAIS ====== */}
      {activeTab === 'bandeiras' && (
        <div className="glass">
          <h3><CreditCard size={20} style={{ verticalAlign: 'middle' }}/> Cartões Especiais</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
            Compre um cartão e ganhe uma <strong>habilidade especial</strong>. Cada cartão tem apenas <strong>1 unidade</strong>: quem comprar primeiro fica com ele e <strong>não há revenda</strong>. Depois de comprar, use <strong>🎨 Ativar tema</strong> (ou toque na miniatura no cartão do topo) para deixar o site no tom do seu cartão.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {specialCards.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhum cartão disponível no momento.</p>}
            {specialCards.map(c => {
              const ownedByMe = Number(c.ownerId) === uid;
              const ownedByOther = c.ownerId && !ownedByMe;
              const cantBuy = ownedByOther || user.balance <= 0 || user.balance < c.price;
              const usesLeft = (c.maxUses || 0) - (c.usesUsed || 0);
              const isPending = myCardRequests.some(r => Number(r.cardId) === c.id);
              const usable = ownedByMe && c.maxUses > 0 && usesLeft > 0 && !isPending;
              const isActiveCard = Number(c.id) === Number(activeCardId);
              return (
                <div key={c.id} style={{ padding: '14px', border: ownedByMe ? '2px solid #86efac' : '1px solid #e2e8f0', borderRadius: '12px', background: ownedByMe ? '#f0fdf4' : 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <img src={`/cards/${c.image}`} alt={c.name} style={{ width: '120px', height: '86px', objectFit: 'cover', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{c.name}</div>
                      <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '15px', marginTop: '4px' }}>M$ {c.price.toLocaleString('pt-BR')}</div>
                      <div style={{ fontSize: '12px', color: '#b45309', marginTop: '4px' }}>
                        ⚡ {c.maxUses === 0 ? 'Passivo (permanente)' : `${c.maxUses} uso(s) no jogo`}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    {c.description}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: ownedByMe ? '#166534' : 'var(--text-muted)' }}>
                      {ownedByMe
                        ? (isPending ? '⏳ Aguardando aprovação do Admin' : (c.maxUses > 0 ? `✓ Seu cartão · ${usesLeft} uso(s) restante(s)` : '✓ Seu cartão · Passivo'))
                        : ownedByOther
                          ? `🔒 Comprado por ${c.ownerName}`
                          : 'Disponível para compra'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {ownedByMe && (
                        <button
                          className="btn-secondary"
                          style={{ width: 'auto', background: isActiveCard ? '#1e293b' : '#ede9fe', color: isActiveCard ? 'white' : '#4c1d95' }}
                          onClick={() => setActiveCardId(isActiveCard ? null : c.id)}
                        >
                          {isActiveCard ? '✓ Tema ativo' : '🎨 Ativar tema'}
                        </button>
                      )}
                      {!ownedByMe && !ownedByOther && (
                        <button
                          className="btn-primary"
                          style={{ opacity: cantBuy ? 0.5 : 1 }}
                          disabled={cantBuy}
                          onClick={() => handleBuyCard(c)}
                        >
                          {cantBuy ? 'Comprar' : `Comprar · M$ ${c.price.toLocaleString('pt-BR')}`}
                        </button>
                      )}
                      {usable && (
                        <button className="btn-primary" style={{ background: '#16a34a' }} onClick={() => handleUseCard(c)}>
                          Usar ({usesLeft})
                        </button>
                      )}
                      {isPending && (
                        <button className="btn-secondary" disabled style={{ opacity: 0.6 }}>
                          ⏳ Em aprovação
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal ADVENTURE CARD */}
      {adventureModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
            <h3>🚀 Adventure Card</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '10px 0' }}>
              O <strong>Banco</strong> paga a pessoa escolhida. Nada é descontado do seu saldo.
            </p>
            <select className="input-field" value={adventureReceiverId} onChange={e => setAdventureReceiverId(e.target.value)} style={{ textAlign: 'left' }}>
              <option value="" disabled>Quem vai receber?</option>
              {playerReceiversForAdventure.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <input
              className="input-field"
              type="text"
              inputMode="numeric"
              placeholder="Valor (múltiplos de 1.000)"
              value={adventureAmountDisplay}
              onChange={e => setAdventureAmountDisplay(formatarNumero(e.target.value))}
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAdventureModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmAdventure}>Pagar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CASCUDO / ADVENTURE EXPRESS */}
      {cascudoModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
            <h3>{cascudoModal.emoji} {cascudoModal.name}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '10px 0' }}>
              {cascudoModal.effect === 'adventurex'
                ? <>O cartão paga <strong>60%</strong> do valor que você deve e a pessoa recebe o <strong>valor integral</strong>.</>
                : <>Você paga <strong>40% a menos</strong> e a pessoa recebe o <strong>valor integral</strong>.</>}
            </p>
            <select className="input-field" value={cascudoReceiverId} onChange={e => setCascudoReceiverId(e.target.value)} style={{ textAlign: 'left' }}>
              <option value="" disabled>Quem vai receber?</option>
              {playerReceiversForAdventure.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <input
              className="input-field"
              type="text"
              inputMode="numeric"
              placeholder="Valor total (múltiplos de 1.000)"
              value={cascudoAmountDisplay}
              onChange={e => setCascudoAmountDisplay(formatarNumero(e.target.value))}
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setCascudoModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmCascudo}>Pagar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal PATRIA CARD */}
      {patriaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
            <h3>{patriaModal.effect === 'deep' ? '🎰 THE DEEP CARD' : '🏛️ PATRIA EXPRESS'}</h3>
            {patriaModal.effect === 'deep' ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '10px 0' }}>
                Você digita o valor do <strong>Imposto (Férias)</strong> e paga <strong>25% a menos</strong>. O Governo recebe o valor integral.
              </p>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '10px 0' }}>
                Você digita o valor do <strong>Imposto (Férias)</strong> e o <strong>Banco paga no seu lugar</strong>. Nada sai do seu saldo.
              </p>
            )}
            <input
              className="input-field"
              type="text"
              inputMode="numeric"
              placeholder="Valor do imposto (múltiplos de 1.000)"
              value={patriaAmountDisplay}
              onChange={e => setPatriaAmountDisplay(formatarNumero(e.target.value))}
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPatriaModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmPatria}>{patriaModal.effect === 'deep' ? 'Pagar' : 'Isentar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CAVEIRA CARD */}
      {jailModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
            <h3>💀 CAVEIRA CARD</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '10px 0' }}>
              Quem vai para a <strong>cadeia</strong>? <br/>⚠️ Por 2 rodadas ele <strong>não recebe pagamentos</strong>.
            </p>
            <select className="input-field" value={jailReceiverId} onChange={e => setJailReceiverId(e.target.value)} style={{ textAlign: 'left' }}>
              <option value="" disabled>Quem vai para a cadeia?</option>
              {jailCandidates.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setJailModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmJail}>Prender</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação */}
      {confirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
            <h3>Confirmar Transferência</h3>
            <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--primary)', margin: '12px 0' }}>M$ {pixAmount.toLocaleString('pt-BR')}</p>
            <p style={{ color: 'var(--text-muted)' }}>Para: <strong style={{ color: 'var(--text-main)' }}>{selectedReceiver?.username}</strong></p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmModal(false)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handlePix}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal compra de imóvel */}
      {buyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center' }}>
            <h3>Comprar Imóvel</h3>
            <p style={{ fontWeight: 'bold', fontSize: '16px', margin: '8px 0' }}>{buyModal.description}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{buyModal.numHouses > 0 ? `${buyModal.numHouses} casa(s)/hotel` : 'Terreno'} · Vendedor: {buyModal.sellerName}</p>
            <p style={{ fontSize: '26px', fontWeight: 'bold', color: 'var(--primary)', margin: '16px 0' }}>M$ {buyModal.askingPrice.toLocaleString('pt-BR')}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setBuyModal(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleBuyProperty(buyModal)}>💳 Comprar Agora (Pix)</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Comprovante */}
      {receiptTx && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass animate-slide-up" style={{ width: '90%', maxWidth: '380px', textAlign: 'center', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--primary)' }}>🧾 Comprovante Pix</h3>
            <div style={{ borderBottom: '2px dashed #e2e8f0', padding: '8px 0', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Protocolo #{receiptTx.id}</span>
            </div>
            <div style={{ textAlign: 'left', fontSize: '14px' }}>
              <p style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>De quem:</span>
                <strong>{receiptTx.sender}</strong>
              </p>
              <p style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Para quem:</span>
                <strong>{receiptTx.receiver}</strong>
              </p>
              <p style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Quando:</span>
                <strong>{new Date(receiptTx.timestamp).toLocaleString('pt-BR')}</strong>
              </p>
              <p style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Hora:</span>
                <strong>{new Date(receiptTx.timestamp).toLocaleTimeString('pt-BR')}</strong>
              </p>
              <p style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Valor:</span>
                <span style={{ fontWeight: 'bold', fontSize: '20px', color: 'var(--primary)' }}>M$ {receiptTx.amount.toLocaleString('pt-BR')}</span>
              </p>
              <p style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                <strong>{statusLabel(receiptTx.status)}</strong>
              </p>
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={() => setReceiptTx(null)}>Concluído</button>
          </div>
        </div>
      )}

      {/* ====== ABA EXTRATO ====== */}
      {activeTab === 'extrato' && (
        <div className="glass">
          <h3><ScrollText size={20} style={{ verticalAlign: 'middle' }}/> Seu Extrato</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhuma transação ainda.</p>}
            {history.map(tx => {
              const isSender = tx.sender === user.username;
              return (
                <div key={tx.id}
                  onClick={() => setReceiptTx(tx)}
                  style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', transition: '0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontWeight: '600' }}>
                      {isSender ? `↑ Para ${tx.receiver}` : `↓ De ${tx.sender}`}
                    </div>
                    <span style={{ fontWeight: 'bold', fontSize: '18px', color: isSender ? 'var(--danger)' : 'var(--success)' }}>
                      {isSender ? '-' : '+'} M$ {tx.amount.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    🕐 {new Date(tx.timestamp).toLocaleString('pt-BR')} · Status: {statusLabel(tx.status)}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--primary)', fontWeight: '600' }}>
                    🧾 Toque para ver o comprovante completo
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====== ABA EMPRÉSTIMOS ====== */}
      {activeTab === 'emprestimo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass">
            <h3><HandCoins size={20} style={{ verticalAlign: 'middle' }}/> Solicitar Empréstimo</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Peça até <strong>50% do seu saldo atual</strong>. O banco cobra <strong>50% de juros</strong>, descontado após 6 rodadas.</p>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Limite Máximo Disponível:</span>
              <strong style={{ color: user.balance * 0.5 > 0 ? 'var(--success)' : 'var(--danger)' }}>
                M$ {Math.max(0, user.balance * 0.5).toLocaleString('pt-BR')}
              </strong>
            </div>
            {user.balance * 0.5 <= 0
              ? <p style={{ color: 'var(--danger)', fontSize: '14px' }}>Seu saldo está negativo. Não é possível solicitar empréstimo.</p>
              : (
              <form onSubmit={handleTakeLoan}>
                <input
                  className="input-field"
                  type="text"
                  inputMode="numeric"
                  placeholder={`Máximo: M$ ${Math.max(0, user.balance * 0.5).toLocaleString('pt-BR')}`}
                  value={loanDisplay}
                  onChange={e => setLoanDisplay(formatarNumero(e.target.value))}
                  required
                />
                {loanAmount > 0 && (
                  <div style={{ background: '#fff0f0', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Você recebe agora:</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>+ M$ {loanAmount.toLocaleString('pt-BR')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Devolve em 6 rodadas:</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>- M$ {(loanAmount * 1.5).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                )}
                {loanAmount > user.balance * 0.5 && loanAmount > 0 && (
                  <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '8px' }}>⚠️ Valor excede o seu limite! Só é possível pedir até M$ {Math.max(0, user.balance * 0.5).toLocaleString('pt-BR')}.</p>
                )}
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={loanAmount > user.balance * 0.5 || loanAmount <= 0 || loanAmount % 1000 !== 0}
                  style={{ opacity: loanAmount > user.balance * 0.5 || loanAmount <= 0 || loanAmount % 1000 !== 0 ? 0.5 : 1 }}
                >Solicitar Empréstimo</button>
              </form>
            )}
          </div>

          {loans.length > 0 && (
            <div className="glass" style={{ border: '2px solid #fecaca', background: '#fff5f5' }}>
              <h3 style={{ color: '#991b1b' }}>⚠️ Suas Dívidas Ativas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {loans.map(l => (
                  <div key={l.id} style={{ background: 'white', padding: '14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Valor do empréstimo:</span>
                      <strong>M$ {l.amount.toLocaleString('pt-BR')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total a devolver:</span>
                      <strong style={{ color: 'var(--danger)' }}>M$ {l.totalToPay.toLocaleString('pt-BR')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Rodadas restantes:</span>
                      <strong style={{ color: l.roundsLeft <= 2 ? 'var(--danger)' : '#d97706' }}>{l.roundsLeft} rodadas</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== ABA MERCADO ====== */}
      {activeTab === 'mercado' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Formulário de venda */}
          <div className="glass">
            <h3><Tag size={20} style={{ verticalAlign: 'middle' }}/> Anunciar Propriedade</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
              O banco compra por <strong>50% do valor pedido</strong>. O anúncio precisa ser aprovado pelo Admin antes de aparecer para outros jogadores.
            </p>
            <form onSubmit={handleSellProperty}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px' }}>Descrição da Propriedade</label>
              <input className="input-field" type="text" placeholder="Ex: Avenida Paulista com 2 casas" value={propertyDesc} onChange={e => setPropertyDesc(e.target.value)} required />
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px' }}>Nº de Casas / Hotéis</label>
              <input className="input-field" type="number" min="0" max="5" placeholder="0 = terreno, 1–4 casas, 5 hotel" value={propertyHouses} onChange={e => setPropertyHouses(e.target.value)} />
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '6px' }}>Valor Pedido</label>
              <input
                className="input-field"
                type="text"
                inputMode="numeric"
                placeholder="Ex: 1.000.000"
                value={propertyPriceDisplay}
                onChange={e => setPropertyPriceDisplay(formatarNumero(e.target.value))}
                required
              />
              {propertyPrice > 0 && (
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Você pede:</span>
                    <strong>M$ {propertyPrice.toLocaleString('pt-BR')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Banco oferece (50%):</span>
                    <strong style={{ color: 'var(--primary)' }}>M$ {(propertyPrice * 0.5).toLocaleString('pt-BR')}</strong>
                  </div>
                </div>
              )}
              <button className="btn-primary" type="submit">Enviar para Admin</button>
            </form>
          </div>

          {/* Meus anúncios */}
          {myListings.length > 0 && (
            <div className="glass">
              <h3>Meus Anúncios</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {myListings.map(p => (
                  <div key={p.id} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                    <div style={{ fontWeight: 'bold' }}>{p.description}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {p.numHouses > 0 ? `${p.numHouses} casa(s)/hotel` : 'Terreno'} · M$ {p.askingPrice.toLocaleString('pt-BR')}
                    </div>
                    <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', background: p.status === 'active' ? '#dcfce7' : '#fef9c3', color: p.status === 'active' ? '#166534' : '#713f12' }}>
                      {statusLabel(p.status)}
                    </span>
                    <button className="btn-secondary" style={{ marginTop: '10px', width: '100%', color: 'var(--danger)', background: '#fee2e2' }} onClick={() => handleDeleteListing(p)}>
                      🗑️ Excluir Anúncio
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Histórico de Vendas */}
          <div className="glass">
            <h3><Clock size={20} style={{ verticalAlign: 'middle' }}/> Histórico de Vendas</h3>
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

          {/* Imóveis de outros para comprar */}
          <div className="glass">
            <h3><ShoppingCart size={20} style={{ verticalAlign: 'middle' }}/> Imóveis Disponíveis</h3>
            {market.length === 0
              ? <p style={{ color: 'var(--text-muted)' }}>Nenhum imóvel à venda no momento.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {market.map(p => (
                    <div key={p.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', transition: '0.2s' }}
                      onClick={() => setBuyModal(p)}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{p.description}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        {p.numHouses > 0 ? `${p.numHouses} casa(s)/hotel` : 'Terreno'} · Vendedor: {p.sellerName}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '20px', color: 'var(--primary)' }}>M$ {p.askingPrice.toLocaleString('pt-BR')}</span>
                        <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: '13px' }}>Comprar</button>
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
