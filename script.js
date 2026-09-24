const pasteBox = document.getElementById("pasteBox");
const analyzeBtn = document.getElementById("analyzeBtn");
const exportBtn = document.getElementById("exportBtn");
const detectedBody = document.getElementById("detectedBody");
const statusText = document.getElementById("status");

const PAGE_WIDTH = 1414;
const PAGE_HEIGHT = 2000;

const CARDS_PER_ROW = 5;
const ROWS_PER_PAGE = 7;
const CARDS_PER_PAGE = CARDS_PER_ROW * ROWS_PER_PAGE;

const LEFT_MARGIN = 35;
const TOP_MARGIN = 22;
const CARD_WIDTH = 247;
const CARD_HEIGHT = 259;
const H_GAP = 27;
const V_GAP = 20;

const QR_MODULE_SCALE = 8;
const QR_QUIET_ZONE = 4;
const QR_MODULE_COUNT = 21;
const QR_SIZE = (QR_MODULE_COUNT + QR_QUIET_ZONE * 2) * QR_MODULE_SCALE;
const QR_TOP_PADDING = 8;

let detectedStudents = [];

/* =========================================================
   DATA DETECTION
   ========================================================= */

analyzeBtn.addEventListener("click", analyzePastedData);

pasteBox.addEventListener("paste", () => {
  setTimeout(analyzePastedData, 0);
});

function normalizeLines(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(line => line.trim() !== "")
    .map(line => line.split("\t"));
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function normalizeHeader(value) {
  return cleanCell(value)
    .toUpperCase()
    .replace(/[._()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLrn(value) {
  return /^\d{12}$/.test(cleanCell(value));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCell(value));
}

function digitsOnly(value) {
  return cleanCell(value).replace(/\D/g, "");
}

function looksLikePhone(value) {
  const raw = cleanCell(value);

  if (/^\+?\d[\d\s-]{8,}$/.test(raw)) {
    return true;
  }

  const digits = digitsOnly(raw);
  return digits.length >= 10 && digits.length <= 13;
}

function looksLikeName(value) {
  const v = cleanCell(value);

  if (!v) return false;
  if (isLrn(v)) return false;
  if (isEmail(v)) return false;
  if (looksLikePhone(v)) return false;
  if (/^\d+$/.test(v)) return false;

  return /[A-Za-zÀ-ÿ]/.test(v);
}

function findHeaderMap(rows) {
  const maxRowsToCheck = Math.min(rows.length, 5);

  for (let r = 0; r < maxRowsToCheck; r++) {
    const headers = rows[r].map(normalizeHeader);

    let nameCol = -1;
    let lrnCol = -1;

    headers.forEach((header, index) => {
      if (
        header === "NAME OF STUDENT" ||
        header === "STUDENT NAME" ||
        header === "NAME" ||
        header.includes("STUDENT NAME") ||
        header.includes("NAME OF STUDENT")
      ) {
        nameCol = index;
      }

      if (
        header === "LRN" ||
        header.includes("LEARNER REFERENCE NUMBER") ||
        header.includes("LEARNER REFERENCE NO")
      ) {
        lrnCol = index;
      }
    });

    if (nameCol !== -1 || lrnCol !== -1) {
      return {
        headerRow: r,
        nameCol,
        lrnCol
      };
    }
  }

  return null;
}

function findLrnInRow(row, preferredLrnCol = -1) {
  if (preferredLrnCol >= 0 && preferredLrnCol < row.length) {
    const candidate = cleanCell(row[preferredLrnCol]);

    if (isLrn(candidate)) {
      return {
        lrn: candidate,
        colIndex: preferredLrnCol
      };
    }
  }

  for (let i = 0; i < row.length; i++) {
    const value = cleanCell(row[i]);

    if (isLrn(value)) {
      return {
        lrn: value,
        colIndex: i
      };
    }
  }

  return null;
}

function findStudentName(row, lrnColumn, preferredNameCol = -1) {
  if (preferredNameCol >= 0 && preferredNameCol < row.length) {
    const preferred = cleanCell(row[preferredNameCol]);

    if (looksLikeName(preferred)) {
      return preferred;
    }
  }

  for (let i = 0; i < row.length; i++) {
    if (i === lrnColumn) continue;

    const value = cleanCell(row[i]);

    if (looksLikeName(value)) {
      return value;
    }
  }

  return "";
}

function analyzePastedData() {
  const text = pasteBox.value;

  if (!text.trim()) {
    detectedStudents = [];
    renderDetectedStudents();
    statusText.textContent = "Paste data from Google Sheets first.";
    return;
  }

  const rows = normalizeLines(text);
  const headerMap = findHeaderMap(rows);

  const startRow = headerMap ? headerMap.headerRow + 1 : 0;
  const preferredNameCol = headerMap ? headerMap.nameCol : -1;
  const preferredLrnCol = headerMap ? headerMap.lrnCol : -1;

  const results = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    const lrnMatch = findLrnInRow(row, preferredLrnCol);

    if (!lrnMatch) {
      continue;
    }

    const name = findStudentName(
      row,
      lrnMatch.colIndex,
      preferredNameCol
    );

    results.push({
      sourceRow: r + 1,
      name,
      lrn: lrnMatch.lrn,
      valid: Boolean(name) && isLrn(lrnMatch.lrn)
    });
  }

  const seen = new Set();

  detectedStudents = results.filter(student => {
    if (seen.has(student.lrn)) {
      return false;
    }

    seen.add(student.lrn);
    return true;
  });

  renderDetectedStudents();

  const validCount = detectedStudents.filter(student => student.valid).length;
  const missingNameCount = detectedStudents.filter(student => !student.name).length;

  statusText.textContent =
    `Detected ${detectedStudents.length} LRN row(s). ` +
    `${validCount} student(s) are ready.` +
    (missingNameCount
      ? ` ${missingNameCount} row(s) have an LRN but no student name was identified.`
      : "");
}

function renderDetectedStudents() {
  detectedBody.innerHTML = "";

  detectedStudents.forEach(student => {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    const lrnTd = document.createElement("td");
    const statusTd = document.createElement("td");

    nameTd.textContent = student.name || "(name not detected)";
    lrnTd.textContent = student.lrn;
    statusTd.textContent = student.valid ? "READY" : "CHECK NAME";

    tr.appendChild(nameTd);
    tr.appendChild(lrnTd);
    tr.appendChild(statusTd);

    detectedBody.appendChild(tr);
  });
}

/* =========================================================
   BUILT-IN QR GENERATOR
   Fixed QR Version 1-L, numeric mode.
   This is enough for exact 12-digit LRNs and needs NO CDN.
   ========================================================= */

const GF_EXP = new Array(512).fill(0);
const GF_LOG = new Array(256).fill(0);

(function buildGaloisTables() {
  let x = 1;

  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;

    x <<= 1;

    if (x & 0x100) {
      x ^= 0x11d;
    }
  }

  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polynomialMultiply(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gfMultiply(a[i], b[j]);
    }
  }

  return result;
}

function createReedSolomon(dataCodewords, ecCount) {
  let generator = [1];

  for (let i = 0; i < ecCount; i++) {
    generator = polynomialMultiply(generator, [1, GF_EXP[i]]);
  }

  const message = dataCodewords.concat(new Array(ecCount).fill(0));

  for (let i = 0; i < dataCodewords.length; i++) {
    const factor = message[i];

    if (factor === 0) continue;

    const logFactor = GF_LOG[factor];

    for (let j = 0; j < generator.length; j++) {
      const coefficient = generator[j];

      if (coefficient !== 0) {
        message[i + j] ^=
          GF_EXP[(logFactor + GF_LOG[coefficient]) % 255];
      }
    }
  }

  return message.slice(dataCodewords.length);
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >> i) & 1);
  }
}

function createQrCodewords(lrn) {
  if (!/^\d{12}$/.test(lrn)) {
    throw new Error(`Invalid LRN: ${lrn}`);
  }

  const bits = [];

  // Numeric mode indicator: 0001
  appendBits(bits, 0b0001, 4);

  // Character count for Version 1-9 numeric mode: 10 bits
  appendBits(bits, lrn.length, 10);

  // 12 digits = four groups of 3 digits, each encoded in 10 bits
  for (let i = 0; i < lrn.length; i += 3) {
    const group = lrn.slice(i, i + 3);

    if (group.length === 3) {
      appendBits(bits, Number(group), 10);
    } else if (group.length === 2) {
      appendBits(bits, Number(group), 7);
    } else {
      appendBits(bits, Number(group), 4);
    }
  }

  const DATA_CODEWORDS = 19;
  const DATA_CAPACITY_BITS = DATA_CODEWORDS * 8;

  const terminatorLength = Math.min(
    4,
    DATA_CAPACITY_BITS - bits.length
  );

  for (let i = 0; i < terminatorLength; i++) {
    bits.push(0);
  }

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const data = [];

  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;

    for (let j = 0; j < 8; j++) {
      value = (value << 1) | bits[i + j];
    }

    data.push(value);
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;

  while (data.length < DATA_CODEWORDS) {
    data.push(padBytes[padIndex % 2]);
    padIndex++;
  }

  const errorCorrection = createReedSolomon(data, 7);

  return data.concat(errorCorrection);
}

function bchDigit(value) {
  let digit = 0;

  while (value !== 0) {
    digit++;
    value >>>= 1;
  }

  return digit;
}

function getFormatBits(data) {
  const G15 = 0x0537;
  const G15_MASK = 0x5412;

  let d = data << 10;

  while (bchDigit(d) - bchDigit(G15) >= 0) {
    d ^= G15 << (bchDigit(d) - bchDigit(G15));
  }

  return ((data << 10) | d) ^ G15_MASK;
}

function setupFinderPattern(matrix, row, col) {
  const size = matrix.length;

  for (let r = -1; r <= 7; r++) {
    const rr = row + r;

    if (rr < 0 || rr >= size) continue;

    for (let c = -1; c <= 7; c++) {
      const cc = col + c;

      if (cc < 0 || cc >= size) continue;

      const dark =
        (
          r >= 0 &&
          r <= 6 &&
          (c === 0 || c === 6)
        ) ||
        (
          c >= 0 &&
          c <= 6 &&
          (r === 0 || r === 6)
        ) ||
        (
          r >= 2 &&
          r <= 4 &&
          c >= 2 &&
          c <= 4
        );

      matrix[rr][cc] = dark;
    }
  }
}

function setupTimingPatterns(matrix) {
  const size = matrix.length;

  for (let r = 8; r < size - 8; r++) {
    if (matrix[r][6] === null) {
      matrix[r][6] = r % 2 === 0;
    }
  }

  for (let c = 8; c < size - 8; c++) {
    if (matrix[6][c] === null) {
      matrix[6][c] = c % 2 === 0;
    }
  }
}

function setupFormatInformation(matrix, maskPattern) {
  const size = matrix.length;

  // QR error correction level L uses format value 01.
  const errorCorrectionLevelL = 1;
  const formatData = (errorCorrectionLevelL << 3) | maskPattern;
  const bits = getFormatBits(formatData);

  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;

    if (i < 6) {
      matrix[i][8] = dark;
    } else if (i < 8) {
      matrix[i + 1][8] = dark;
    } else {
      matrix[size - 15 + i][8] = dark;
    }

    if (i < 8) {
      matrix[8][size - i - 1] = dark;
    } else if (i < 9) {
      matrix[8][15 - i] = dark;
    } else {
      matrix[8][15 - i - 1] = dark;
    }
  }

  // Fixed dark module
  matrix[size - 8][8] = true;
}

function maskPattern0(row, col) {
  return (row + col) % 2 === 0;
}

function mapQrData(matrix, codewords) {
  const size = matrix.length;

  let row = size - 1;
  let direction = -1;
  let byteIndex = 0;
  let bitIndex = 7;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) {
      col--;
    }

    while (true) {
      for (let offset = 0; offset < 2; offset++) {
        const currentCol = col - offset;

        if (matrix[row][currentCol] !== null) {
          continue;
        }

        let dark = false;

        if (byteIndex < codewords.length) {
          dark =
            ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
        }

        if (maskPattern0(row, currentCol)) {
          dark = !dark;
        }

        matrix[row][currentCol] = dark;

        bitIndex--;

        if (bitIndex === -1) {
          byteIndex++;
          bitIndex = 7;
        }
      }

      row += direction;

      if (row < 0 || row >= size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

function createQrMatrix(lrn) {
  const size = QR_MODULE_COUNT;

  const matrix = Array.from(
    { length: size },
    () => new Array(size).fill(null)
  );

  setupFinderPattern(matrix, 0, 0);
  setupFinderPattern(matrix, size - 7, 0);
  setupFinderPattern(matrix, 0, size - 7);

  setupTimingPatterns(matrix);

  // Fixed mask pattern 0
  setupFormatInformation(matrix, 0);

  const codewords = createQrCodewords(lrn);

  mapQrData(matrix, codewords);

  return matrix;
}

function createQrCanvas(lrn) {
  const matrix = createQrMatrix(lrn);

  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, QR_SIZE, QR_SIZE);

  ctx.fillStyle = "#000000";

  for (let row = 0; row < QR_MODULE_COUNT; row++) {
    for (let col = 0; col < QR_MODULE_COUNT; col++) {
      if (!matrix[row][col]) continue;

      const x =
        (col + QR_QUIET_ZONE) * QR_MODULE_SCALE;

      const y =
        (row + QR_QUIET_ZONE) * QR_MODULE_SCALE;

      ctx.fillRect(
        x,
        y,
        QR_MODULE_SCALE,
        QR_MODULE_SCALE
      );
    }
  }

  return canvas;
}

/* =========================================================
   PAGE / IMAGE GENERATION
   ========================================================= */

async function createPageCanvas(pageStudents) {
  const canvas = document.createElement("canvas");

  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "15px Arial";

  for (let i = 0; i < pageStudents.length; i++) {
    const student = pageStudents[i];

    const col = i % CARDS_PER_ROW;
    const row = Math.floor(i / CARDS_PER_ROW);

    const x =
      LEFT_MARGIN + col * (CARD_WIDTH + H_GAP);

    const y =
      TOP_MARGIN + row * (CARD_HEIGHT + V_GAP);

    ctx.strokeRect(
      x,
      y,
      CARD_WIDTH,
      CARD_HEIGHT
    );

    const qrCanvas = createQrCanvas(student.lrn);

    const qrX =
      x + Math.round((CARD_WIDTH - QR_SIZE) / 2);

    const qrY =
      y + QR_TOP_PADDING;

    ctx.drawImage(
      qrCanvas,
      qrX,
      qrY
    );

    const nameY =
      y + CARD_HEIGHT - 10;

    drawFittedText(
      ctx,
      student.name,
      x + CARD_WIDTH / 2,
      nameY,
      CARD_WIDTH - 12,
      15
    );
  }

  return canvas;
}

function drawFittedText(
  ctx,
  text,
  centerX,
  baselineY,
  maxWidth,
  startFontSize
) {
  let fontSize = startFontSize;

  while (fontSize >= 9) {
    ctx.font = `${fontSize}px Arial`;

    if (ctx.measureText(text).width <= maxWidth) {
      break;
    }

    fontSize--;
  }

  ctx.fillText(
    text,
    centerX,
    baselineY
  );
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(
          new Error("Could not create PNG.")
        );

        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/* =========================================================
   BUILT-IN ZIP WRITER
   Stores PNG files without compression.
   No JSZip or CDN required.
   ========================================================= */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c =
        (c & 1)
          ? 0xedb88320 ^ (c >>> 1)
          : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    crc =
      CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^
      (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

async function createZipBlob(files) {
  const encoder = new TextEncoder();

  const prepared = [];

  for (const file of files) {
    const filenameBytes = encoder.encode(file.filename);
    const data = new Uint8Array(
      await file.blob.arrayBuffer()
    );

    prepared.push({
      filename: file.filename,
      filenameBytes,
      data,
      crc: crc32(data)
    });
  }

  const localParts = [];
  const centralParts = [];

  let localOffset = 0;

  for (const file of prepared) {
    const localHeader =
      new Uint8Array(
        30 + file.filenameBytes.length
      );

    const localView =
      new DataView(
        localHeader.buffer
      );

    writeUint32(
      localView,
      0,
      0x04034b50
    );

    writeUint16(
      localView,
      4,
      20
    );

    writeUint16(
      localView,
      6,
      0
    );

    writeUint16(
      localView,
      8,
      0
    );

    writeUint16(
      localView,
      10,
      0
    );

    writeUint16(
      localView,
      12,
      0
    );

    writeUint32(
      localView,
      14,
      file.crc
    );

    writeUint32(
      localView,
      18,
      file.data.length
    );

    writeUint32(
      localView,
      22,
      file.data.length
    );

    writeUint16(
      localView,
      26,
      file.filenameBytes.length
    );

    writeUint16(
      localView,
      28,
      0
    );

    localHeader.set(
      file.filenameBytes,
      30
    );

    localParts.push(
      localHeader,
      file.data
    );

    const centralHeader =
      new Uint8Array(
        46 + file.filenameBytes.length
      );

    const centralView =
      new DataView(
        centralHeader.buffer
      );

    writeUint32(
      centralView,
      0,
      0x02014b50
    );

    writeUint16(
      centralView,
      4,
      20
    );

    writeUint16(
      centralView,
      6,
      20
    );

    writeUint16(
      centralView,
      8,
      0
    );

    writeUint16(
      centralView,
      10,
      0
    );

    writeUint16(
      centralView,
      12,
      0
    );

    writeUint16(
      centralView,
      14,
      0
    );

    writeUint32(
      centralView,
      16,
      file.crc
    );

    writeUint32(
      centralView,
      20,
      file.data.length
    );

    writeUint32(
      centralView,
      24,
      file.data.length
    );

    writeUint16(
      centralView,
      28,
      file.filenameBytes.length
    );

    writeUint16(
      centralView,
      30,
      0
    );

    writeUint16(
      centralView,
      32,
      0
    );

    writeUint16(
      centralView,
      34,
      0
    );

    writeUint16(
      centralView,
      36,
      0
    );

    writeUint32(
      centralView,
      38,
      0
    );

    writeUint32(
      centralView,
      42,
      localOffset
    );

    centralHeader.set(
      file.filenameBytes,
      46
    );

    centralParts.push(
      centralHeader
    );

    localOffset +=
      localHeader.length +
      file.data.length;
  }

  const centralSize =
    centralParts.reduce(
      (sum, part) => sum + part.length,
      0
    );

  const endRecord =
    new Uint8Array(22);

  const endView =
    new DataView(
      endRecord.buffer
    );

  writeUint32(
    endView,
    0,
    0x06054b50
  );

  writeUint16(
    endView,
    4,
    0
  );

  writeUint16(
    endView,
    6,
    0
  );

  writeUint16(
    endView,
    8,
    prepared.length
  );

  writeUint16(
    endView,
    10,
    prepared.length
  );

  writeUint32(
    endView,
    12,
    centralSize
  );

  writeUint32(
    endView,
    16,
    localOffset
  );

  writeUint16(
    endView,
    20,
    0
  );

  return new Blob(
    [
      ...localParts,
      ...centralParts,
      endRecord
    ],
    {
      type: "application/zip"
    }
  );
}

/* =========================================================
   EXPORT
   ========================================================= */

exportBtn.addEventListener("click", async () => {
  try {
    analyzePastedData();

    const students =
      detectedStudents.filter(
        student => student.valid
      );

    if (students.length === 0) {
      alert(
        "No valid students were detected. Each student row needs an exact 12-digit LRN and a detectable student name."
      );

      return;
    }

    const incomplete =
      detectedStudents.filter(
        student => !student.valid
      );

    if (incomplete.length > 0) {
      const proceed = confirm(
        `${incomplete.length} row(s) have an LRN but no student name was identified.\n\n` +
        `Those rows will not be exported.\n\nContinue with ${students.length} ready student(s)?`
      );

      if (!proceed) {
        return;
      }
    }

    statusText.textContent =
      "Generating QR codes...";

    const pageCount =
      Math.ceil(
        students.length /
        CARDS_PER_PAGE
      );

    const pages = [];

    for (
      let pageIndex = 0;
      pageIndex < pageCount;
      pageIndex++
    ) {
      const start =
        pageIndex *
        CARDS_PER_PAGE;

      const end =
        start +
        CARDS_PER_PAGE;

      const pageStudents =
        students.slice(
          start,
          end
        );

      const canvas =
        await createPageCanvas(
          pageStudents
        );

      const blob =
        await canvasToBlob(
          canvas
        );

      pages.push({
        filename:
          pageCount === 1
            ? "Student-QR-Codes.png"
            : `Student-QR-Codes-${pageIndex + 1}.png`,
        blob
      });
    }

    if (pages.length === 1) {
      downloadBlob(
        pages[0].blob,
        pages[0].filename
      );

      statusText.textContent =
        `Done. Generated ${students.length} QR code(s).`;

      return;
    }

    const zipBlob =
      await createZipBlob(
        pages
      );

    downloadBlob(
      zipBlob,
      "Student-QR-Codes.zip"
    );

    statusText.textContent =
      `Done. Generated ${students.length} QR code(s) across ${pages.length} PNG files.`;
  } catch (error) {
    console.error(error);

    statusText.textContent =
      "Something went wrong while generating the QR codes.";

    alert(
      error.message ||
      String(error)
    );
  }
});
