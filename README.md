# A Game of Thrones: The Board Game (2ª edição)

Implementação em React + TypeScript das regras oficiais da 2ª edição, jogável em
**https://mjf30.github.io/got-board-game/**

## Modos de jogo

### 🪑 Local (hot-seat)
Todos os jogadores na mesma tela, passando o controle. 3 a 6 casas.

### 🌐 Online com amigos (P2P, sem servidor)
- O jogo continua 100% hospedado no GitHub Pages — a conexão entre os jogadores é
  **P2P via WebRTC** ([Trystero](https://github.com/dmotz/trystero)), sem servidor próprio e sem conta.
- Um jogador clica em **Criar sala** e compartilha o código de 5 letras; os demais entram com o código.
- O criador da sala é o **host**: o navegador dele roda o motor do jogo e valida as ações
  (mantenha a aba aberta!). Se o host recarregar a página, dá para **retomar a sala** —
  a partida fica salva no navegador dele.
- Um jogador pode controlar mais de uma casa (útil com menos amigos que casas).
- Informação oculta (ordens viradas para baixo, lances, carta de combate) é escondida na
  interface de cada jogador. Como é P2P entre amigos, a confiança é o anti-cheat. 🙂

## Desenvolvimento

```bash
npm install
npm run dev     # servidor local (vite)
npm test        # suite de regras (vitest)
npm run build   # build de produção
```

O deploy no GitHub Pages é automático a cada push na `main` (GitHub Actions).

## Estrutura

- `src/game/` — motor de regras puro (estado imutável): `engine.ts`, `combat.ts`, `supply.ts`, `setup.ts`, `constants/`
- `src/net/` — multiplayer: `actions.ts` (ações serializáveis / reducer) e `online.ts` (sessão P2P)
- `src/components/` — interface React
- `src/game/__tests__/` — testes das regras contra o rulebook oficial (incluído no repositório em PDF)
