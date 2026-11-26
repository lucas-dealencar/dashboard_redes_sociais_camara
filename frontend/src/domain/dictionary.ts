export interface DictRow { metric: string; definition: string; unit: string; source: string; denominator: string; aggregation: string }

/** Indicadores calculados no front (as métricas-base vêm do dicionário do pipeline). */
export const DICTIONARY: DictRow[] = [
  { metric: 'Crescimento de seguidores', definition: 'Saldo líquido ÷ seguidores no início do período × 100.', unit: '%', source: 'resumo diário', denominator: 'Seguidores no início', aggregation: 'Razão de somas; só com seguidores disponíveis.' },
  { metric: 'Alcance/Seguidores (Instagram)', definition: 'Alcance médio por publicação ÷ seguidores no fim do período × 100.', unit: '%', source: 'publicações + seguidores', denominator: 'Seguidores no fim', aggregation: 'Usado como KPI do Instagram quando houver seguidores; senão, alcance.' },
  { metric: 'Médias por publicação', definition: 'Total da métrica ÷ publicações com a métrica disponível.', unit: 'conforme a métrica', source: 'publicações', denominator: 'Publicações com a métrica', aggregation: 'Razão de somas.' },
  { metric: 'Mediana por publicação', definition: 'Valor central das publicações do período (evita distorção por mudança de frequência).', unit: 'conforme a métrica', source: 'publicações', denominator: 'Publicações com a métrica disponível', aggregation: 'Mediana.' },
  { metric: 'Taxa consolidada', definition: 'Σ engajamento ÷ Σ denominador × 100, só com publicações cuja taxa usa a mesma base (alcance).', unit: '%', source: 'publicações', denominator: 'Alcance', aggregation: 'Nunca média de taxas.' },
  { metric: 'Variação em taxas', definition: 'Diferença absoluta em pontos percentuais (p.p.).', unit: 'p.p.', source: 'calculado', denominator: '—', aggregation: '—' },
  { metric: 'Benchmark interno', definition: 'Mediana e quartis (Q1–Q3) de janelas móveis de mesma duração no histórico de referência, excluindo o período avaliado, recalculados para o recorte filtrado.', unit: 'conforme a métrica', source: 'calculado', denominator: '—', aggregation: 'Janela ajustável (padrão do pipeline). Abaixo < Q1 · Dentro Q1–Q3 · Acima > Q3.' },
  { metric: 'Pico', definition: 'Ponto da série acima de Q3 + 1,5 × amplitude interquartil e máximo local.', unit: '—', source: 'calculado', denominator: '—', aggregation: 'Coincidência temporal indica hipótese, não causalidade.' },
];

export const ADHERENCE: { ref: string; req: string; where: string; stage: 'MVP' | 'Etapa 2' | 'Etapa 3' }[] = [
  { ref: '§2', req: 'Sete redes da proposta + YouTube/Shorts e demais presentes na planilha', where: 'Filtro Plataforma (global) e tabela comparativa', stage: 'MVP' },
  { ref: '§3', req: 'Perguntas que o dashboard responde', where: 'Visão geral (evolução e redes), Evolução (picos), Classificação (temas/formatos), Público', stage: 'MVP' },
  { ref: '§5', req: 'Cartões com variação e benchmark; alternar redes; tabela comparativa; filtros globais', where: 'Visão geral', stage: 'MVP' },
  { ref: '§6', req: 'Linhas diárias/semanais/mensais, métricas selecionáveis, período anterior', where: 'Evolução e redes', stage: 'MVP' },
  { ref: '§6', req: 'Pico → publicações, datas, links, desempenho; anotações; aviso de hipótese', where: 'Evolução e redes (painel do ponto selecionado)', stage: 'Etapa 2' },
  { ref: '§7', req: 'Benchmark 90 d com mediana e quartis; sinalização; janela ajustável', where: 'Filtros globais + cartões + faixa por rede', stage: 'MVP' },
  { ref: '§8', req: 'KPI principal por rede e métricas de apoio', where: 'Evolução e redes (cartões por rede); “a validar” sinalizado', stage: 'MVP' },
  { ref: '§9', req: 'Padronização (engajamento, taxa, variação, soma de seguidores)', where: 'Todo o painel; regras no dicionário', stage: 'MVP' },
  { ref: '§10', req: 'Rankings, barras por formato/tema, matriz tema × formato, comparação por rede', where: 'Classificação', stage: 'Etapa 2' },
  { ref: '§10', req: 'Vínculo de versões da pauta e retenção de vídeo', where: 'Classificação (pautas e vídeo)', stage: 'Etapa 3' },
  { ref: '§10', req: 'Classificação temática pelos 13 temas legislativos, com reclassificação pela equipe', where: 'Filtro Tema, Classificação e detalhe da publicação', stage: 'MVP' },
  { ref: '§11', req: 'Faixa etária, gênero, localização; seguidores × alcançadas × engajadas', where: 'Público', stage: 'Etapa 3' },
  { ref: '§11', req: 'Evolução do perfil, horários, audiência nova/recorrente', where: 'Público', stage: 'Etapa 3' },
  { ref: '§11', req: 'Cruzamento público × conteúdo só com dado no nível da publicação', where: 'Público (Instagram e TikTok)', stage: 'Etapa 3' },
  { ref: '§12', req: 'Dicionário de métricas; zero × indisponível × incompleto', where: 'Metodologia e “n/d” nas tabelas', stage: 'MVP' },
  { ref: '§12', req: 'Exportação CSV/XLSX e download de gráficos', where: 'Botões CSV · XLSX · PNG nos painéis', stage: 'MVP' },
  { ref: '§12', req: 'Histórico de 12 meses', where: 'Partições mensais de publicações publicadas pelo pipeline (docs/dados/publicacoes)', stage: 'MVP' },
];
