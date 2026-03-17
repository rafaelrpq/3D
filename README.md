# Three.js Game Starter Table

Este é um ambiente de desenvolvimento base para criação de jogos 3D com Three.js.

## Tecnologias
- **Vite**: Ferramenta de build rápida e moderna.
- **Three.js**: Biblioteca principal para renderização 3D.
- **Vanilla JS & CSS**: Sem frameworks pesados para máxima performance.

## Como rodar localmente
1. Instale as dependências: `npm install`
2. Inicie o servidor de desenvolvimento: `npm run dev`
3. Abra `http://localhost:5173` no seu navegador.

## Como fazer o Deploy

### GitHub Pages (Recomendado)
A configuração básica já está no `vite.config.js`.

1. Crie um repositório no GitHub.
2. Adicione este projeto como um repositório git.
3. Use o comando `npm run build`.
4. Faça o upload da pasta `dist/` para a branch `gh-pages` ou configure as [GitHub Actions](https://vitejs.dev/guide/static-deploy.html#github-pages) para fazer o build automático.

### Firebase Hosting
1. Instale o CLI do Firebase: `npm install -g firebase-tools`
2. Inicialize o projeto: `firebase init`
    - Escolha **Hosting**.
    - Defina a pasta pública como `dist`.
    - Configure como um Single Page App.
3. Faça o deploy: `npm run build && firebase deploy`

---

Desenvolvido por Antigravity.
