import { useState } from 'react';
import { LogIn } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        onLogin(data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor. Certifique-se de que o backend está rodando.');
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-box animate-slide-up">
        <h2 style={{ textAlign: 'center', marginBottom: '8px', color: 'var(--primary)' }}>Banco Imobiliário</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '32px' }}>Acesse sua conta para jogar</p>
        
        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px', textAlign: 'center', fontWeight: '500' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Nome (Cartão)</label>
            <input
              className="input-field"
              style={{ marginBottom: '0' }}
              type="text"
              placeholder="Digite seu nome"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Senha</label>
            <input
              className="input-field"
              style={{ marginBottom: '0' }}
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn-primary" type="submit">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
