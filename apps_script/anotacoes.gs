/**
 * API de anotações editoriais por post (Google Apps Script, vinculado à planilha de anotações).
 *
 * - GET  ?acao=listar  -> { ok, anotacoes: [{post_link, anotacao, versao, atualizado_em}], gerado_em }
 * - POST (corpo JSON, Content-Type text/plain para evitar preflight de CORS):
 *     { acao: "salvar",  senha, post_link, anotacao, versao }
 *     { acao: "excluir", senha, post_link, versao }
 *   `versao` é a versão que o usuário viu (0 = o post ainda não tinha anotação).
 *   Se outra pessoa gravou antes, a resposta é { ok:false, erro:"conflito", atual } e nada é gravado.
 *
 * Uma anotação por post. A chave é o link normalizado com as mesmas regras de
 * `_chave_link` (src/transformacao/publicacoes.py): mantenha as duas em sincronia.
 * Exclusão só marca `excluido` (a linha e o texto ficam na planilha, recuperáveis).
 *
 * Configuração (uma vez):
 *   1. Configurações do projeto > Propriedades do script: SENHA_EQUIPE = <senha da equipe>.
 *   2. Executar `configurar` no editor (ajusta cabeçalho e formatos da aba `anotacoes`).
 *   3. Implantar > Nova implantação > App da Web; Executar como: eu; Quem pode acessar: qualquer pessoa.
 *
 * @OnlyCurrentDoc  (o script só enxerga esta planilha; nunca a planilha de origem dos dados)
 */

const ABA = 'anotacoes';
const CABECALHO = ['post_link', 'anotacao', 'versao', 'atualizado_em', 'excluido'];
const FORMATOS_LINHA = [['@', '@', '0', '@', 'General']];
const MAX_TEXTO = 2000;
const MAX_LINK = 500;
const CHAVE_CACHE = 'anotacoes_lista_v1';
const SEGUNDOS_CACHE = 30;
const ESPERA_TRAVA_MS = 10000;

// ------------------------------------------------------------------ configuração
/** Executar uma vez pelo editor: grava o cabeçalho e formata as colunas como texto. */
function configurar() {
  const aba = obterAba_();
  aba.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]).setFontWeight('bold');
  aba.setFrozenRows(1);
  aba.getRange('A:B').setNumberFormat('@');
  aba.getRange('D:D').setNumberFormat('@');
  if (!PropertiesService.getScriptProperties().getProperty('SENHA_EQUIPE')) {
    console.warn('Defina a propriedade SENHA_EQUIPE em Configurações do projeto > Propriedades do script.');
  }
  console.log('Aba "' + ABA + '" configurada.');
}

// ------------------------------------------------------------------ pontos de entrada
function doGet(e) {
  try {
    const acao = (e && e.parameter && e.parameter.acao) || 'listar';
    if (acao !== 'listar') throw erro_('acao_invalida', 'Ação desconhecida.');
    return resposta_({ ok: true, anotacoes: listar_(), gerado_em: new Date().toISOString() });
  } catch (err) {
    return falha_(err);
  }
}

function doPost(e) {
  let pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (_) {
    return resposta_({ ok: false, erro: 'json_invalido', mensagem: 'Pedido mal formado.' });
  }
  try {
    if (!senhaConfere_(pedido.senha)) {
      Utilities.sleep(1500); // atrasa tentativas de adivinhar a senha
      return resposta_({ ok: false, erro: 'nao_autorizado', mensagem: 'Senha da equipe incorreta.' });
    }
    const acao = pedido.acao;
    if (acao !== 'salvar' && acao !== 'excluir') throw erro_('acao_invalida', 'Ação desconhecida.');
    const link = validarLink_(pedido.post_link);
    const versao = Number(pedido.versao);
    if (!Number.isInteger(versao) || versao < 0) throw erro_('versao_invalida', 'Versão da anotação inválida.');
    const texto = acao === 'salvar' ? validarTexto_(pedido.anotacao) : null;

    const trava = LockService.getScriptLock();
    if (!trava.tryLock(ESPERA_TRAVA_MS)) {
      return resposta_({ ok: false, erro: 'ocupado', mensagem: 'Muitas gravações ao mesmo tempo. Tente de novo.' });
    }
    try {
      const resultado = gravar_(acao, link, texto, versao);
      SpreadsheetApp.flush();
      CacheService.getScriptCache().remove(CHAVE_CACHE);
      return resposta_(resultado);
    } finally {
      trava.releaseLock();
    }
  } catch (err) {
    return falha_(err);
  }
}

// ------------------------------------------------------------------ leitura e gravação
function listar_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(CHAVE_CACHE);
  if (guardado) return JSON.parse(guardado);

  const aba = obterAba_();
  validarCabecalho_(aba);
  const n = aba.getLastRow() - 1;
  const lista = n < 1 ? [] : aba.getRange(2, 1, n, CABECALHO.length).getValues()
    .map(registro_)
    .filter(function (r) { return r.post_link && !r.excluido; })
    .map(function (r) { return { post_link: r.post_link, anotacao: r.anotacao, versao: r.versao, atualizado_em: r.atualizado_em }; });

  const json = JSON.stringify(lista);
  if (json.length < 90000) cache.put(CHAVE_CACHE, json, SEGUNDOS_CACHE); // limite do CacheService: 100 KB
  return lista;
}

/** Chamar só com a trava obtida: a checagem de versão e a escrita precisam ser atômicas. */
function gravar_(acao, link, texto, versaoVista) {
  const aba = obterAba_();
  validarCabecalho_(aba);
  const linha = localizar_(aba, link);
  const ativa = !!linha && !linha.registro.excluido;
  const versaoAtual = ativa ? linha.registro.versao : 0;

  if (versaoVista !== versaoAtual) {
    return {
      ok: false,
      erro: 'conflito',
      mensagem: 'Outra pessoa alterou esta anotação. Confira o texto atual antes de salvar de novo.',
      atual: ativa ? publico_(linha.registro) : null,
    };
  }

  const agora = new Date().toISOString();
  if (acao === 'excluir') {
    if (!ativa) throw erro_('inexistente', 'Este post não tem anotação para excluir.');
    const nova = linha.registro.versao + 1;
    aba.getRange(linha.numero, 3, 1, 3).setValues([[nova, agora, true]]);
    return { ok: true, post_link: link, anotacao: null };
  }

  // salvar: a versão continua crescendo mesmo depois de uma exclusão (reaproveita a linha)
  const nova = (linha ? linha.registro.versao : 0) + 1;
  const numero = linha ? linha.numero : aba.getLastRow() + 1;
  const intervalo = aba.getRange(numero, 1, 1, CABECALHO.length);
  intervalo.setNumberFormats(FORMATOS_LINHA);
  intervalo.setValues([[link, protegerTexto_(texto), nova, agora, false]]);
  return { ok: true, anotacao: { post_link: link, anotacao: texto, versao: nova, atualizado_em: agora } };
}

function localizar_(aba, link) {
  const n = aba.getLastRow() - 1;
  if (n < 1) return null;
  const dados = aba.getRange(2, 1, n, CABECALHO.length).getValues();
  for (let i = 0; i < dados.length; i++) {
    if (normalizarLink(dados[i][0]) === link) return { numero: i + 2, registro: registro_(dados[i]) };
  }
  return null;
}

function registro_(l) {
  return {
    post_link: normalizarLink(l[0]),
    anotacao: lerTexto_(l[1]),
    versao: Number(l[2]) || 0,
    atualizado_em: l[3] instanceof Date ? l[3].toISOString() : String(l[3] || ''),
    excluido: l[4] === true || String(l[4]).toUpperCase() === 'TRUE',
  };
}

function publico_(r) {
  return { post_link: r.post_link, anotacao: r.anotacao, versao: r.versao, atualizado_em: r.atualizado_em };
}

// ------------------------------------------------------------------ regras e validação
/** Mesmas regras de `_chave_link` no pipeline (host sem www, twitter->x, sem query nem barra final). */
function normalizarLink(valor) {
  let s = String(valor == null ? '' : valor).trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\/(www\.)?/, '');
  s = s.replace(/^(twitter\.com|mobile\.twitter\.com)\//, 'x.com/');
  s = s.replace(/^threads\.net\//, 'threads.com/');
  s = s.indexOf('watch?v=') === -1 ? s.replace(/[?#].*$/, '') : s.replace(/&.*$/, '');
  return s.replace(/\/+$/, '');
}

function validarLink_(valor) {
  const bruto = String(valor == null ? '' : valor).trim();
  // URL do post ou código numérico de Stories; datas (registros de seguidores) não são posts
  if (!bruto || bruto.length > MAX_LINK || !/^(https?:\/\/\S+|\d{15,20})$/i.test(bruto)) {
    throw erro_('link_invalido', 'Link do post inválido.');
  }
  return normalizarLink(bruto);
}

function validarTexto_(valor) {
  if (typeof valor !== 'string') throw erro_('texto_invalido', 'A anotação precisa ser um texto.');
  const texto = valor.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!texto) throw erro_('texto_vazio', 'A anotação está vazia.');
  if (texto.length > MAX_TEXTO) throw erro_('texto_longo', 'A anotação passa de ' + MAX_TEXTO + ' caracteres.');
  return texto;
}

/** Impede que um texto vire fórmula na planilha (=, +, -, @ no início). */
function protegerTexto_(texto) {
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function lerTexto_(valor) {
  const s = String(valor == null ? '' : valor);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function senhaConfere_(senha) {
  const esperada = PropertiesService.getScriptProperties().getProperty('SENHA_EQUIPE');
  if (!esperada) throw erro_('nao_configurado', 'A senha da equipe não foi definida no script.');
  return typeof senha === 'string' && senha === esperada;
}

// ------------------------------------------------------------------ utilidades
function obterAba_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
  if (!aba) throw erro_('aba_ausente', 'A aba "' + ABA + '" não existe na planilha.');
  return aba;
}

function validarCabecalho_(aba) {
  const atual = aba.getRange(1, 1, 1, CABECALHO.length).getValues()[0].map(function (c) { return String(c).trim(); });
  if (atual.join('|') !== CABECALHO.join('|')) {
    throw erro_('cabecalho', 'Cabeçalho da aba "' + ABA + '" diferente do esperado. Execute `configurar` no editor.');
  }
}

function erro_(codigo, mensagem) {
  const e = new Error(mensagem);
  e.codigo = codigo;
  return e;
}

function falha_(err) {
  if (!err.codigo) console.error(err);
  return resposta_({ ok: false, erro: err.codigo || 'interno', mensagem: err.codigo ? err.message : 'Erro interno no script.' });
}

function resposta_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
