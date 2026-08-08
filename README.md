# Banco Imobiliário 🏦

Jogo de tabuleiro online (Pix, Casas, Empréstimos, Imposto de Férias) feito com
**React (Vite)** no frontend e **Node.js + Socket.IO + SQLite** no backend.

## Rodar localmente (para testar)

```bash
# 1) Backend (porta 3001)
cd backend
npm install
node server.js

# 2) Frontend (em OUTRO terminal)
cd frontend
npm install
npm run dev
# abre em http://localhost:5173  -> admin: admin / 1234
```

## 🚀 Publicar online para jogar com os amigos

O jogo precisa de um servidor sempre ligado (Socket.IO + banco SQLite), por isso
**não funciona no GitHub Pages nem na Vercel como só frontend**. O jeito mais
fácil é subir TUDO num único host: **Railway** (gratuito pra começar).

### Passo a passo no Railway (recomendado — 1 url só)

1. Crie conta em https://railway.app (logar com GitHub)
2. **New Project → Deploy from GitHub repo** → escolha `bancoimobiliario`
3. Em **Settings** do serviço defina:
   - **Root Directory**: `backend`
   - depois rode `npm run build` no `frontend` (os arquivos ficam em `frontend/dist`, que o backend serve sozinho)
4. Railway gera uma URL tipo `https://bancoimobiliario-production.up.railway.app`
5. Mande essa URL pros seus amigos 💸

> **Importante**: o site (frontend) precisa ser compilado. No Railway, use esses
> **Build Command** e **Start Command**:
> ```
> Build:   cd ../frontend && npm ci && npm run build && cd ../backend && npm ci
> Start:   node server.js
> ```
> Ou, se preferir comodidade, use o **Render** (https://render.com) seguindo o
> mesmo esquema: Build Command = `cd ../frontend && npm ci && npm run build && cd ../backend && npm ci`, Start Command = `node server.js`.

### Alternativa: Frontend na Vercel + Backend no Railway

1. Deploy o **backend** no Railway (só `node server.js`, como acima) e copie a URL (ex: `https://xyz.up.railway.app`)
2. No **Vercel**, importe o repo, em **Root Directory** escolha `frontend`
3. Em **Environment Variables** adicione:
   `VITE_API_URL = https://xyz.up.railway.app`
4. Feito!

## Firebase (opcional)

O app já vem configurado para espelhar os dados no **Cloud Firestore** do projeto
`bancomobli`. Só precisa criar o banco no Console do Firebase. Veja
[firebase/README.md](firebase/README.md).

## Segurança

- `backend/banco.sqlite`, `.env` e `node_modules` **não** são commitados.
- As senhas dos jogadores ficam em texto puro no SQLite (ok pra jogo casual).