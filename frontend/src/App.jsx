import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Login from './components/Login';
import AdminPanel from './components/AdminPanel';
import PlayerDashboard from './components/PlayerDashboard';
import { syncUser } from './services/firebase';
import { SOCKET_URL } from './config';
import { Bell, X } from 'lucide-react';

const socket = io(SOCKET_URL);

// Som de dinheiro via Web Audio API
function playMoneySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1047, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(2093, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function App() {
  const [user, setUser] = useState(null);
  const [notification, setNotification] = useState(null);
  const [notifList, setNotifList] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifTimeout = useRef(null);

  const pushNotif = (type, title, message) => {
    const item = { id: Date.now(), type, title, message, time: new Date().toLocaleTimeString('pt-BR') };
    setNotifList(prev => [item, ...prev].slice(0, 30));
    setNotification({ type, title, message });
    if (notifTimeout.current) clearTimeout(notifTimeout.current);
    notifTimeout.current = setTimeout(() => setNotification(null), 5000);
  };

  const handleLogout = () => {
    socket.emit('leave');
    setUser(null);
  };

  useEffect(() => {
    if (user) socket.emit('join', user.id);
  }, [user]);

  useEffect(() => {
    if (user) syncUser(user);
  }, [user]);

  useEffect(() => {
    socket.on('pix_received', (data) => {
      playMoneySound();
      setUser(prev => prev ? { ...prev, balance: data.newBalance ?? prev.balance } : prev);
      pushNotif('success', '💸 Transferência Recebida', `+M$ ${Number(data.amount).toLocaleString('pt-BR')} de ${data.from}`);
    });

    socket.on('pix_success', (data) => {
      setUser(prev => prev ? { ...prev, balance: data.newBalance ?? prev.balance } : prev);
      pushNotif('success', '✅ Pix Enviado', `M$ ${Number(data.amount).toLocaleString('pt-BR')} para ${data.to || 'destino'}`);
    });

    socket.on('loan_approved', (data) => {
      playMoneySound();
      setUser(prev => prev ? { ...prev, balance: data.newBalance ?? prev.balance } : prev);
      pushNotif('success', '🏦 Empréstimo Aprovado', `+M$ ${Number(data.amount).toLocaleString('pt-BR')} (devolve M$ ${Number(data.totalToPay).toLocaleString('pt-BR')} em 6 rodadas)`);
    });

    socket.on('debt_collected', (data) => {
      setUser(prev => prev ? { ...prev, balance: data.newBalance ?? prev.balance } : prev);
      pushNotif('error', '💳 Dívida Cobrada', `-M$ ${Number(data.amount).toLocaleString('pt-BR')} (empréstimo vencido)`);
    });

    socket.on('ferias_charged', (data) => {
      setUser(prev => prev ? { ...prev, balance: data.newBalance ?? prev.balance } : prev);
      pushNotif('error', '🏖️ Férias Coletadas', `Pote de Férias (todos os jogadores): -M$ ${Number(data.amount).toLocaleString('pt-BR')}`);
    });

    socket.on('property_sold', (data) => {
      playMoneySound();
      setUser(prev => prev ? { ...prev, balance: data.newBalance ?? prev.balance } : prev);
      pushNotif('success', '🏠 Imóvel Vendido!', `${data.property || 'Seu imóvel'} foi vendido por +M$ ${Number(data.amount).toLocaleString('pt-BR')}`);
    });

    socket.on('ferias_updated', (data) => {
      window.dispatchEvent(new CustomEvent('ferias_updated', { detail: data.balance }));
    });

    socket.on('pix_error', (msg) => {
      pushNotif('error', '❌ Erro', msg);
    });

    socket.on('bankrupt', () => {
      setUser(prev => prev ? { ...prev, isBankrupt: 1 } : prev);
      pushNotif('error', '☠️ FALÊNCIA!', 'Seu saldo chegou a -1.5M. Você está eliminado.');
    });

    socket.on('card_use_approved', (data) => {
      pushNotif('success', '🃏 Uso autorizado!', `O Admin autorizou o uso do ${data.cardName}.`);
    });

    socket.on('jail_sent', (data) => {
      pushNotif('error', '⛓️ CADEIA!', `${data.by} te prendeu por ${data.rounds} rodadas. Você não pode receber pagamentos enquanto estiver preso.`);
    });

    socket.on('jail_released', () => {
      pushNotif('success', '🔓 Você saiu da cadeia!', 'Agora você pode receber pagamentos novamente.');
    });

    socket.on('game_reset', () => {
      setUser(prev => {
        if (prev && prev.role !== 'admin') return null;
        return prev;
      });
      setNotifList([]);
      setShowNotifPanel(false);
      pushNotif('error', '🔄 Jogo Zerado', 'O admin começou um novo jogo. Faça login novamente.');
    });

    return () => {
      socket.off('pix_received');
      socket.off('pix_success');
      socket.off('loan_approved');
      socket.off('debt_collected');
      socket.off('ferias_charged');
      socket.off('property_sold');
      socket.off('ferias_updated');
      socket.off('pix_error');
      socket.off('bankrupt');
      socket.off('card_use_approved');
      socket.off('jail_sent');
      socket.off('jail_released');
      socket.off('game_reset');
    };
  }, []);

  const unreadCount = notifList.length;

  return (
    <>
      {/* Notificação Push (cai do topo) */}
      {notification && (
        <div className={`notification ${notification.type === 'error' ? 'notification-error' : ''}`}>
          <div className="notification-icon">
            {notification.type === 'error' ? '❗' : '💸'}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '14px' }}>{notification.title}</strong>
            <span style={{ fontSize: '13px', color: notification.type === 'error' ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
              {notification.message}
            </span>
          </div>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px' }}>✕</button>
        </div>
      )}

      {/* Sino de Notificações */}
      {user && (
        <button
          onClick={() => setShowNotifPanel(p => !p)}
          style={{
            position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom))', right: '16px',
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--primary)', color: 'white',
            border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(138,5,190,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999, fontSize: '24px', transition: 'transform 0.2s'
          }}
        >
          🔔
          {notifList.length > 0 && (
            <span style={{
              position: 'absolute', top: '4px', right: '4px',
              background: 'var(--danger)', color: 'white',
              borderRadius: '50%', width: '20px', height: '20px',
              fontSize: '11px', fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {notifList.length > 9 ? '9+' : notifList.length}
            </span>
          )}
        </button>
      )}

      {/* Painel de Notificações */}
      {showNotifPanel && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(90px + env(safe-area-inset-bottom))',
          right: '16px',
          width: 'min(320px, calc(100vw - 32px))',
          maxHeight: '55vh', overflowY: 'auto',
          background: 'white', borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 998,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white' }}>
            <strong>Notificações</strong>
            <button onClick={() => { setNotifList([]); setShowNotifPanel(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}>Limpar tudo</button>
          </div>
          {notifList.length === 0
            ? <p style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center' }}>Sem notificações</p>
            : notifList.map(n => (
              <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ background: n.type === 'error' ? '#fee2e2' : '#dcfce7', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '32px', fontSize: '14px' }}>
                  {n.type === 'error' ? '❗' : '✅'}
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '13px' }}>{n.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{n.message}</div>
                  <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '2px' }}>{n.time}</div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {!user ? (
        <Login onLogin={setUser} />
      ) : user.role === 'admin' ? (
        <AdminPanel socket={socket} onLogout={handleLogout} />
      ) : (
        <PlayerDashboard user={user} setUser={setUser} socket={socket} onLogout={handleLogout} />
      )}
    </>
  );
}

export default App;
