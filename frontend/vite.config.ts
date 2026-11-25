import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, normalize, sep } from 'node:path';

/**
 * Build: gera o site estático em ../docs (GitHub Pages), ao lado de ../docs/dados.
 *   docs/index.html · docs/assets/js/app.js · docs/assets/css/app.css · docs/assets/img/*
 * docs/dados/ é do pipeline Python e NUNCA é apagado aqui (emptyOutDir: false).
 * Nomes fixos (sem hash) para o diff do git ficar estável a cada build.
 */
const DOCS = resolve(__dirname, '../docs');
const DADOS = resolve(DOCS, 'dados');

/** No `npm run dev`, serve /dados/* direto de ../docs/dados (mesmo caminho relativo da produção). */
function servirDados(): Plugin {
  return {
    name: 'servir-docs-dados',
    configureServer(server) {
      server.middlewares.use('/dados', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const arq = normalize(resolve(DADOS, '.' + rel));
        if (!arq.startsWith(DADOS + sep) || !existsSync(arq) || !statSync(arq).isFile()) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        createReadStream(arq).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), servirDados()],
  base: './',
  publicDir: false,
  build: {
    chunkSizeWarningLimit: 800, // app.js inclui o mapa do Brasil (aba Público)
    outDir: DOCS,
    emptyOutDir: false,
    assetsDir: 'assets',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/app.js',
        chunkFileNames: 'assets/js/[name].js',
        assetFileNames: (info) => {
          const nome = info.names?.[0] ?? info.name ?? '';
          if (nome.endsWith('.css')) return 'assets/css/app.css';
          return 'assets/img/[name][extname]';
        },
      },
    },
  },
});
