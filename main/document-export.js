const { BrowserWindow } = require('electron');

/* ─── Format detection (based on the user's prompt) ─── */

function detectFormat(userText) {
  if (!userText) return null;
  const text = userText.toLowerCase();

  if (/\bpptx\b|presentation|powerpoint|slide\s*deck|\bslides?\b/.test(text)) return 'pptx';
  if (/\bxlsx\b|excel|spreadsheet|\bcsv\b/.test(text)) return 'xlsx';
  if (/\bdocx\b|\bword\s*(file|doc|document)?\b/.test(text)) return 'docx';
  if (/\bpdf\b/.test(text)) return 'pdf';

  return null;
}

/* ─── Shared text parsing helpers ─── */

function stripInlineMarkup(line) {
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/, '').trim();
}

function isHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^\*\*.+\*\*$/.test(trimmed) && trimmed.length < 100) return true;
  if (/^(slide\s*\d+|chapter\s*\d+)[:.]/i.test(trimmed)) return true;
  return false;
}

function isBulletLine(line) {
  return /^\s*([-*•]|\d+[.)])\s+/.test(line);
}

function stripBulletMarker(line) {
  return line.replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim();
}

function parseBlocks(content) {
  const lines = (content || '').split(/\r?\n/);
  const blocks = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeadingLine(line)) {
      blocks.push({ type: 'heading', text: stripInlineMarkup(line) });
    } else if (isBulletLine(line)) {
      blocks.push({ type: 'bullet', text: stripInlineMarkup(stripBulletMarker(line)) });
    } else {
      blocks.push({ type: 'para', text: stripInlineMarkup(line) });
    }
  }
  return blocks;
}

/* ─── DOCX generation ─── */

async function generateDocx(content, title) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require('docx');
  const blocks = parseBlocks(content);

  const children = [
    new Paragraph({ text: title || 'AI Response', heading: HeadingLevel.TITLE })
  ];

  blocks.forEach(b => {
    if (b.type === 'heading') {
      children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2 }));
    } else if (b.type === 'bullet') {
      children.push(new Paragraph({ text: b.text, bullet: { level: 0 } }));
    } else {
      children.push(new Paragraph({ children: [new TextRun(b.text)] }));
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/* ─── PPTX generation ─── */

function splitSlides(content) {
  const lines = (content || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const slides = [];
  let current = null;

  for (const line of lines) {
    if (isHeadingLine(line)) {
      current = { title: stripInlineMarkup(line), bullets: [] };
      slides.push(current);
    } else if (current) {
      current.bullets.push(stripInlineMarkup(isBulletLine(line) ? stripBulletMarker(line) : line));
    } else {
      current = { title: stripInlineMarkup(line), bullets: [] };
      slides.push(current);
    }
  }

  return slides.length ? slides : [{ title: 'Summary', bullets: lines }];
}

async function generatePptx(content, title) {
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();

  const titleSlide = pptx.addSlide();
  titleSlide.addText(title || 'AI Presentation', { x: 0.5, y: 2, w: 9, h: 1.5, fontSize: 32, bold: true, align: 'center' });

  const slides = splitSlides(content);
  slides.forEach(s => {
    const slide = pptx.addSlide();
    slide.addText(s.title, { x: 0.4, y: 0.3, w: 9.2, h: 0.8, fontSize: 24, bold: true });
    if (s.bullets.length) {
      slide.addText(
        s.bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.5, y: 1.3, w: 9, h: 5, fontSize: 16, valign: 'top' }
      );
    }
  });

  return pptx.write({ outputType: 'nodebuffer' });
}

/* ─── XLSX generation ─── */

function parseTable(content) {
  const lines = (content || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const pipeLines = lines.filter(l => l.includes('|'));
  if (pipeLines.length >= 2) {
    const rows = pipeLines
      .filter(l => !/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?$/.test(l))
      .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    if (rows.length >= 1 && rows[0].length > 1) return rows;
  }

  const commaLines = lines.filter(l => l.includes(','));
  if (commaLines.length >= 2) {
    const counts = commaLines.map(l => l.split(',').length);
    const consistent = counts.filter(c => c === counts[0]).length >= commaLines.length * 0.7;
    if (consistent && counts[0] > 1) {
      return commaLines.map(l => l.split(',').map(c => c.trim()));
    }
  }

  return null;
}

async function generateXlsx(content, title) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title || 'AI Response');

  const table = parseTable(content);
  if (table) {
    table.forEach((row, i) => {
      const added = sheet.addRow(row);
      if (i === 0) added.font = { bold: true };
    });
    sheet.columns.forEach(col => { col.width = 25; });
  } else {
    sheet.addRow(['Content']).font = { bold: true };
    parseBlocks(content).forEach(b => sheet.addRow([b.text]));
    sheet.getColumn(1).width = 80;
  }

  return workbook.xlsx.writeBuffer();
}

/* ─── PDF generation (via Electron's built-in printToPDF) ─── */

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function blocksToHtml(content, title) {
  const blocks = parseBlocks(content);
  let html = `<h1>${escapeHtml(title || 'AI Response')}</h1>`;
  let inList = false;

  blocks.forEach(b => {
    if (b.type === 'bullet') {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${escapeHtml(b.text)}</li>`;
      return;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (b.type === 'heading') {
      html += `<h2>${escapeHtml(b.text)}</h2>`;
    } else {
      html += `<p>${escapeHtml(b.text)}</p>`;
    }
  });
  if (inList) html += '</ul>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #222; line-height: 1.5; }
    h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 24px; }
    ul { margin: 8px 0; padding-left: 24px; } li { margin: 4px 0; }
    p { margin: 8px 0; }
  </style></head><body>${html}</body></html>`;
}

async function generatePdf(content, title) {
  const html = blocksToHtml(content, title);
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const buffer = await win.webContents.printToPDF({});
    return buffer;
  } finally {
    win.destroy();
  }
}

/* ─── Dispatcher ─── */

async function generate(format, content, title) {
  switch (format) {
    case 'docx': return generateDocx(content, title);
    case 'pptx': return generatePptx(content, title);
    case 'xlsx': return generateXlsx(content, title);
    case 'pdf': return generatePdf(content, title);
    default: throw new Error(`Unsupported export format: ${format}`);
  }
}

module.exports = { detectFormat, generate };
