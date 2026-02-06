# GeoSumo 🎮🟩

## Descrição
**GeoSumo** é um jogo experimental de arena com estética geométrica e renderização WebGL (shaders GLSL). O projeto é escrito em JavaScript moderno, usa **Vite** para desenvolvimento e build, e emprega `gl-matrix` para operações vetoriais/matrizes.

---

## Sumário
- ✅ Objetivo
- 🧩 Estrutura do repositório
- ⚙️ Tecnologias
- 🚀 Como rodar (dev / build / preview)
- 🛠️ Notas de desenvolvimento importantes
- 🤝 Contribuição
- ❗ Problemas comuns & dicas

---

## Objetivo
Criar um jogo leve, modular e fácil de estender que sirva como base para experimentos em física simples, comportamento de IA e shaders personalizados.

---

## Recursos principais
- Renderização com shaders customizados (`.vert`, `.frag`) 🔥
- Sistema de entidades e física básico (arena, players, enemies) ⚖️
- Estrutura modular (engine / game / shaders) para fácil evolução 🧱

---

## Estrutura do repositório
- `index.html` — ponto de entrada web
- `src/` — bootstrap do app (`main.js`, `style.css`, etc.)
- `engine/` — motor básico
  - `Camera.js`, `Input.js`, `Renderer.js`, `MathUtils.js` — utilitários e abstrações de render
- `game/` — lógica do jogo
  - `Arena.js`, `Player.js`, `Enemy.js`, `Physics.js`, `EntityRenderer.js` — entidades e regras
- `shaders/` — arquivos GLSL (`*.vert`, `*.frag`)
- `data/` — arquivos de configuração/uso (ex: `Customization.js`)
- `package.json` — scripts e dependências

---

## Requisitos
- Node.js (recomendado >= 18)
- npm ou yarn
- Navegador moderno com WebGL2

---

## Scripts úteis
No terminal, na raiz do projeto:

- Desenvolvimento com hot-reload:

```bash
npm install
npm run dev
# abre: http://localhost:5173 (ou porta mostrada)
```

- Build para produção:

```bash
npm run build
```

- Visualizar build localmente (preview):

```bash
npm run preview
```

> Nota: o `package.json` usa `vite` (`dev`, `build`, `preview`).

---

## Servir com XAMPP / Apache
Se quiser servir pela instalação do XAMPP (útil para testes de deploy local):

1. `npm run build`
2. Copie o conteúdo de `dist/` para `htdocs/geosumo` (ou o diretório desejado)
3. Acesse `http://localhost/geosumo/`

---

## Boas práticas de desenvolvimento
- Modifique shaders em `shaders/` e use o dev server para ver atualizações.
- Mantenha lógica de render em `engine/` e regras/estado em `game/` para melhor separação.
- Para debugging de GL, use extensões como "WebGL Inspector" e os devtools do navegador.

---

## Performance & Debug
- Limite chamadas de draw, minimize trocas de shader e atualize buffers apenas quando necessário.
- Use `gl-matrix` para operações matriciais/vetoriais eficientes.
- Perfis: use a aba Performance do Chrome/Edge para frame timings.

---

## Controle de versão (.gitignore)
Já foi adicionado um `.gitignore` cobrindo `node_modules/`, `dist/`, caches do Vite, arquivos de ambiente e editores.
Se esses diretórios já estiverem no repositório, remova-os do índice:

```bash
git rm -r --cached node_modules dist
git commit -m "Remove node_modules and dist from repo"
```

---

## Contribuição
- Fork → branch de feature → PR com descrição clara
- Use commits pequenos e descritivos
- Abra issue para bugs/feature requests e referencie PRs

---

## Possíveis melhorias (backlog)
- Suite de testes unitários (Jest / Vitest)
- Linters e formatação (ESLint + Prettier)
- Sistema de níveis / UI minimal
- Exportador de replay simples (JSON)

---

## Licença
Adicione uma `LICENSE` conforme desejado (MIT é uma escolha comum para projetos open-source).

---

Se quiser, eu também:
- adiciono badges (build, license) ao topo, ✅
- crio templates de issue/PR, ✅
- configuro ESLint/Prettier e um script `npm test`. ✅

> Quer que eu comece por algum desses? 🔧