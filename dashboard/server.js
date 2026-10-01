// server.js - FANA Command Center backend
// Jalan lokal doang (127.0.0.1), TIDAK bisa diakses dari luar laptop kamu.
//
// ARSITEKTUR: toggle/schedule/draftmode di sini CUMA nulis file JSON biasa
// (accounts.json) -- tidak pernah memanggil schtasks. Approve/reject draft
// memanggil publish-draft.js langsung (operasi network biasa, bukan
// schtasks, jadi tidak berisiko macet seperti sebelumnya).
//
// Cara pakai:
//   npm install express   (sekali saja)
//   node server.js
//   buka http://localhost:4242 di browser

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = 4242;

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const DRAFT_STATE_FILE = path.join(__dirname, 'draft-state.json');
const DEFAULT_LOG_FILE = path.join(__dirname, '..', 'skills', 'orchestrator', 'orchestrator-log.jsonl');
const DRAFTS_DIR = path.join(__dirname, '..', 'skills', 'orchestrator', 'drafts');
const ORCHESTRATOR_DIR = path.join(__dirname, '..', 'skills', 'orchestrator');
// BARU: folder simpan foto custom per unit -- PERMANEN di disk, bukan cuma
// di memori browser (yang hilang tiap refresh/restart server). Ditaruh di
// dalam public/ supaya otomatis ke-serve statis lewat express.static di
// bawah, tidak perlu route baru khusus.
const UNIT_ICONS_DIR = path.join(__dirname, 'public', 'unit-icons');
if (!fs.existsSync(UNIT_ICONS_DIR)) fs.mkdirSync(UNIT_ICONS_DIR, { recursive: true });
// BARU: nama task Windows Scheduler yang dikontrol dari dashboard. Hardcode
// sesuai nama task yang sudah ada, TIDAK pernah diganti (sama seperti
// prinsip run-poller.bat: task ini dibuat sekali, jangan diutak-atik).
const POLLER_TASK_NAME = 'FANA-Poller';
// BARU: file cache hasil sync-insights.js (ditulis oleh
// skills/orchestrator/sync-insights.js). Dashboard baca dari SINI, tidak
// pernah manggil Instagram Graph API langsung -- lebih cepat & tidak
// kena rate limit tiap kali dashboard dibuka/refresh.
const INSIGHTS_CACHE_FILE = path.join(__dirname, 'insights-cache.json');

// Tiap akun bisa punya file log sendiri (field "logFile" di accounts.json,
// misal "orchestrator-log-film.jsonl" untuk akun film). Kalau field itu
// tidak ada di 1 akun (akun lama), fallback ke DEFAULT_LOG_FILE -- supaya
// dunia_fana tetap jalan tanpa perlu ubah accounts.json.
function resolveLogFileForAccount(accountId) {
  try {
    const accounts = readAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (acc && acc.logFile) {
      return path.join(__dirname, '..', 'skills', 'orchestrator', acc.logFile);
    }
  } catch (e) {
    // kalau accounts.json gagal dibaca, tetap fallback ke default di bawah
  }
  return DEFAULT_LOG_FILE;
}

app.use(express.json({ limit: '8mb' })); // dinaikkan dari default (100kb) -- foto base64 butuh lebih besar
app.use(express.static(path.join(__dirname, 'public')));
app.use('/draft-images', express.static(DRAFTS_DIR));

function readAccounts() {
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
}
function writeAccounts(data) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}
function readDraftState() {
  if (!fs.existsSync(DRAFT_STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(DRAFT_STATE_FILE, 'utf-8'));
}
function writeDraftState(state) {
  fs.writeFileSync(DRAFT_STATE_FILE, JSON.stringify(state, null, 2));
}
// BARU: baca cache insight. File ini opsional -- kalau belum pernah
// di-generate sync-insights.js sama sekali, jangan error, balikin objek
// kosong saja (endpoint di bawah yang urus artinya "belum ada data").
function readInsightsCache() {
  if (!fs.existsSync(INSIGHTS_CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INSIGHTS_CACHE_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}
function toLocalDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function toLocalTimeKey(isoString) {
  const d = new Date(isoString);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

// --- API: daftar akun (sekarang termasuk status standby/draft/done) ---
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = readAccounts();
    const draftState = readDraftState();
    const merged = accounts.map((acc) => ({
      ...acc,
      status: draftState[acc.id] ? draftState[acc.id].status : 'standby',
    }));
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: toggle ON/OFF sistem (tulis file biasa, aman) ---
app.post('/api/accounts/:id/toggle', (req, res) => {
  try {
    const accounts = readAccounts();
    const acc = accounts.find((a) => a.id === req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    acc.enabled = !acc.enabled;
    writeAccounts(accounts);
    res.json(acc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: toggle mode draft (approve wajib / auto-publish) ---
app.post('/api/accounts/:id/draftmode/toggle', (req, res) => {
  try {
    const accounts = readAccounts();
    const acc = accounts.find((a) => a.id === req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    acc.draftModeEnabled = !acc.draftModeEnabled;
    writeAccounts(accounts);
    res.json(acc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: ubah jam jadwal (tulis file biasa, aman -- tidak ada schtasks) ---
app.post('/api/accounts/:id/schedule', (req, res) => {
  const { time } = req.body;
  if (!/^\d{2}:\d{2}$/.test(time || '')) {
    return res.status(400).json({ error: 'Format jam harus HH:MM' });
  }

  try {
    const accounts = readAccounts();
    const acc = accounts.find((a) => a.id === req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    acc.scheduleTime = time;
    writeAccounts(accounts);
    res.json({ success: true, account: acc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: lihat draft aktif untuk 1 akun ---
app.get('/api/accounts/:id/draft', (req, res) => {
  try {
    const draftState = readDraftState();
    const entry = draftState[req.params.id] || { status: 'standby', draft: null };

    let draftForClient = null;
    if (entry.draft) {
      draftForClient = {
        topic: entry.draft.topic,
        caption: entry.draft.caption,
        highlightText: entry.draft.highlightText,
        createdAt: entry.draft.createdAt,
        imageUrls: entry.draft.imageFileNames.map(
          (name) => `/draft-images/${req.params.id}/${name}`
        ),
      };
    }

    res.json({ status: entry.status, draft: draftForClient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: approve draft -> publish sekarang ---
app.post('/api/accounts/:id/draft/approve', (req, res) => {
  const scriptPath = path.join(ORCHESTRATOR_DIR, 'publish-draft.js');

  execFile('node', [scriptPath, req.params.id], { cwd: ORCHESTRATOR_DIR, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, stderr });
    }
    res.json({ success: true, output: stdout });
  });
});

function appendLogEntry(logFile, entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(logFile, line);
}

// --- API: reject draft -> buang, balik ke standby ---
app.post('/api/accounts/:id/draft/reject', (req, res) => {
  try {
    const draftState = readDraftState();
    const entry = draftState[req.params.id];
    const topic = entry && entry.draft ? entry.draft.topic : null;

    if (entry && entry.draft && Array.isArray(entry.draft.imagePaths)) {
      entry.draft.imagePaths.forEach((p) => {
        try {
          fs.unlinkSync(p);
        } catch (e) {
          // file mungkin sudah tidak ada, tidak masalah
        }
      });
    }

    draftState[req.params.id] = {
      status: 'standby',
      lastStatusDate: toLocalDateKey(new Date()),
      draft: null,
    };
    writeDraftState(draftState);

    // Catat penolakan ini ke log akun terkait, supaya "STATUS TERKINI" di
    // dashboard tidak menggantung nunjukin "draft_ready" seolah masih aktif
    // padahal sudah dibuang manual.
    try {
      const logFile = resolveLogFileForAccount(req.params.id);
      appendLogEntry(logFile, {
        stage: 'rejected',
        status: 'success',
        topic: topic,
        message: 'Draft ditolak & dibuang manual dari dashboard' + (topic ? (': ' + topic) : '.'),
      });
    } catch (logErr) {
      // Gagal nulis log tidak boleh bikin reject gagal -- reject tetap sukses.
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: status/riwayat posting ---
function buildStatusResponse(logFile) {
  if (!fs.existsSync(logFile)) {
    return { history: [], todayCompleted: false, today: toLocalDateKey(new Date()) };
  }

  const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
  const entries = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const byDate = {};
  for (const e of entries) {
    if (!['publish', 'error', 'held', 'skipped', 'draft_ready', 'rejected'].includes(e.stage)) continue;
    const date = toLocalDateKey(new Date(e.timestamp));
    byDate[date] = {
      date,
      time: toLocalTimeKey(e.timestamp),
      stage: e.stage,
      status: e.status || 'success',
      message: e.message,
      postId: e.postId || null,
      topic: e.topic || null,
    };
  }

  const history = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  const today = toLocalDateKey(new Date());
  const todayEntry = byDate[today];
  const todayCompleted = !!(todayEntry && todayEntry.stage === 'publish' && todayEntry.status !== 'error');

  return { history, todayCompleted, today };
}

// Endpoint BARU (dipakai per-kartu akun): status khusus 1 akun, baca file
// log sesuai akun itu (lewat resolveLogFileForAccount).
app.get('/api/status/:id', (req, res) => {
  try {
    const logFile = resolveLogFileForAccount(req.params.id);
    res.json(buildStatusResponse(logFile));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint LAMA (tanpa :id) dipertahankan untuk backward-compat kalau ada
// kode lama yang masih manggil ini -- selalu baca log default (dunia_fana).
app.get('/api/status', (req, res) => {
  try {
    res.json(buildStatusResponse(DEFAULT_LOG_FILE));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API BARU: Insight (reach/followers/per-post) hasil sync-insights.js ---
// Sengaja TIDAK manggil Instagram Graph API langsung dari sini -- cuma baca
// file cache lokal yang sudah ditulis sync-insights.js. Kalau mau data
// terbaru, jalankan "node sync-insights.js" dulu (nanti dijadwalkan
// berkala), baru refresh dashboard.
//
// `available: false` (bukan error 404/500) dipakai untuk 2 kondisi normal:
// akun belum tertaut API (apiConnected != true), ATAU sync-insights.js
// belum pernah dijalankan sama sekali untuk akun itu. Dashboard perlu bisa
// bedain ini dari error beneran, makanya bukan status code error.
app.get('/api/accounts/:id/insights', (req, res) => {
  try {
    const cache = readInsightsCache();
    const entry = cache[req.params.id];
    if (!entry) {
      return res.json({ available: false, reason: 'Belum ada data insight tersinkron untuk akun ini.' });
    }
    res.json({ available: true, ...entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API BARU: upload foto custom per unit -- disimpan PERMANEN ke disk +
// dicatat di accounts.json (field "iconUrl"), BUKAN cuma di memori browser.
// Body: { dataUrl: "data:image/png;base64,...." } -- frontend sudah baca
// file lewat FileReader jadi base64, di sini tinggal didekode & ditulis.
function extFromDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp|gif);base64,/i.exec(dataUrl || '');
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

app.post('/api/accounts/:id/icon', (req, res) => {
  try {
    const dataUrl = req.body && req.body.dataUrl;
    const ext = extFromDataUrl(dataUrl);
    if (!ext) {
      return res.status(400).json({ error: 'Format gambar tidak didukung (harus PNG/JPEG/WEBP/GIF).' });
    }

    const accounts = readAccounts();
    const acc = accounts.find((a) => a.id === req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    // Hapus file lama punya akun ini dulu -- ekstensi baru bisa beda dari
    // yang lama (misal ganti dari .png ke .jpg), jangan sampai numpuk file
    // yatim yang tidak kepakai.
    fs.readdirSync(UNIT_ICONS_DIR)
      .filter((f) => f.startsWith(req.params.id + '.'))
      .forEach((f) => {
        try { fs.unlinkSync(path.join(UNIT_ICONS_DIR, f)); } catch (e) { /* sudah tidak ada, tidak masalah */ }
      });

    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/i, '');
    const fileName = `${req.params.id}.${ext}`;
    fs.writeFileSync(path.join(UNIT_ICONS_DIR, fileName), Buffer.from(base64Data, 'base64'));

    acc.iconUrl = `/unit-icons/${fileName}`;
    writeAccounts(accounts);

    res.json({ success: true, iconUrl: acc.iconUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API BARU: hapus foto custom, balik ke ikon default kategori ---
app.delete('/api/accounts/:id/icon', (req, res) => {
  try {
    const accounts = readAccounts();
    const acc = accounts.find((a) => a.id === req.params.id);
    if (!acc) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    fs.readdirSync(UNIT_ICONS_DIR)
      .filter((f) => f.startsWith(req.params.id + '.'))
      .forEach((f) => {
        try { fs.unlinkSync(path.join(UNIT_ICONS_DIR, f)); } catch (e) { /* sudah tidak ada, tidak masalah */ }
      });

    delete acc.iconUrl;
    writeAccounts(accounts);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API BARU: cek & ubah status FANA-Poller (Windows Task Scheduler) ---
// Manggil PowerShell dari Node (execFile, BUKAN exec -- lebih aman, tidak
// lewat shell interpolation) buat baca/ubah task Scheduler. Ini kategori
// operasi baru buat server.js -- sebelumnya cuma baca/tulis file JSON,
// sekarang beneran menyentuh OS. Timeout 10 detik dipasang jaga-jaga kalau
// PowerShell nyangkut.
function getPollerState(callback) {
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `(Get-ScheduledTask -TaskName '${POLLER_TASK_NAME}').State`],
    { timeout: 10000 },
    (err, stdout, stderr) => {
      if (err) return callback(new Error(stderr && stderr.trim() ? stderr.trim() : err.message));
      const state = stdout.trim();
      if (!state) return callback(new Error('Task Scheduler tidak mengembalikan status apa pun.'));
      callback(null, state);
    }
  );
}

app.get('/api/poller/status', (req, res) => {
  getPollerState((err, state) => {
    if (err) return res.status(500).json({ error: 'Gagal cek status FANA-Poller: ' + err.message });
    // State dari Task Scheduler: "Ready", "Running", "Queued", "Disabled".
    // Cuma "Disabled" yang berarti OFF -- selain itu (termasuk "Running"
    // pas kebetulan lagi eksekusi tick) dianggap ON.
    res.json({ state, enabled: state !== 'Disabled' });
  });
});

app.post('/api/poller/toggle', (req, res) => {
  getPollerState((err, currentState) => {
    if (err) return res.status(500).json({ error: 'Gagal cek status FANA-Poller: ' + err.message });
    const isEnabled = currentState !== 'Disabled';
    const cmdlet = isEnabled ? 'Disable-ScheduledTask' : 'Enable-ScheduledTask';
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `${cmdlet} -TaskName '${POLLER_TASK_NAME}' | Out-Null; (Get-ScheduledTask -TaskName '${POLLER_TASK_NAME}').State`],
      { timeout: 10000 },
      (err2, stdout, stderr) => {
        if (err2) return res.status(500).json({ error: 'Gagal ubah status FANA-Poller: ' + (stderr && stderr.trim() ? stderr.trim() : err2.message) });
        const newState = stdout.trim();
        res.json({ success: true, state: newState, enabled: newState !== 'Disabled' });
      }
    );
  });
});

// --- API BARU: trigger sync-insights.js dari dashboard (tombol "Scan
// Insight"), biar tidak perlu bolak-balik PowerShell manual. Timeout
// dikasih longgar (2 menit) karena ini beneran manggil Instagram Graph API
// berkali-kali (per postingan), bukan operasi file biasa yang instan.
app.post('/api/insights/sync', (req, res) => {
  const scriptPath = path.join(ORCHESTRATOR_DIR, 'sync-insights.js');
  execFile('node', [scriptPath], { cwd: ORCHESTRATOR_DIR, timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, stderr, stdout });
    }
    res.json({ success: true, output: stdout });
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🦞 FANA Command Center jalan di http://localhost:${PORT}`);
  console.log(`   (Cuma bisa diakses dari laptop ini, aman dari luar)`);
});
