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

const QR_SIZE = 218;
const QR_TOP_PADDING = 10;

let detectedStudents = [];

/* ---------------------------------------------------------
   LIBRARY FALLBACK LOADING
   --------------------------------------------------------- */

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load: " + src));
    document.head.appendChild(script);
  });
}

async function ensureQrLibrary() {
  if (typeof QRCode !== "undefined") {
    return true;
  }

  statusText.textContent = "Loading QR library...";

  const fallbacks = [
    "https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.4/qrcode.min.js",
    "https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js"
  ];

  for (const src of fallbacks) {
    try {
      await loadExternalScript(src);

      if (typeof QRCode !== "undefined") {
        return true;
      }
    } catch (error) {
      console.warn(error);
    }
  }

  return false;
}

async function ensureZipLibrary() {
  if (typeof JSZip !== "undefined") {
    return true;
  }

  const fallbacks = [
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
  ];

  for (const src of fallbacks) {
    try {
      await loadExternalScript(src);

      if (typeof JSZip !== "undefined") {
        return true;
      }
    } catch (error) {
      console.warn(error);
    }
  }

  return false;
}

/* ---------------------------------------------------------
   DATA DETECTION
   --------------------------------------------------------- */

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

/* ---------------------------------------------------------
   QR GENERATION
   --------------------------------------------------------- */

function createQrCanvas(text) {
  return new Promise((resolve, reject) => {
    const qrCanvas = document.createElement("canvas");

    QRCode.toCanvas(
      qrCanvas,
      String(text),
      {
        width: QR_SIZE,
        margin: 2,
        errorCorrectionLevel: "M",
        color: {
          dark: "#000000",
          light: "#ffffff"
        }
      },
      error => {
        if (error) {
          reject(error);
        } else {
          resolve(qrCanvas);
        }
      }
    );
  });
}

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

    const x = LEFT_MARGIN + col * (CARD_WIDTH + H_GAP);
    const y = TOP_MARGIN + row * (CARD_HEIGHT + V_GAP);

    ctx.strokeRect(x, y, CARD_WIDTH, CARD_HEIGHT);

    const qrCanvas = await createQrCanvas(student.lrn);

    const qrX = x + Math.round((CARD_WIDTH - QR_SIZE) / 2);
    const qrY = y + QR_TOP_PADDING;

    ctx.drawImage(qrCanvas, qrX, qrY);

    const nameY = y + CARD_HEIGHT - 10;

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

function drawFittedText(ctx, text, centerX, baselineY, maxWidth, startFontSize) {
  let fontSize = startFontSize;

  while (fontSize >= 9) {
    ctx.font = `${fontSize}px Arial`;

    if (ctx.measureText(text).width <= maxWidth) {
      break;
    }

    fontSize--;
  }

  ctx.fillText(text, centerX, baselineY);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Could not create PNG."));
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

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------------------------------------
   EXPORT
   --------------------------------------------------------- */

exportBtn.addEventListener("click", async () => {
  try {
    analyzePastedData();

    const qrReady = await ensureQrLibrary();

    if (!qrReady) {
      alert(
        "The QR code library could not load from any source. Check your internet connection, then refresh the page."
      );
      statusText.textContent = "QR library failed to load.";
      return;
    }

    const students = detectedStudents.filter(student => student.valid);

    if (students.length === 0) {
      alert(
        "No valid students were detected. Each student row needs an exact 12-digit LRN and a detectable student name."
      );
      return;
    }

    const incomplete = detectedStudents.filter(student => !student.valid);

    if (incomplete.length > 0) {
      const proceed = confirm(
        `${incomplete.length} row(s) have an LRN but no student name was identified.\n\n` +
        `Those rows will not be exported.\n\nContinue with ${students.length} ready student(s)?`
      );

      if (!proceed) {
        return;
      }
    }

    statusText.textContent = "Generating QR codes...";

    const pageCount = Math.ceil(students.length / CARDS_PER_PAGE);
    const pages = [];

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const start = pageIndex * CARDS_PER_PAGE;
      const end = start + CARDS_PER_PAGE;
      const pageStudents = students.slice(start, end);

      const canvas = await createPageCanvas(pageStudents);
      const blob = await canvasToBlob(canvas);

      pages.push({
        filename:
          pageCount === 1
            ? "Student-QR-Codes.png"
            : `Student-QR-Codes-${pageIndex + 1}.png`,
        blob
      });
    }

    if (pages.length === 1) {
      downloadBlob(pages[0].blob, pages[0].filename);

      statusText.textContent =
        `Done. Generated ${students.length} QR code(s).`;

      return;
    }

    const zipReady = await ensureZipLibrary();

    if (!zipReady) {
      alert(
        "ZIP library could not load. The PNG pages will be downloaded separately."
      );

      pages.forEach(page => {
        downloadBlob(page.blob, page.filename);
      });

      statusText.textContent =
        `Generated ${students.length} QR code(s). PNG pages downloaded separately.`;

      return;
    }

    const zip = new JSZip();

    pages.forEach(page => {
      zip.file(page.filename, page.blob);
    });

    const zipBlob = await zip.generateAsync({
      type: "blob"
    });

    downloadBlob(zipBlob, "Student-QR-Codes.zip");

    statusText.textContent =
      `Done. Generated ${students.length} QR code(s) across ${pages.length} PNG files.`;
  } catch (error) {
    console.error(error);

    statusText.textContent =
      "Something went wrong while generating the QR codes.";

    alert(error.message || String(error));
  }
});
