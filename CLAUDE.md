# Dashboard Consolidado de Redes Sociais — Câmara dos Deputados

Pipeline Prefect que lê a planilha **Consolidado Redes Sociais - Simplificado** (Google Sheets, ~80 mil linhas), limpa, transforma, agrega e publica JSONs via `git push`. O dashboard estático em `docs/` (GitHub Pages, branch `main`, pasta `/docs`) consome esses JSONs; o código-fonte do front fica em `frontend/` (React + TypeScript + Vite) e o build é gravado em `docs/`. Não há banco nem backend: os JSONs versionados são a fonte do site.

Escopo funcional: ver a proposta "Dashboard integrado de redes sociais" (nov/2026). Redes: Instagram, Facebook, TikTok, X, Threads, Bluesky, LinkedIn (+ YouTube/Shorts, que aparecem na planilha). Abas do dashboard: Visão geral, Evolução e redes, Conteúdos, Público.

## Fluxo

`main.py` (flow Prefect `atualizar_dashboard`) encadeia:

1. `src/coleta.py`: baixa a aba `Consolidado` como CSV numa só requisição (`/export?format=csv&gid=`, `GID_CONSOLIDADO`), com retries. Foto única: edições durante a coleta não deslocam linhas. Grava o bruto em `cache/bruto.parquet`.
2. `src/transformacao/`: limpa e tipa (datas por extenso, percentuais em texto, milhares com ponto), valida, deduplica por `Post - Link` e produz tabelas analíticas.
3. `src/carga.py`: agrega e grava os JSONs em `docs/dados/` (atômico, `.tmp` + `replace`).
4. `src/publicacao.py`: commit só de `docs/dados/`, `pull --rebase --autostash` e `push`.

As anotações editoriais (uma por publicação, chave = link normalizado; e uma por pico, chave `pico:início:fim` do dia, semana ou mês) são **opcionais**: vêm da API do Apps Script (`apps_script/anotacoes.gs`, URL em `config.URL_ANOTACOES` e `frontend/src/data/notes.ts`), gravada pelo front com a senha da equipe numa planilha separada. Se a leitura falhar, o flow segue com aviso e mantém o `anotacoes.json` anterior. A normalização do link existe em três lugares (`_chave_link`, `normalizarLink`, `noteKey`): altere juntos.

## Fonte de dados (aba `Consolidado`)

Formato **longo**: uma linha por post, com a rede em `02 - Rede` (ex.: `Rede X`) e a data em `01 - Data`. Colunas conhecidas:

- **Post**: `Post - Link` (chave), `Post - Descrição`, `Projeto?`, `Rede Local Post`, `Ao vivo?`, `Tipo de mídia`, `Tipo Classificação`, `Subtipo Classificação`, `Autor`, `Tag Brandwatch`.
- **Proposições** (até 2 por post): `Prop N - Sigla`, `Nº Sigla`, `Ano Sigla`, `Ident.`, `link`, `Ementa`, `Tema`.
- **Conta**: `Seguidores acumulado`, `Seguidores Evolução Novos`.
- **Métricas comuns**: `Mtrc - Alcance`, `Compartilhar`, `Comentários`, `Curtidas`.
- **Específicas**: `Instagram - Salvos`; `Stories - *`; `Twitter - Click no link`, `Twitter - Engamento`; `YT & Shorts - *` (impressões, gostei, não gostei, % visualização média, chat).
- **Calculadas na planilha**: `Mtrc/Calc - Interações`, `Taxa Engajamento`, `Repercussão (Corip)`, `Interação/Alcance/Repercussão Composta`.

Armadilhas já observadas (validar sempre com amostra real):

- Data vem por extenso em pt-BR (`11 de dezembro de 2024`), pois o CSV traz o texto formatado: converter com mapa de meses próprio, sem depender de locale.
- Percentuais podem vir como texto (`14%`); números de sigla com separador de milhar (`2.253`). Use `_para_float` / `_para_percentual`.
- **Zero ≠ indisponível ≠ incompleto**: célula vazia vira `NA`, nunca `0`. Cada rede só tem parte das métricas.
- Colunas com typo na origem (`Engamento`, `Storires`): mapeie por nome exato em `config/colunas.py`; não "corrija" na leitura.
- A planilha é a fonte de verdade e é somente leitura para o pipeline. Não escreva nela.

## Regras de negócio (da proposta)

- Engajamento básico = curtidas/reações + comentários/respostas + compartilhamentos/republicações. Salvamentos e outros tipos ficam separados.
- Taxa de engajamento = engajamento ÷ denominador × 100. Denominador: alcance, ou visualizações/impressões se não houver alcance, **sempre identificado**. Taxa consolidada = Σ numeradores ÷ Σ denominadores, só com bases compatíveis.
- Variação % = (atual − anterior) ÷ anterior × 100; anterior = 0 → "não calculável". Taxas comparam-se em p.p. Crescimento de seguidores = saldo líquido ÷ seguidores no início × 100.
- Seguidores somados são vínculos, não pessoas. Alcance somado entre redes não é audiência única. Não misturar alcance, visualizações e impressões num total sem identificação.
- **KPI principal** (`config/redes.py`): engajamento em todas as redes (decisão da equipe em nov/2026, no lugar dos KPIs por rede da proposta). Rede sem engajamento na planilha usa substituto sinalizado (alcance → impressões → visualizações).
- **Benchmark interno**: janela móvel de 90 dias (ajustável), mediana e quartis, **excluindo** o período avaliado; para posts, comparar em idade equivalente. Sinalizar abaixo/dentro/acima do padrão. Em volumes, expor também média/mediana por publicação.
- Contextualizar amostras pequenas por grupo (tema, formato, célula da matriz): barras esmaecidas, célula "—" e o número de publicações na dica ao passar o mouse e nas exportações. Não escrever `n=x` nos gráficos (decisão da equipe).
- Coincidência temporal entre pico e acontecimento é hipótese, não causalidade (texto do front).
- Público: não inferir demografia de um conteúdo a partir da demografia do perfil. A planilha atual não traz dados demográficos; a aba Público depende de nova fonte (etapa 3).
- Parlamentares/propostas: herdar `OVERRIDES_PARTIDO_UF` e `REGEX_TAG_ARTIFICIAL` da versão anterior, se esses campos voltarem. Preserve os lookarounds da regex.

## Saídas em `docs/dados/` (substituem o JSON único)

Com 80 mil linhas, **nunca** publicar linhas brutas num só arquivo. O front carrega pouco de cada vez:

| Arquivo | Conteúdo | Tamanho alvo |
|---|---|---|
| `manifest.json` | versão, gerado_em, redes, período coberto, lista de partições | < 5 KB |
| `resumo_diario.json` | rede × dia: seguidores, novos, alcance, engajamento, posts | < 1,5 MB |
| `benchmark.json` | mediana/quartis por rede × métrica × janela | < 200 KB |
| `publicacoes/AAAA-MM.json` | posts do mês com métricas e classificação (carregado sob demanda) | < 1 MB cada |
| `conteudos_agregado.json` | tema × formato × rede: n, soma, média, mediana | < 500 KB |
| `anotacoes.json` | cópia de reserva das anotações por publicação | < 50 KB |
| `dicionario_metricas.json` | definição, fonte, unidade, denominador, agregação | < 50 KB |

Janela histórica padrão: 12 meses de posts (`JANELA_MESES_POSTS`); `resumo_diario` pode cobrir todo o histórico. Constantes em `src/config.py`/`carga.py`, não no front-end. Se um arquivo passar do alvo, particione ou reduza colunas.

## Cache e leitura incremental

- `cache/` (gitignored) guarda `bruto.parquet` e `estado.json` (última data lida, hash do cabeçalho). Serve para iterar na transformação sem reler a API.
- Padrão em produção: **download completo do CSV** (80 mil linhas, ~46 MB, ~10 s). Leitura incremental (só linhas novas) é otimização futura: só ative se a coleta passar de ~3 min.
- Mudou o cabeçalho da planilha? A coleta deve falhar com mensagem clara (`ABAS_ESPERADAS` / `COLUNAS_ESPERADAS`), nunca seguir com colunas deslocadas.

## Comandos

```powershell
pip install -r requirements.txt
python main.py --sem-publicar              # teste local (padrão ao testar)
python main.py --sem-publicar --do-cache   # reusa cache/bruto.parquet, sem chamar a API
python main.py                             # coleta, gera e publica (commit + push)
python main.py --agendar                   # roda todo dia às 11:30 (America/Sao_Paulo)
python scripts/benchmark_coleta.py         # mede tempo/tamanho da leitura da planilha
python -m http.server -d docs              # abrir o dashboard (fetch não funciona em file://)
cd frontend; npm install                   # front: uma vez (Node 18+)
npm run dev                                # front em desenvolvimento (serve ../docs/dados em /dados)
npm run build                              # typecheck + gera docs/index.html e docs/assets/ (commitar o resultado)
python -m pytest tests                     # testes de regras (taxas, variação, datas, benchmark)
```

Valide uma mudança rodando `--sem-publicar`, conferindo os tamanhos em `docs/dados/` e abrindo o dashboard. Reconcilie com amostras dos painéis de origem (critério de aceite da proposta).

## Estrutura

- `main.py`: flow e CLI.
- `src/config.py`: ID da planilha, nome da aba, caminhos, janelas.
- `config/`: dados de negócio editáveis sem tocar em código: `redes.py` (ordem e KPI principal), `colunas.py` (mapa coluna da planilha → nome interno), `taxonomia_temas.json`, `dicionario_metricas.json`.
- `src/coleta.py`, `src/transformacao/`, `src/carga.py`, `src/publicacao.py`: uma etapa cada, expostas como `@task`.
- `src/transformacao/`: `limpeza.py` (tipos, datas, NA), `publicacoes.py` (dedup, classificação, proposições), `metricas.py` (engajamento, taxas, variação), `benchmark.py`, `validacao.py` (`_validar`).
- `frontend/`: fonte do dashboard (React 18 + TypeScript + Vite, gráficos em SVG próprio, sem biblioteca de gráficos).
  - `src/data/source.ts`: `PipelineDataSource`, única porta de entrada dos JSONs (manifest → benchmark, dicionário, anotações → partições). Contrato tipado aqui: mudou o JSON, muda este arquivo.
  - `src/data/catalog.ts`: aparência por rede; KPI principal e disponibilidade de métricas vêm de `benchmark.json` (`kpi_por_rede`, `cobertura`).
  - `src/domain/`: regras puras (agregação, KPIs, variação, benchmark, picos), sem React. Engajamento e taxa por publicação vêm prontos do pipeline; o front só agrega.
  - `src/tabs/`, `src/components/`: telas. A aba Público mostra "dados indisponíveis" enquanto `meta.hasAudience` for falso.
- `docs/`: site publicado. `index.html` e `assets/{js,css,img}` são **gerados** por `npm run build` (não editar à mão); `dados/` é do pipeline.
- `tests/`: testes das regras de cálculo, com fixtures pequenas em `tests/fixtures/`.
- `scripts/`: utilitários fora do flow.
- `pipeline_prompts/`: roteiro de prompts de outro projeto (intranet em Node). Não faz parte deste pipeline; não altere.

## Agents (`.claude/agents/`)

Cada agent tem escopo de arquivos próprio; dois agents nunca editam o mesmo arquivo.

| Agent | Escopo | Modelo |
|---|---|---|
| `etl-pipeline` | `src/` (coleta, transformação, carga, publicação), `config/`, `scripts/`, `tests/` | opus |
| `revisor-etl` | somente leitura: audita o ETL e os JSONs gerados | opus |
| `orquestrador-prefect` | `main.py`, deployment, agendamento, retries, CLI | sonnet |
| `prefect-debugger` | somente diagnóstico: logs, reprodução, causa raiz | sonnet |
| `frontend-dashboard` | `frontend/`, `docs/index.html`, `docs/assets/` (gerados pelo build) | sonnet |

Fluxo: `etl-pipeline` constrói → `revisor-etl` audita → `orquestrador-prefect` liga as etapas no flow → em falha, `prefect-debugger` diagnostica e indica qual agent corrige. O front pode começar assim que o contrato do `manifest.json` estiver fechado. Mudança no contrato dos JSONs: avisar o usuário para acionar `frontend-dashboard`. Dois agents nunca editam o mesmo arquivo; `revisor-etl` e `prefect-debugger` nunca editam.

## Convenções

- Python com nomes, docstrings e comentários em **português**. Funções internas começam com `_`.
- Cada etapa é uma `@task` com `name` em português; `log_prints=True`; `retries` nas que acessam rede (Sheets, git).
- A transformação termina em `_validar` (colunas, tipos, datas plausíveis, duplicidade de `Post - Link`, taxas entre 0 e 100). Ao mudar colunas, atualize `config/colunas.py` e a validação juntos.
- JSON com `ensure_ascii=False`, escrita atômica; converta NaN/NA/numpy para tipos nativos (`NA` → `null`) antes de serializar.
- Front-end em React + TypeScript (`frontend/`), build Vite para `docs/` com nomes fixos (`assets/js/app.js`, `assets/css/app.css`). Rode `npm run build` e commite `docs/index.html` + `docs/assets/` junto com a mudança em `frontend/`. Mensagens em pt-BR; o React escapa texto (não use `dangerouslySetInnerHTML`). Todo número exibido indica unidade e, em taxas, o denominador. `null` é n/d, nunca zero.
- O contrato dos JSONs em `docs/dados/` é a API do produto (também servirá ao futuro app Flutter): regras de negócio novas entram de preferência no pipeline, não só no front.
- Exportação CSV/XLSX e download de gráficos são requisitos do front (etapa 2).

## Cuidados importantes

- **Nunca versionar nem imprimir** `src/credentials.json` (conta de serviço), `.env`, `*.json.key`. `cache/` também não é versionado (pode conter o bruto de 80 mil linhas).
- `docs/dados/` é versionado e publicado: contém só dados agregados ou públicos (links de posts já públicos). Não publique dados pessoais nem demografia desagregada sem checar as regras institucionais de privacidade.
- Não leia JSONs de `docs/dados/` inteiros; extraia com `python -c`, `node -e` ou `grep`. Não leia `docs/assets/js/app.js` (minificado); edite a fonte em `frontend/src/`.
- `publicar_dados_git` faz `push` na `main` de verdade. Não rode `python main.py` sem `--sem-publicar` a menos que o usuário peça.
- Commits do pipeline: `chore: atualiza dados do dashboard (AAAA-MM-DD HH:MM)`. Manuais: Conventional Commits em português.
- `SPREADSHEET_ID` e `URL_ANOTACOES` sobrescrevem os padrões por variável de ambiente. Testes que escrevam em planilha usam cópia, nunca produção.

## Etapas (da proposta)

1. **MVP**: consolidação, KPIs, filtros, comparativos, séries históricas, benchmark interno, base de publicações com classificação inicial.
2. **Inteligência editorial**: rankings, matriz tema × formato, comparação por rede, picos com anotações, exportação.
3. **Aprofundamento**: público (nova fonte), retenção de vídeo, vínculo entre versões da mesma pauta, alertas de desvio.

## Ambiente

Windows, PowerShell. Python 3.14 com ambiente virtual em `.venv/` (não versionado). Dependências em `requirements.txt`; versões exatas testadas em `requirements.lock.txt`.

```powershell
.\.venv\Scripts\Activate.ps1        # ativar (ou use .\.venv\Scripts\python.exe direto)
pip install -r requirements.txt
```

Rode sempre os comandos deste arquivo com o `.venv` ativo.
