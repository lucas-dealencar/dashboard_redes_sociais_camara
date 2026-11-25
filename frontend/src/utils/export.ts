export type Cell = string | number | null | undefined;
export interface Table {
  name: string;
  headers: string[];
  rows: Cell[][];
}

export async function downloadBlob(blob: Blob, filename: string) {
  // Dentro de um artefato publicado o download passa pela capacidade "downloads"; fora dele, link <a download>.
  try {
    const c = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (o: { filename: string; data: Blob }) => Promise<unknown> } | null> } }).claude;
    if (c?.use) {
      const d = await c.use('downloads');
      if (d) { await d.save({ filename, data: blob }); return; }
    }
  } catch {
    /* recusado ou indisponível: tenta o método padrão */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const csvCell = (c: Cell) => {
  if (c === null || c === undefined) return '';
  const s = typeof c === 'number' ? String(c).replace('.', ',') : c;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV com separador ";" e BOM UTF-8 (abre direto no Excel em pt-BR). */
export function downloadCsv(t: Table, filename = t.name) {
  const text = [t.headers, ...t.rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  downloadBlob(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

/* ---------- XLSX mínimo (zip sem compressão), sem dependências ---------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const enc = new TextEncoder();
const u16 = (n: number) => [n & 255, (n >>> 8) & 255];
const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function zip(files: { name: string; data: string }[]): Uint8Array {
  const parts: number[][] = [];
  const central: number[][] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name];
    parts.push(local, Array.from(data));
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)];
  return new Uint8Array([...parts.flat(), ...central.flat(), ...end]);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colName = (i: number) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

export function downloadXlsx(t: Table, filename = t.name) {
  const rows = [t.headers, ...t.rows].map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    if (c === null || c === undefined || c === '') return '';
    return typeof c === 'number' && Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(c))}</t></is></c>`;
  }).join('')}</row>`).join('');
  const sheetName = esc(t.name.slice(0, 28).replace(/[\\/?*[\]:]/g, ' ')) || 'Dados';
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>` },
  ];
  downloadBlob(new Blob([zip(files) as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

/* ---------- gráficos: SVG / PNG ---------- */
function serialize(svg: SVGSVGElement): { xml: string; w: number; h: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  const w = vb.width || svg.clientWidth, h = vb.height || svg.clientHeight;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);
  return { xml: new XMLSerializer().serializeToString(clone), w, h };
}
export function downloadSvgPng(svg: SVGSVGElement, filename: string) {
  const { xml, w, h } = serialize(svg);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob((b) => b && downloadBlob(b, `${filename}.png`));
  };
  img.src = url;
}
