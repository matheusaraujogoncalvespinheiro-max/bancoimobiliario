# Firebase — Banco de Dados do Jogo

Este projeto já tem toda a estrutura pronta para migrar/espelhar os dados para o
**Cloud Firestore**. O app continua 100% funcional com o SQLite local
(`backend/banco.sqlite`); o Firebase funciona em paralelo e já está
**pré-configurado com o projeto `bancomobli`** (as credenciais ficam em
`frontend/.env` e também como padrão em `frontend/src/services/firebase.js`).

## Como ativar (1 único passo)

1. No [Firebase Console](https://console.firebase.google.com), abra o projeto
   **bancomobli** e crie o banco **Cloud Firestore** no modo de teste
   (30 dias, aceita leitura/escrita livre).
2. Depois de criar o banco, faça deploy das regras e índices:

   ```bash
   cd firebase
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes
   ```

3. Suba o frontend normalmente (`npm run dev`). Tudo que acontecer no jogo
   passará a ser espelhado no Firestore.

## Coleções

| Coleção             | Doc Id             | O que guarda                                                                 |
| ------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `users/{id}`         | id do jogador       | username, role, balance, isBankrupt, updatedAt                                 |
| `gameState/main`     | `main`              | round, isStarted, players (snapshot da lista de jogadores)                     |
| `transactions/{id}`  | id da transação     | senderId, receiverId, sender, receiver, amount, timestamp, status            |
| `loans/{id}`         | id do empréstimo    | userId, username, amount, totalToPay, roundsLeft                              |
| `properties/{id}`    | id do imóvel        | sellerId, sellerName, description, numHouses, askingPrice, bankOffer, status  |
| `notifications/{id}` | id do jogador       | notificações pendentes / histórico                                            |

## Como espelhar mais dado manualmente

O serviço live em `frontend/src/services/firebase.js` e exporta:

- `syncToFirestore(coleção, docId, dados)`
- `syncUser(user)`
- `syncGameSnapshot(state, users)`
- `syncTransaction(tx)`
- `syncMarket(property)`
- `syncLoans(loans)`

Importe de qualquer componente e chame a função após cada `fetch` / evento
socket do jogo.

## Observação

O serviço `frontend/src/services/firebase.js` já vem com o projeto `bancomobli`
preenchido, então o espelhamento começa automaticamente assim que o Cloud
Firestore existir no Firebase. Se quiser testar sem Firebase, esvazie
`VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_API_KEY` em `frontend/.env` — o app
volta a rodar normalmente sem chamadas de rede.