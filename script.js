const HEADERS = [
  'NAME OF STUDENT',
  'NAME OF PARENT',
  'PHONE NO. (PARENT)',
  'LRN',
  'EMAIL ADDRESS'
];

const PAGE_WIDTH = 1414;
const PAGE_HEIGHT = 2000;
const COLS = 5;
const ROWS_PER_PAGE = 7;
const CARDS_PER_PAGE = COLS * ROWS_PER_PAGE;

const MARGIN_X = 34;
const MARGIN_Y = 22;
const GAP_X = 26;
const GAP_Y = 18;
const CARD_WIDTH = Math.floor((PAGE_WIDTH - (MARGIN_X * 2) - (GAP_X * (COLS - 1))) / COLS);
const CARD_HEIGHT = Math.floor((PAGE_HEIGHT - (MARGIN_Y * 2) - (GAP_Y * (ROWS_PER_PAGE - 1))) / ROWS_PER_PAGE);

const QR_SIZE = 220;
const NAME_FONT_SIZE = 15;
const NAME_AREA_HEIGHT = 28;

const tableContainer = document.getElementById('tableContainer');
const preview = document.getElementById('preview');
const status = document.getElementById('status');

function setStatus(message) {
  status.textContent = message;
}

function createTable() {
  const count = Number(document.getElementById('studentCount').value);

  if (!Number.isInteger(count) || count < 1) {
    setStatus('Enter a valid number of students.');
    return;
  }

  tableContainer.innerHTML = '';

  const table = document.createElement('table');
  table.border = '1';
  table.cellPadding = '4';
  table.cellSpacing = '0';
  table.id = 'studentTable';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  HEADERS.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  for (let r = 0; r < count; r++) {
    const tr = document.createElement('tr');

    for (let c = 0; c < HEADERS.length; c++) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.row = String(r);
      input.dataset.col = String(c);
      input.autocomplete = 'off';
      input.spellcheck = false;

      if (c === 3) {
        input.inputMode = 'numeric';
        input.placeholder = '12-digit LRN';
      }

      td.appendChild(input);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  tableContainer.appendChild(table);
  attachPasteHandler(table);
  setStatus(`Created ${count} rows × 5 columns.`);
}

function attachPasteHandler(table) {
  table.addEventListener('paste', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return;

    event.preventDefault();

    const startRow = Number(target.dataset.row);
    const startCol = Number(target.dataset.col);
    const rows = text.replace(/\r/g, '').split('\n');

    if (rows.length && rows[rows.length - 1] === '') rows.pop();

    rows.forEach((rowText, rowOffset) => {
      const cells = rowText.split('\t');

      cells.forEach((value, colOffset) => {
        const row = startRow + rowOffset;
        const col = startCol + colOffset;
        const input = table.querySelector(`input[data-row="${row}"][data-col="${col}"]`);

        if (input) {
          input.value = value;
        }
      });
    });

    setStatus('Pasted spreadsheet data into the table.');
  });
}

function getStudents() {
  const table = document.getElementById('studentTable');
  if (!table) throw new Error('Create the table first.');

  const rows = [...table.querySelectorAll('tbody tr')];
  const students = [];
  const errors = [];

  rows.forEach((tr, index) => {
    const values = [...tr.querySelectorAll('input')].map(input => input.value.trim());
    const [name, parent, phone, lrn, email] = values;

    const completelyBlank = values.every(value => value === '');
    if (completelyBlank) return;

    if (!name) errors.push(`Row ${index + 1}: student name is missing.`);
    if (!lrn) errors.push(`Row ${index + 1}: LRN is missing.`);
    if (lrn && !/^\d{12}$/.test(lrn)) {
      errors.push(`Row ${index + 1}: LRN must be exactly 12 digits. Current value: "${lrn}"`);
    }

    if (name && /^\d{12}$/.test(lrn)) {
      students.push({ name, parent, phone, lrn, email });
    }
  });

  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  if (!students.length) {
    throw new Error('No valid student rows found.');
  }

  return students;
}

function makeQrCanvas(text) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');

    QRCode.toCanvas(
      canvas,
      String(text),
      {
        width: QR_SIZE,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      },
      error => {
        if (error) reject(error);
        else resolve(canvas);
      }
    );
  });
}

function fitName(ctx, text, maxWidth) {
  let fontSize = NAME_FONT_SIZE;

  while (fontSize >= 10) {
    ctx.font = `${fontSize}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) return fontSize;
    fontSize--;
  }

  return 10;
}

async function renderPage(students, pageNumber, totalPages) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const row = Math.floor(i / COLS);
    const col = i % COLS;

    const x = MARGIN_X + col * (CARD_WIDTH + GAP_X);
    const y = MARGIN_Y + row * (CARD_HEIGHT + GAP_Y);

    ctx.strokeRect(x, y, CARD_WIDTH, CARD_HEIGHT);

    const qrCanvas = await makeQrCanvas(student.lrn);
    const qrX = x + Math.floor((CARD_WIDTH - QR_SIZE) / 2);
    const qrY = y + 10;
    ctx.drawImage(qrCanvas, qrX, qrY, QR_SIZE, QR_SIZE);

    const nameY = y + CARD_HEIGHT - Math.floor(NAME_AREA_HEIGHT / 2) - 4;
    const fontSize = fitName(ctx, student.name, CARD_WIDTH - 14);
    ctx.font = `${fontSize}px Arial`;
    ctx.fillText(student.name, x + CARD_WIDTH / 2, nameY, CARD_WIDTH - 14);
  }

  canvas.dataset.pageNumber = String(pageNumber);
  canvas.dataset.totalPages = String(totalPages);
  return canvas;
}

async function renderAllPages() {
  const students = getStudents();
  const pages = [];
  const totalPages = Math.ceil(students.length / CARDS_PER_PAGE);

  for (let p = 0; p < totalPages; p++) {
    const start = p * CARDS_PER_PAGE;
    const pageStudents = students.slice(start, start + CARDS_PER_PAGE);
    pages.push(await renderPage(pageStudents, p + 1, totalPages));
  }

  return pages;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create PNG file.'));
    }, 'image/png');
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function generatePreview() {
  try {
    setStatus('Generating QR codes...');
    preview.innerHTML = '';

    const pages = await renderAllPages();

    for (let i = 0; i < pages.length; i++) {
      const label = document.createElement('p');
      label.textContent = `Page ${i + 1} of ${pages.length}`;
      preview.appendChild(label);

      const image = document.createElement('img');
      image.src = pages[i].toDataURL('image/png');
      image.width = 707;
      image.alt = `QR sheet page ${i + 1}`;
      preview.appendChild(image);
      preview.appendChild(document.createElement('hr'));
    }

    setStatus(`Generated ${pages.length} page(s). Each page is ${PAGE_WIDTH} × ${PAGE_HEIGHT} PNG pixels.`);
  } catch (error) {
    setStatus(error.message);
    alert(error.message);
  }
}

async function exportFiles() {
  try {
    setStatus('Generating export...');
    const pages = await renderAllPages();

    if (pages.length === 1) {
      const blob = await canvasToBlob(pages[0]);
      downloadBlob(blob, 'student-qr-codes.png');
      setStatus('PNG exported.');
      return;
    }

    const zip = new JSZip();

    for (let i = 0; i < pages.length; i++) {
      const blob = await canvasToBlob(pages[i]);
      zip.file(`student-qr-codes-page-${i + 1}.png`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, 'student-qr-codes.zip');
    setStatus(`ZIP exported with ${pages.length} PNG files.`);
  } catch (error) {
    setStatus(error.message);
    alert(error.message);
  }
}

document.getElementById('createTableBtn').addEventListener('click', createTable);
document.getElementById('generateBtn').addEventListener('click', generatePreview);
document.getElementById('exportBtn').addEventListener('click', exportFiles);

createTable();
