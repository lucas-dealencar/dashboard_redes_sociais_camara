# Front-end do dashboard — Câmara nas Redes

React 18 + TypeScript + Vite. Gráficos em SVG próprio (Design System "Câmara nas Redes").
Lê os JSONs que o pipeline Python publica em `../docs/dados/`; o build é gravado em `../docs/` (GitHub Pages).

```powershell
cd frontend
npm install        # uma vez (Node 18+)
npm run dev        # http://localhost:5173 — serve ../docs/dados em /dados
npm run build      # typecheck + ../docs/index.html e ../docs/assets/{js,css,img}
```

Depois do build, commite `frontend/` e `docs/index.html` + `docs/assets/` juntos. `docs/dados/` não é tocado pelo build.
Para conferir o resultado final: `python -m http.server -d docs` (na raiz) e abra http://localhost:8000.

## Arquitetura
```
src/
  types.ts           modelos internos + metadados do pipeline (espelho do contrato JSON)
  data/
    source.ts        PipelineDataSource: manifest → benchmark, dicionário, anotações → partições mensais
    catalog.ts       cor/sigla por rede; KPI e disponibilidade vêm do benchmark.json; formatos
  domain/            regras puras: agregação diária, KPIs, variação, benchmark, picos, narrativa
  state/store.tsx    filtros, anotações e reclassificações locais (localStorage)
  components/, tabs/ Layout, cartões, gráficos; abas Visão geral, Evolução, Conteúdos, Público
  utils/export.ts    CSV, XLSX e PNG
```

## Mapeamento dos dados
| Pipeline | Front |
|---|---|
| `manifest.periodo.fim`, 1ª partição | calendário (dia 0 = 1º dia da 1ª partição) |
| `publicacoes/AAAA-MM.json` | `Post` (id = link) |
| `engajamento` + `engajamento_completo` | engajamento (incompleto → n/d) |
| `taxa_engajamento` + `denominador_tipo` | taxa e base por publicação |
| `benchmark.kpi_por_rede` / `cobertura` | KPI principal (substituto sinalizado) e métricas disponíveis por rede |
| `benchmark.janela_dias` / `alternativas` | janela padrão e opções do benchmark |
| `dicionario_metricas.json`, `manifest.limitacoes` | Metodologia |
| `anotacoes.json` | anotações editoriais (+ as criadas no navegador) |

Ainda sem fonte (exibidos como indisponíveis): seguidores, visualizações, hora, duração/retenção de vídeo, campanha, orgânico/pago, vínculo de pauta e público demográfico.
