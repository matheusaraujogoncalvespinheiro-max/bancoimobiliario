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

### Passo a passo no Railway (recomendado — 1 url só, sem build)

O site já vem **compilado** em `frontend/dist`, então o Railway roda **só o
backend** (sem etapa de build):

1. Crie conta em https://railway.app (logar com GitHub)
2. **New Project → Deploy from GitHub repo** → escolha `bancoimobiliario`
3. Em **Settings** do serviço:
   - **Root Directory**: `backend`
   - **Build Command**: deixe em branco
   - **Start Command**: `node server.js`
4. Pronto! O Railway vai gerar um link tipo
   `https://bancoimobiliario-production.up.railway.app` — mande esse link pros
   seus amigos 💸

> **Quando você mudar algo no código** (frontend ou backend), rode local:
> `cd frontend && npm run build` — o site atualizado vai junto no commit.
> Se preferir, tem o **Render** (render.com) com a mesma configuração:
> Root Directory `backend`, Start `node server.js`.

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