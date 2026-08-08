import { useState, useEffect } from 'react';
import { LogOut, Send, PiggyBank, Landmark, ScrollText, HandCoins, Store, Tag, ShoppingCart, Home } from 'lucide-react';
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

export default function PlayerDashboard({ user, setUser, socket, onLogout }) {
  const [activeTab, setActiveTab] = useState('home');
  const [allUsers, setAllUsers] = useState([]); // todos (jogadores + sistema)
  const [feriasBalance, setFeriasBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [market, setMarket] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loans, setLoans] = useState([]);

  // Transferência
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [amountDisplay, setAmountDisplay] = useState('');
  const [confirmModal, setConfirmModal] = useState(false);

  // Compra de imóvel
  const [buyModal, setBuyModal] = useState(null); // property object

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
        const ferias = data.users.find(u => u.username === 'Férias');
        if (ferias) setFeriasBalance(ferias.balance);
        // Atualizar saldo do próprio user
        const me = data.users.find(u => parseInt(u.id) === uid);
        if (me) setUser(prev => ({ ...prev, balance: me.balance }));
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
      const [mRes, meRes] = await Promise.all([
        fetch(`${API_URL}/api/market`),
        fetch(`${API_URL}/api/market/mine/${user.id}`)
      ]);
      const mData = await mRes.json();
      const meData = await meRes.json();
      if (Array.isArray(mData)) {
        setMarket(mData.filter(p => parseInt(p.sellerId) !== uid));
        mData.forEach(p => syncMarket(p));
      }
      if (Array.isArray(meData)) {
        setMyListings(meData);
        meData.forEach(p => syncMarket(p));
      }
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

  useEffect(() => {
    fetchData(); fetchHistory(); fetchMarket(); fetchLoans();
    socket.on('game_updated', () => { fetchData(); fetchHistory(); fetchLoans(); });
    socket.on('market_updated', () => fetchMarket());
    socket.on('ferias_updated', (data) => { setFeriasBalance(data.balance ?? 0); });
    return () => {
      socket.off('game_updated');
      socket.off('market_updated');
      socket.off('ferias_updated');
    };
  }, [socket]);

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
  const playerReceivers = allUsers.filter(u => u.role === 'player');
  // Contas de sistema
  const bancoUser = allUsers.find(u => u.username === 'Banco');
  const feriasUser = allUsers.find(u => u.username === 'Férias');

  const handlePix = () => {
    if (!selectedReceiver || pixAmount <= 0) return;
    if (pixAmount % 1000 !== 0) return alert('Transferências apenas em múltiplos de 1.000!');
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
    if (user.balance < prop.askingPrice) return alert('Saldo insuficiente!');
    socket.emit('buy_property', { buyerId: uid, propertyId: prop.id });
    setBuyModal(null);
  };

  const statusLabel = (status) => ({
    pending_admin: '⏳ Aguardando aprovação',
    active: '✅ Publicado',
    sold: '✔️ Vendido',
    canceled: '❌ Cancelado'
  }[status] || status);

  const tabs = [
    ['home', '💳 Pix'],
    ['casas', '🏠 Comprar Casa'],
    ['extrato', '📄 Extrato'],
    ['emprestimo', '💰 Empréstimos'],
    ['mercado', '🏘️ Mercado'],
  ];

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

      {/* Cartão */}
      <div className="credit-card" style={{ marginBottom: '24px', width: '100%', maxWidth: '100%' }}>
        <div>
          <div className="card-label">Saldo Disponível</div>
          <h2 className="card-balance" style={{ fontSize: '28px', color: user.balance < 0 ? '#fca5a5' : 'white' }}>
            M$ {user.balance.toLocaleString('pt-BR')}
          </h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div className="card-name">{user.username}</div>
          <Landmark size={28} opacity={0.5} />
        </div>
      </div>

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
              >👤<br/>{u.username}</div>
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
            {bancoUser && (
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
          {bancoUser ? (
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
                <strong>{receiptTx.status}</strong>
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
                    🕐 {new Date(tx.timestamp).toLocaleString('pt-BR')} · Status: {tx.status}
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
                  </div>
                ))}
              </div>
            </div>
          )}

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
