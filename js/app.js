// ================================================
//  AKADEMIKAP - Main Application Logic
//  Portal Administrasi Perkantoran PNUP
// ================================================

// ---- AUTH & SESSION ----
const AUTH = {
  users: {
    'admin': 'admin123'  // Default: username=admin, password=admin123
  },
  currentUser: null
};

// Load session dari localStorage
function loadSession() {
  const session = localStorage.getItem('akademikap_session');
  if (session) {
    AUTH.currentUser = session;
    hideLoginContainer();
  } else {
    showLoginContainer();
  }
}

function showLoginContainer() {
  const loginContainer = document.getElementById('login-container');
  if (loginContainer) loginContainer.classList.remove('hidden');
  const appWrapper = document.querySelector('.app-wrapper');
  if (appWrapper) appWrapper.style.display = 'none';
}

function hideLoginContainer() {
  const loginContainer = document.getElementById('login-container');
  if (loginContainer) loginContainer.classList.add('hidden');
  const appWrapper = document.querySelector('.app-wrapper');
  if (appWrapper) appWrapper.style.display = 'block';
}

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  if (AUTH.users[username] && AUTH.users[username] === password) {
    AUTH.currentUser = username;
    localStorage.setItem('akademikap_session', username);
    document.getElementById('user-display').textContent = username.charAt(0).toUpperCase() + username.slice(1);
    document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();
    showToast(`✅ Login berhasil sebagai ${username}!`, 'success');
    hideLoginContainer();
    navigate('dashboard');
  } else {
    showToast('❌ Username atau password salah!', 'error');
  }
  
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

function handleLogout() {
  if (confirm('Yakin ingin logout?')) {
    localStorage.removeItem('akademikap_session');
    AUTH.currentUser = null;
    showToast('👋 Logout berhasil!', 'info');
    showLoginContainer();
  }
}

function openChangePasswordModal() {
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.add('open');
}

function closeChangePasswordModal() {
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.remove('open');
  document.getElementById('pwd-old').value = '';
  document.getElementById('pwd-new').value = '';
  document.getElementById('pwd-confirm').value = '';
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.querySelector('.icon-eye-open').style.display = showing ? 'block' : 'none';
  btn.querySelector('.icon-eye-closed').style.display = showing ? 'none' : 'block';
}

function handleChangePassword(e) {
  e.preventDefault();
  const oldPwd = document.getElementById('pwd-old').value;
  const newPwd = document.getElementById('pwd-new').value;
  const confirmPwd = document.getElementById('pwd-confirm').value;
  
  if (!AUTH.currentUser) {
    showToast('⚠️ Anda belum login!', 'error');
    return;
  }
  
  if (AUTH.users[AUTH.currentUser] !== oldPwd) {
    showToast('❌ Password lama tidak sesuai!', 'error');
    return;
  }
  
  if (newPwd.length < 6) {
    showToast('⚠️ Password baru minimal 6 karakter!', 'warning');
    return;
  }
  
  if (newPwd !== confirmPwd) {
    showToast('❌ Konfirmasi password tidak sesuai!', 'error');
    return;
  }
  
  AUTH.users[AUTH.currentUser] = newPwd;
  showToast('✅ Password berhasil diubah!', 'success');
  closeChangePasswordModal();
}

// ---- STATE ----
const STATE = {
  currentPage: 'dashboard',
  data: { mahasiswa: [], dosen: [], staf: [], mataKuliah: [], nilai: [], jadwal: [], akunKetua: [], ruangan: [] },
  loaded: false,
  editingId: null,
  raporCache: {},
  filters: {
    mahasiswa: { search: '' },
    dosen: { search: '' },
    staf: { search: '' },
    matkul: { search: '' },
    nilai: { mahasiswa: 'all', matkul: 'all', semester: 'all', search: '' }
  }
};

// ================================================
// FETCH HELPERS (Apps Script CRUD)
// ================================================
async function apiGet(action, extraParams) {
  if (!APPS_SCRIPT_URL) { showToast('⚠️ APPS_SCRIPT_URL belum diisi di data/config.js', 'error'); return null; }
  let url = `${APPS_SCRIPT_URL}?action=${action}`;
  if (extraParams) url += '&' + extraParams;

  const attempts = [
    () => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) }),
    () => fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(12000) }),
    () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(12000) }),
    () => fetch(`https://thingproxy.freeboard.io/fetch/${url}`, { signal: AbortSignal.timeout(12000) })
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim() === '') continue;
      const json = JSON.parse(text);
      if (json.status === 'success') return json;
      if (json.status === 'error') { showToast('❌ ' + json.message, 'error'); return null; }
    } catch (e) { continue; }
  }
  showToast('❌ Gagal terhubung ke server. Pastikan Apps Script sudah di-deploy dengan akses "Anyone".', 'error');
  return null;
}

async function apiPost(action, payload) {
  if (!APPS_SCRIPT_URL) { showToast('⚠️ APPS_SCRIPT_URL belum diisi di data/config.js', 'error'); return null; }
  try {
    // Kirim sebagai JSON string dalam parameter URL (hindari base64)
    const jsonStr = JSON.stringify({ action, ...payload });
    const url = `${APPS_SCRIPT_URL}?_method=POST&_json=${encodeURIComponent(jsonStr)}`;
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (json.status === 'error') { showToast('❌ ' + json.message, 'error'); return null; }
        return json;
      } catch(e) { return { status: 'success' }; }
    }
    return { status: 'success' };
  } catch (e) {
    showToast('❌ Gagal mengirim data ke server', 'error');
    return null;
  }
}

// ================================================
// LOAD ALL DATA
// ================================================
async function loadAllData(force) {
  if (STATE.loaded && !force) return;
  const result = await apiGet('getAll');
  if (result && result.data) {
    STATE.data.mahasiswa = result.data.mahasiswa || [];
    STATE.data.dosen = result.data.dosen || [];
    STATE.data.staf = result.data.staf || [];
    STATE.data.mataKuliah = result.data.mataKuliah || [];
    STATE.data.nilai = result.data.nilai || [];
    STATE.data.jadwal = result.data.jadwal || [];
    STATE.data.akunKetua = result.data.akunKetua || [];
    STATE.data.ruangan   = result.data.ruangan   || [];
    STATE.loaded = true;
  }
}

// ---- ROUTER ----
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`page-${page}`);
  if (target) { target.classList.add('active'); STATE.currentPage = page; }
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add('active'));

  if (page === 'dashboard') renderDashboard();
  if (page === 'mahasiswa') renderMahasiswaPage();
  if (page === 'dosen') renderDosenPage();
  if (page === 'staf') renderStafPage();
  if (page === 'matkul') renderMatkulPage();
  if (page === 'nilai') renderNilaiPage();
  if (page === 'rapor') renderRaporPage();
  if (page === 'jadwal') renderJadwalPage();
  if (page === 'jadwal-publik') renderJadwalPublik();
  if (page === 'status-kuliah') renderStatusKuliah();
  if (page === 'akun-ketua') renderAkunKetuaPage();
  if (page === 'ruangan') renderRuanganPage();

  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
  window.scrollTo(0, 0);
}

// ================================================
// UTILS
// ================================================
function updateTopbar(title, sub) {
  const t = document.getElementById('topbar-title');
  const s = document.getElementById('topbar-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const colors = { success: '#10B981', error: '#F43F5E', info: '#22D3EE', warning: '#D4AF37' };
  toast.innerHTML = `<span>${msg}</span>`;
  toast.style.borderLeft = `3px solid ${colors[type] || colors.info}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('akademikap_theme', next);
  document.querySelectorAll('.theme-toggle').forEach(b => b.textContent = next === 'dark' ? '🌙 Mode Gelap' : '☀️ Mode Terang');
  document.querySelectorAll('#theme-btn-top').forEach(b => b.textContent = next === 'dark' ? '🌙' : '☀️');
}

function getGrade(score) {
  if (score >= 85) return { label: 'A', color: '#10B981', bobot: 4.0 };
  if (score >= 80) return { label: 'B+', color: '#22D3EE', bobot: 3.5 };
  if (score >= 75) return { label: 'B', color: '#34D399', bobot: 3.0 };
  if (score >= 70) return { label: 'C+', color: '#D4AF37', bobot: 2.5 };
  if (score >= 60) return { label: 'C', color: '#F59E0B', bobot: 2.0 };
  if (score >= 50) return { label: 'D', color: '#F97316', bobot: 1.0 };
  return { label: 'E', color: '#F43F5E', bobot: 0 };
}

function hitungSkorPreview(tugas, praktik, uts, uas, absen) {
  const b = CONFIG.bobotNilai;
  const skorMentah = (tugas * b.tugas) + (praktik * b.praktik) + (uts * b.uts) + (uas * b.uas) + (absen * b.absen);
  const skorNormalisasi = Math.round((skorMentah / CONFIG.totalBobot) * 100) / 100;
  return { skorMentah: Math.round(skorMentah * 100) / 100, skorNormalisasi, grade: getGrade(skorNormalisasi) };
}

// ================================================
// DASHBOARD
// ================================================
async function renderDashboard() {
  updateTopbar('Dashboard', 'Ringkasan data akademik Program Studi Administrasi Perkantoran');
  await loadAllData();

  const totalMhs = STATE.data.mahasiswa.length;
  const totalDosen = STATE.data.dosen.length;
  const totalMatkul = STATE.data.mataKuliah.length;
  const totalNilai = STATE.data.nilai.length;

  setText('dash-mahasiswa', totalMhs);
  setText('dash-dosen', totalDosen);
  setText('dash-matkul', totalMatkul);
  setText('dash-nilai', totalNilai);

  // Rata-rata IPK seluruh mahasiswa (dari semua nilai yang sudah masuk)
  const byMhs = {};
  STATE.data.nilai.forEach(n => {
    const nim = n['NIM Mahasiswa'];
    if (!byMhs[nim]) byMhs[nim] = [];
    byMhs[nim].push(Number(n['Bobot IP']) || 0);
  });
  const ipkList = Object.values(byMhs).map(arr => arr.reduce((a,b)=>a+b,0) / arr.length);
  const avgIpk = ipkList.length ? (ipkList.reduce((a,b)=>a+b,0) / ipkList.length) : 0;

  renderDashIpkCard(avgIpk, ipkList.length);
  renderRecentNilai();
  renderTopMahasiswa(byMhs);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderDashIpkCard(avgIpk, jumlahMhs) {
  const container = document.getElementById('dash-ipk-card');
  if (!container) return;
  const pct = Math.min((avgIpk / 4) * 100, 100);
  const radius = 68, circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;
  const predikat = avgIpk >= 3.5 ? 'Cumlaude' : avgIpk >= 3.0 ? 'Sangat Memuaskan' : avgIpk >= 2.5 ? 'Memuaskan' : avgIpk > 0 ? 'Cukup' : '-';

  container.innerHTML = `
    <div class="ipk-ring-wrap">
      <svg width="156" height="156" viewBox="0 0 156 156">
        <circle cx="78" cy="78" r="${radius}" fill="none" stroke="var(--border)" stroke-width="11"/>
        <circle cx="78" cy="78" r="${radius}" fill="none" stroke="var(--accent)" stroke-width="11"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ}" stroke-linecap="round"
          id="dash-ipk-ring" style="transition:stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1);"/>
      </svg>
      <div class="ipk-ring-inner">
        <div class="ipk-num">${avgIpk.toFixed(2)}</div>
        <div class="ipk-num-lbl">Rata-rata IPK</div>
      </div>
    </div>
    <div class="ipk-detail">
      <div class="ipk-detail-title">📊 Performa Akademik Prodi</div>
      <div class="ipk-detail-sub">Berdasarkan ${jumlahMhs} mahasiswa yang sudah memiliki nilai tersimpan di sistem</div>
      <span class="ipk-badge" style="background:var(--accent-subtle); color:var(--accent); border:1px solid var(--accent-border);">🏅 ${predikat}</span>
    </div>`;

  setTimeout(() => {
    const ring = document.getElementById('dash-ipk-ring');
    if (ring) ring.style.strokeDashoffset = circ - dash;
  }, 100);
}

function renderRecentNilai() {
  const container = document.getElementById('recent-nilai');
  if (!container) return;
  const recent = [...STATE.data.nilai].sort((a,b) => new Date(b['Tanggal Input']) - new Date(a['Tanggal Input'])).slice(0, 6);

  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:36px;"><div class="empty-state-icon">📝</div><div class="empty-state-title">Belum ada nilai</div><div class="empty-state-text">Input nilai mahasiswa untuk melihat aktivitas di sini</div></div>`;
    return;
  }
  container.innerHTML = recent.map(n => {
    const grade = getGrade(n['Skor Normalisasi']);
    return `<div style="display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid var(--border);">
      <div style="width:34px; height:34px; border-radius:9px; background:${grade.color}18; color:${grade.color}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; flex-shrink:0;">${n['Nilai Huruf']}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n['Nama Mahasiswa']}</div>
        <div style="font-size:11px; color:var(--text-muted);">${n['Nama Mata Kuliah']} · Semester ${n['Semester']}</div>
      </div>
      <div style="font-weight:800; color:${grade.color}; font-size:13px;">${n['Skor Normalisasi']}</div>
    </div>`;
  }).join('');
}

function renderTopMahasiswa(byMhs) {
  const container = document.getElementById('top-mahasiswa');
  if (!container) return;
  const entries = Object.entries(byMhs).map(([nim, bobots]) => {
    const mhs = STATE.data.mahasiswa.find(m => String(m.NIM) === String(nim));
    const ipk = bobots.reduce((a,b)=>a+b,0) / bobots.length;
    return { nim, nama: mhs ? mhs.Nama : nim, ipk };
  }).sort((a,b) => b.ipk - a.ipk).slice(0, 5);

  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-state-text">Belum ada data</div></div>`;
    return;
  }
  const medals = ['🥇','🥈','🥉'];
  container.innerHTML = entries.map((e, i) => `
    <div style="display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border);">
      <span style="width:22px; text-align:center; font-size:13px;">${i<3?medals[i]:'#'+(i+1)}</span>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${e.nama}</div>
        <div style="font-size:10px; color:var(--text-muted); font-family:monospace;">${e.nim}</div>
      </div>
      <div style="font-weight:800; color:var(--accent); font-size:13px;">${e.ipk.toFixed(2)}</div>
    </div>`).join('');
}

// ================================================
// MAHASISWA (CRUD)
// ================================================
async function renderMahasiswaPage() {
  updateTopbar('Data Mahasiswa', 'Kelola data induk mahasiswa Program Studi Administrasi Perkantoran');
  await loadAllData();
  const container = document.getElementById('mahasiswa-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari Mahasiswa</label>
          <input type="text" id="mhs-search" class="filter-input" placeholder="Cari nama, NIM, angkatan..." oninput="renderMahasiswaTable()">
        </div>
        <button class="btn btn-primary" onclick="openMahasiswaModal()">➕ Tambah Mahasiswa</button>
      </div>
    </div>
    <div id="mhs-table-wrap"></div>`;
  renderMahasiswaTable();
}

function renderMahasiswaTable() {
  const wrap = document.getElementById('mhs-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('mhs-search')?.value || '').toLowerCase();
  const filtered = STATE.data.mahasiswa.filter(m =>
    !search || Object.values(m).some(v => String(v).toLowerCase().includes(search))
  ).sort((a,b) => String(a.Nama).localeCompare(String(b.Nama)));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎓</div><div class="empty-state-title">Belum ada data mahasiswa</div><div class="empty-state-text">Klik "Tambah Mahasiswa" untuk menambahkan data baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center">
        <thead><tr><th>NIM</th><th class="col-left">Nama</th><th>Kelas</th><th>Angkatan</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filtered.map(m => `
            <tr>
              <td style="font-family:monospace;">${m.NIM}</td>
              <td class="col-left"><strong>${m.Nama}</strong></td>
              <td><span style="background:var(--accent-subtle);color:var(--accent);padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid var(--accent-border);">${m.Kelas||'-'}</span></td>
              <td>${m.Angkatan}</td>
              <td><span class="score-pill" style="color:${m.Status==='Aktif'?'var(--accent)':'var(--rose)'};">${m.Status}</span></td>
              <td>
                <div style="display:flex; gap:6px; justify-content:center;">
                  <button class="btn-row-action edit" onclick='openMahasiswaModal(${JSON.stringify(m).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusMahasiswa('${m.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openMahasiswaModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-mhs-title').textContent = data ? 'Edit Mahasiswa' : 'Tambah Mahasiswa';
  document.getElementById('mhs-nim').value = data ? data.NIM : '';
  document.getElementById('mhs-nama').value = data ? data.Nama : '';
  document.getElementById('mhs-kelas').value = data ? data.Kelas : '';
  document.getElementById('mhs-angkatan').value = data ? data.Angkatan : '';
  document.getElementById('mhs-status').value = data ? data.Status : 'Aktif';
  document.getElementById('modal-mahasiswa').classList.add('open');
}
function closeMahasiswaModal() {
  document.getElementById('modal-mahasiswa').classList.remove('open');
  STATE.editingId = null;
}

async function submitMahasiswa() {
  const nim = document.getElementById('mhs-nim').value.trim();
  const nama = document.getElementById('mhs-nama').value.trim();
  const kelas = document.getElementById('mhs-kelas').value.trim();
  const angkatan = document.getElementById('mhs-angkatan').value.trim();
  const status = document.getElementById('mhs-status').value;

  if (!nim || !nama || !kelas || !angkatan) { showToast('⚠️ NIM, Nama, Kelas, dan Angkatan wajib diisi', 'warning'); return; }

  const payload = { nim, nama, kelas, angkatan, status };
  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editMahasiswa', payload);
    const idx = STATE.data.mahasiswa.findIndex(m => m.ID === STATE.editingId);
    if (idx > -1) STATE.data.mahasiswa[idx] = { ...STATE.data.mahasiswa[idx], NIM: nim, Nama: nama, Kelas: kelas, Angkatan: angkatan, Status: status };
    showToast('✅ Data mahasiswa berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addMahasiswa', payload);
    STATE.data.mahasiswa.push({ ID: tempId, NIM: nim, Nama: nama, Kelas: kelas, Angkatan: angkatan, Status: status, 'Tanggal Daftar': new Date().toISOString() });
    showToast('✅ Mahasiswa berhasil ditambahkan', 'success');
  }
  closeMahasiswaModal();
  renderMahasiswaTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusMahasiswa(id) {
  if (!confirm('Yakin ingin menghapus data mahasiswa ini? Data nilai terkait TIDAK ikut terhapus otomatis.')) return;
  await apiPost('deleteMahasiswa', { id });
  STATE.data.mahasiswa = STATE.data.mahasiswa.filter(m => m.ID !== id);
  showToast('🗑️ Mahasiswa berhasil dihapus', 'warning');
  renderMahasiswaTable();
}

// ================================================
// DOSEN (CRUD)
// ================================================
async function renderDosenPage() {
  updateTopbar('Data Dosen', 'Kelola data induk dosen pengajar');
  await loadAllData();
  const container = document.getElementById('dosen-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari Dosen</label>
          <input type="text" id="dsn-search" class="filter-input" placeholder="Cari nama, NIDN, jabatan..." oninput="renderDosenTable()">
        </div>
        <button class="btn btn-primary" onclick="openDosenModal()">➕ Tambah Dosen</button>
      </div>
    </div>
    <div id="dsn-table-wrap"></div>`;
  renderDosenTable();
}

function renderDosenTable() {
  const wrap = document.getElementById('dsn-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('dsn-search')?.value || '').toLowerCase();
  const filtered = STATE.data.dosen.filter(d =>
    !search || Object.values(d).some(v => String(v).toLowerCase().includes(search))
  ).sort((a,b) => String(a.Nama).localeCompare(String(b.Nama)));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🧑‍🏫</div><div class="empty-state-title">Belum ada data dosen</div><div class="empty-state-text">Klik "Tambah Dosen" untuk menambahkan data baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center">
        <thead><tr><th>NIDN</th><th class="col-left">Nama</th><th>Jabatan</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filtered.map(d => `
            <tr>
              <td style="font-family:monospace;">${d.NIDN}</td>
              <td class="col-left"><strong>${d.Nama}</strong></td>
              <td>${d.Jabatan}</td>
              <td>
                <div style="display:flex; gap:6px; justify-content:center;">
                  <button class="btn-row-action edit" onclick='openDosenModal(${JSON.stringify(d).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusDosen('${d.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openDosenModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-dsn-title').textContent = data ? 'Edit Dosen' : 'Tambah Dosen';
  document.getElementById('dsn-nidn').value = data ? data.NIDN : '';
  document.getElementById('dsn-nama').value = data ? data.Nama : '';
  document.getElementById('dsn-jabatan').value = data ? data.Jabatan : '';
  document.getElementById('modal-dosen').classList.add('open');
}
function closeDosenModal() {
  document.getElementById('modal-dosen').classList.remove('open');
  STATE.editingId = null;
}

async function submitDosen() {
  const nidn = document.getElementById('dsn-nidn').value.trim();
  const nama = document.getElementById('dsn-nama').value.trim();
  const jabatan = document.getElementById('dsn-jabatan').value.trim();

  if (!nidn || !nama) { showToast('⚠️ NIDN dan Nama wajib diisi', 'warning'); return; }

  const payload = { nidn, nama, jabatan };
  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editDosen', payload);
    const idx = STATE.data.dosen.findIndex(d => d.ID === STATE.editingId);
    if (idx > -1) STATE.data.dosen[idx] = { ...STATE.data.dosen[idx], NIDN: nidn, Nama: nama, Jabatan: jabatan };
    showToast('✅ Data dosen berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addDosen', payload);
    STATE.data.dosen.push({ ID: tempId, NIDN: nidn, Nama: nama, Jabatan: jabatan, 'Tanggal Daftar': new Date().toISOString() });
    showToast('✅ Dosen berhasil ditambahkan', 'success');
  }
  closeDosenModal();
  renderDosenTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusDosen(id) {
  if (!confirm('Yakin ingin menghapus data dosen ini?')) return;
  await apiPost('deleteDosen', { id });
  STATE.data.dosen = STATE.data.dosen.filter(d => d.ID !== id);
  showToast('🗑️ Dosen berhasil dihapus', 'warning');
  renderDosenTable();
}

// ================================================
// STAF (CRUD)
// ================================================
async function renderStafPage() {
  updateTopbar('Data Staf', 'Kelola data induk staf administrasi');
  await loadAllData();
  const container = document.getElementById('staf-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari Staf</label>
          <input type="text" id="stf-search" class="filter-input" placeholder="Cari nama, jabatan..." oninput="renderStafTable()">
        </div>
        <button class="btn btn-primary" onclick="openStafModal()">➕ Tambah Staf</button>
      </div>
    </div>
    <div id="stf-table-wrap"></div>`;
  renderStafTable();
}

function renderStafTable() {
  const wrap = document.getElementById('stf-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('stf-search')?.value || '').toLowerCase();
  const filtered = STATE.data.staf.filter(s =>
    !search || Object.values(s).some(v => String(v).toLowerCase().includes(search))
  ).sort((a,b) => String(a.Nama).localeCompare(String(b.Nama)));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Belum ada data staf</div><div class="empty-state-text">Klik "Tambah Staf" untuk menambahkan data baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center">
        <thead><tr><th class="col-left">Nama</th><th>Jabatan</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filtered.map(s => `
            <tr>
              <td class="col-left"><strong>${s.Nama}</strong></td>
              <td>${s.Jabatan}</td>
              <td>
                <div style="display:flex; gap:6px; justify-content:center;">
                  <button class="btn-row-action edit" onclick='openStafModal(${JSON.stringify(s).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusStaf('${s.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openStafModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-stf-title').textContent = data ? 'Edit Staf' : 'Tambah Staf';
  document.getElementById('stf-nama').value = data ? data.Nama : '';
  document.getElementById('stf-jabatan').value = data ? data.Jabatan : '';
  document.getElementById('modal-staf').classList.add('open');
}
function closeStafModal() {
  document.getElementById('modal-staf').classList.remove('open');
  STATE.editingId = null;
}

async function submitStaf() {
  const nama = document.getElementById('stf-nama').value.trim();
  const jabatan = document.getElementById('stf-jabatan').value.trim();

  if (!nama || !jabatan) { showToast('⚠️ Nama dan Jabatan wajib diisi', 'warning'); return; }

  const payload = { nama, jabatan };
  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editStaf', payload);
    const idx = STATE.data.staf.findIndex(s => s.ID === STATE.editingId);
    if (idx > -1) STATE.data.staf[idx] = { ...STATE.data.staf[idx], Nama: nama, Jabatan: jabatan };
    showToast('✅ Data staf berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addStaf', payload);
    STATE.data.staf.push({ ID: tempId, Nama: nama, Jabatan: jabatan, 'Tanggal Daftar': new Date().toISOString() });
    showToast('✅ Staf berhasil ditambahkan', 'success');
  }
  closeStafModal();
  renderStafTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusStaf(id) {
  if (!confirm('Yakin ingin menghapus data staf ini?')) return;
  await apiPost('deleteStaf', { id });
  STATE.data.staf = STATE.data.staf.filter(s => s.ID !== id);
  showToast('🗑️ Staf berhasil dihapus', 'warning');
  renderStafTable();
}

// ================================================
// MATA KULIAH (CRUD)
// ================================================
async function renderMatkulPage() {
  updateTopbar('Mata Kuliah', 'Kelola data induk mata kuliah Program Studi Administrasi Perkantoran');
  await loadAllData();
  const container = document.getElementById('matkul-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari Mata Kuliah</label>
          <input type="text" id="mk-search" class="filter-input" placeholder="Cari kode, nama mata kuliah..." oninput="renderMatkulTable()">
        </div>
        <button class="btn btn-primary" onclick="openMatkulModal()">➕ Tambah Mata Kuliah</button>
      </div>
    </div>
    <div id="mk-table-wrap"></div>`;
  renderMatkulTable();
}

function renderMatkulTable() {
  const wrap = document.getElementById('mk-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('mk-search')?.value || '').toLowerCase();
  const filtered = STATE.data.mataKuliah.filter(m =>
    !search || Object.values(m).some(v => String(v).toLowerCase().includes(search))
  ).sort((a,b) => Number(a.Semester) - Number(b.Semester));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-title">Belum ada data mata kuliah</div><div class="empty-state-text">Klik "Tambah Mata Kuliah" untuk menambahkan data baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center">
        <thead><tr><th>Kode</th><th class="col-left">Nama Mata Kuliah</th><th>Semester</th><th>Kelas</th><th class="col-left">Dosen Pengampu</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filtered.map(m => `
            <tr>
              <td style="font-family:monospace;">${m.Kode}</td>
              <td class="col-left"><strong>${m['Nama Mata Kuliah']}</strong></td>
              <td>${m.Semester}</td>
              <td>${m['Kelas'] ? String(m['Kelas']).split(',').map(k => `<span style="background:var(--accent-subtle);color:var(--accent);padding:1px 7px;border-radius:6px;font-size:10px;font-weight:700;border:1px solid var(--accent-border);margin:1px;display:inline-block;">${k.trim()}</span>`).join('') : '-'}</td>
              <td class="col-left">${m['Dosen Pengampu']||'-'}</td>
              <td>
                <div style="display:flex; gap:6px; justify-content:center;">
                  <button class="btn-row-action edit" onclick='openMatkulModal(${JSON.stringify(m).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusMatkul('${m.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openMatkulModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-mk-title').textContent = data ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah';
  document.getElementById('mk-kode').value = data ? data.Kode : '';
  document.getElementById('mk-nama').value = data ? data['Nama Mata Kuliah'] : '';
  document.getElementById('mk-semester').value = data ? data.Semester : '';

  // Isi daftar dosen dengan checkbox
  const dosenList = document.getElementById('mk-dosen-list');
  const selectedDosen = data ? String(data['Dosen Pengampu']||'').split(',').map(d => d.trim()).filter(Boolean) : [];
  if (dosenList) {
    if (STATE.data.dosen.length === 0) {
      dosenList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px;">Belum ada data dosen</div>';
    } else {
      dosenList.innerHTML = STATE.data.dosen.map(d => `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 6px;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-glass)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" value="${d.Nama}" ${selectedDosen.includes(d.Nama) ? 'checked' : ''}
            style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;">
          <span style="font-size:12px;color:var(--text-primary);">${d.Nama}</span>
        </label>`).join('');
    }
  }

  // Isi daftar kelas dengan checkbox (dari data mahasiswa yang ada)
  const kelasList = document.getElementById('mk-kelas-list');
  const selectedKelas = data ? String(data['Kelas']||'').split(',').map(k => k.trim()).filter(Boolean) : [];
  const allKelas = [...new Set(STATE.data.mahasiswa.map(m => m.Kelas).filter(Boolean))].sort();
  if (kelasList) {
    if (allKelas.length === 0) {
      kelasList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px;">Belum ada data kelas</div>';
    } else {
      kelasList.innerHTML = allKelas.map(k => `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:5px 10px;border-radius:8px;border:1.5px solid ${selectedKelas.includes(k) ? 'var(--accent)' : 'var(--border)'};background:${selectedKelas.includes(k) ? 'var(--accent-subtle)' : 'var(--bg-glass)'};transition:all 0.15s;">
          <input type="checkbox" value="${k}" ${selectedKelas.includes(k) ? 'checked' : ''}
            style="width:14px;height:14px;accent-color:var(--accent);cursor:pointer;"
            onchange="this.parentElement.style.borderColor=this.checked?'var(--accent)':'var(--border)';this.parentElement.style.background=this.checked?'var(--accent-subtle)':'var(--bg-glass)'">
          <span style="font-size:12px;font-weight:700;color:var(--accent);">${k}</span>
        </label>`).join('');
    }
  }

  document.getElementById('modal-matkul').classList.add('open');
}
function closeMatkulModal() {
  document.getElementById('modal-matkul').classList.remove('open');
  STATE.editingId = null;
}

async function submitMatkul() {
  const kode = document.getElementById('mk-kode').value.trim();
  const namaMatkul = document.getElementById('mk-nama').value.trim();
  const semester = document.getElementById('mk-semester').value.trim();
  const dosenChecked = [...document.querySelectorAll('#mk-dosen-list input[type="checkbox"]:checked')].map(cb => cb.value);
  const dosenPengampu = dosenChecked.join(', ');
  const kelasChecked = [...document.querySelectorAll('#mk-kelas-list input[type="checkbox"]:checked')].map(cb => cb.value);
  const kelas = kelasChecked.join(', ');

  if (!kode || !namaMatkul || !semester) { showToast('⚠️ Kode, Nama, dan Semester wajib diisi', 'warning'); return; }

  const payload = { kode, namaMatkul, semester, kelas, dosenPengampu };
  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editMataKuliah', payload);
    const idx = STATE.data.mataKuliah.findIndex(m => m.ID === STATE.editingId);
    if (idx > -1) STATE.data.mataKuliah[idx] = { ...STATE.data.mataKuliah[idx], Kode: kode, 'Nama Mata Kuliah': namaMatkul, Semester: semester, Kelas: kelas, 'Dosen Pengampu': dosenPengampu };
    showToast('✅ Data mata kuliah berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addMataKuliah', payload);
    STATE.data.mataKuliah.push({ ID: tempId, Kode: kode, 'Nama Mata Kuliah': namaMatkul, Semester: semester, Kelas: kelas, 'Dosen Pengampu': dosenPengampu, 'Tanggal Dibuat': new Date().toISOString() });
    showToast('✅ Mata kuliah berhasil ditambahkan', 'success');
  }
  closeMatkulModal();
  renderMatkulTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusMatkul(id) {
  if (!confirm('Yakin ingin menghapus data mata kuliah ini?')) return;
  await apiPost('deleteMataKuliah', { id });
  STATE.data.mataKuliah = STATE.data.mataKuliah.filter(m => m.ID !== id);
  showToast('🗑️ Mata kuliah berhasil dihapus', 'warning');
  renderMatkulTable();
}

// ================================================
// INPUT NILAI
// ================================================
async function renderNilaiPage() {
  updateTopbar('Input Nilai', 'Input dan kelola nilai mahasiswa per mata kuliah per semester');
  await loadAllData();
  const container = document.getElementById('nilai-content');
  if (!container) return;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 380px 1fr; gap:24px; align-items:flex-start;">
      <div class="card">
        <div class="card-body">
          <div class="section-eyebrow" style="margin-bottom:14px;">✍️ Form Input Nilai</div>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div class="form-group">
              <label class="form-label">Mahasiswa <span class="req">*</span></label>
              <select id="nl-mahasiswa" class="form-select">
                <option value="">— Pilih Mahasiswa —</option>
                ${STATE.data.mahasiswa.map(m => `<option value="${m.NIM}" data-nama="${m.Nama}">${m.Nama} (${m.NIM})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Mata Kuliah <span class="req">*</span></label>
              <select id="nl-matkul" class="form-select">
                <option value="">— Pilih Mata Kuliah —</option>
                ${STATE.data.mataKuliah.map(m => `<option value="${m.Kode}" data-nama="${m['Nama Mata Kuliah']}" data-semester="${m.Semester}">${m.Kode} — ${m['Nama Mata Kuliah']} (Smt ${m.Semester})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Semester <span class="req">*</span></label>
              <input type="number" id="nl-semester" class="form-input" placeholder="Contoh: 1, 2, 3..." min="1" max="14">
              <div class="form-hint">Otomatis terisi sesuai mata kuliah, bisa diubah manual</div>
            </div>
            <div style="border-top:1.5px solid var(--border); padding-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-group">
                <label class="form-label">Tugas (20%)</label>
                <input type="number" id="nl-tugas" class="form-input" placeholder="0-100" min="0" max="100" oninput="updatePreviewNilai()">
              </div>
              <div class="form-group">
                <label class="form-label">Praktik (50%)</label>
                <input type="number" id="nl-praktik" class="form-input" placeholder="0-100" min="0" max="100" oninput="updatePreviewNilai()">
              </div>
              <div class="form-group">
                <label class="form-label">UTS (25%)</label>
                <input type="number" id="nl-uts" class="form-input" placeholder="0-100" min="0" max="100" oninput="updatePreviewNilai()">
              </div>
              <div class="form-group">
                <label class="form-label">UAS (35%)</label>
                <input type="number" id="nl-uas" class="form-input" placeholder="0-100" min="0" max="100" oninput="updatePreviewNilai()">
              </div>
              <div class="form-group full">
                <label class="form-label">Absen (5%)</label>
                <input type="number" id="nl-absen" class="form-input" placeholder="0-100" min="0" max="100" oninput="updatePreviewNilai()">
              </div>
            </div>

            <div id="nilai-preview-box" style="display:none; border-radius:var(--radius-lg); padding:18px; text-align:center; border:1.5px solid var(--accent-border); background:var(--accent-subtle);">
              <div style="font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">Pratinjau Hasil</div>
              <div style="display:flex; align-items:center; justify-content:center; gap:18px;">
                <div>
                  <div class="serif" id="preview-skor" style="font-size:28px; font-weight:700; color:var(--accent);">0</div>
                  <div style="font-size:10px; color:var(--text-muted);">Skor Akhir</div>
                </div>
                <div style="width:1px; height:32px; background:var(--border);"></div>
                <div>
                  <div class="serif" id="preview-huruf" style="font-size:28px; font-weight:700; color:var(--accent);">-</div>
                  <div style="font-size:10px; color:var(--text-muted);">Nilai Huruf</div>
                </div>
                <div style="width:1px; height:32px; background:var(--border);"></div>
                <div>
                  <div class="serif" id="preview-bobot" style="font-size:28px; font-weight:700; color:var(--accent);">0</div>
                  <div style="font-size:10px; color:var(--text-muted);">Bobot IP</div>
                </div>
              </div>
            </div>

            <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="submitNilai()">💾 Simpan Nilai</button>
          </div>
        </div>
      </div>

      <div>
        <div class="filter-bar-wrap">
          <div class="filter-row">
            <div class="filter-group">
              <label class="filter-label">🎓 Mahasiswa</label>
              <select id="nl-filter-mhs" class="filter-select" onchange="applyNilaiFilter()">
                <option value="all">— Semua Mahasiswa —</option>
                ${STATE.data.mahasiswa.map(m => `<option value="${m.NIM}">${m.Nama}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group">
              <label class="filter-label">📚 Mata Kuliah</label>
              <select id="nl-filter-mk" class="filter-select" onchange="applyNilaiFilter()">
                <option value="all">— Semua Mata Kuliah —</option>
                ${STATE.data.mataKuliah.map(m => `<option value="${m.Kode}">${m['Nama Mata Kuliah']}</option>`).join('')}
              </select>
            </div>
            <div class="filter-group" style="flex:1;">
              <label class="filter-label">🔍 Cari</label>
              <input type="text" id="nl-filter-search" class="filter-input" placeholder="Cari nama, NIM, mata kuliah..." oninput="applyNilaiFilter()">
            </div>
          </div>
        </div>
        <div id="nl-table-wrap"></div>
      </div>
    </div>`;

  // Auto-fill semester saat mata kuliah dipilih
  document.getElementById('nl-matkul').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.semester) document.getElementById('nl-semester').value = opt.dataset.semester;
  });

  renderNilaiTable();
}

function updatePreviewNilai() {
  const tugas = Number(document.getElementById('nl-tugas').value) || 0;
  const praktik = Number(document.getElementById('nl-praktik').value) || 0;
  const uts = Number(document.getElementById('nl-uts').value) || 0;
  const uas = Number(document.getElementById('nl-uas').value) || 0;
  const absen = Number(document.getElementById('nl-absen').value) || 0;

  const box = document.getElementById('nilai-preview-box');
  if (tugas === 0 && praktik === 0 && uts === 0 && uas === 0 && absen === 0) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  const hasil = hitungSkorPreview(tugas, praktik, uts, uas, absen);
  document.getElementById('preview-skor').textContent = hasil.skorNormalisasi;
  document.getElementById('preview-huruf').textContent = hasil.grade.label;
  document.getElementById('preview-huruf').style.color = hasil.grade.color;
  document.getElementById('preview-skor').style.color = hasil.grade.color;
  document.getElementById('preview-bobot').textContent = hasil.grade.bobot.toFixed(2);
  document.getElementById('preview-bobot').style.color = hasil.grade.color;
}

async function submitNilai() {
  const mhsSelect = document.getElementById('nl-mahasiswa');
  const mkSelect = document.getElementById('nl-matkul');
  const nim = mhsSelect.value;
  const namaMahasiswa = mhsSelect.selectedOptions[0]?.dataset.nama;
  const kodeMk = mkSelect.value;
  const namaMatkul = mkSelect.selectedOptions[0]?.dataset.nama;
  const semester = document.getElementById('nl-semester').value;

  const tugas = Number(document.getElementById('nl-tugas').value) || 0;
  const praktik = Number(document.getElementById('nl-praktik').value) || 0;
  const uts = Number(document.getElementById('nl-uts').value) || 0;
  const uas = Number(document.getElementById('nl-uas').value) || 0;
  const absen = Number(document.getElementById('nl-absen').value) || 0;

  if (!nim || !kodeMk || !semester) { showToast('⚠️ Mahasiswa, Mata Kuliah, dan Semester wajib diisi', 'warning'); return; }

  const hasil = hitungSkorPreview(tugas, praktik, uts, uas, absen);
  const payload = { nim, namaMahasiswa, kodeMk, namaMatkul, semester, tugas, praktik, uts, uas, absen };
  await apiPost('addNilai', payload);

  STATE.data.nilai.push({
    ID: 'TEMP-' + Date.now(), 'NIM Mahasiswa': nim, 'Nama Mahasiswa': namaMahasiswa,
    'Kode MK': kodeMk, 'Nama Mata Kuliah': namaMatkul, Semester: semester,
    Tugas: tugas, Praktik: praktik, UTS: uts, UAS: uas, Absen: absen,
    'Skor Mentah': hasil.skorMentah, 'Skor Normalisasi': hasil.skorNormalisasi,
    'Nilai Huruf': hasil.grade.label, 'Bobot IP': hasil.grade.bobot, 'Tanggal Input': new Date().toISOString()
  });

  showToast(`✅ Nilai tersimpan: ${namaMahasiswa} → ${hasil.grade.label} (${hasil.skorNormalisasi})`, 'success');

  // Reset form komponen nilai saja
  ['nl-tugas','nl-praktik','nl-uts','nl-uas','nl-absen'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('nilai-preview-box').style.display = 'none';
  renderNilaiTable();
  setTimeout(() => loadAllData(true), 1500);
}

function applyNilaiFilter() { renderNilaiTable(); }

function renderNilaiTable() {
  const wrap = document.getElementById('nl-table-wrap');
  if (!wrap) return;

  const fMhs = document.getElementById('nl-filter-mhs')?.value || 'all';
  const fMk = document.getElementById('nl-filter-mk')?.value || 'all';
  const search = (document.getElementById('nl-filter-search')?.value || '').toLowerCase();

  const filtered = [...STATE.data.nilai].filter(n => {
    const matchMhs = fMhs === 'all' || String(n['NIM Mahasiswa']) === fMhs;
    const matchMk = fMk === 'all' || n['Kode MK'] === fMk;
    const matchSearch = !search || Object.values(n).some(v => String(v).toLowerCase().includes(search));
    return matchMhs && matchMk && matchSearch;
  }).sort((a,b) => new Date(b['Tanggal Input']) - new Date(a['Tanggal Input']));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-title">Belum ada nilai</div><div class="empty-state-text">Gunakan form di samping untuk menambahkan nilai baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="export-buttons">
      <button class="btn btn-print" onclick="printNilaiTable()">🖨️ Print</button>
      <button class="btn btn-pdf" onclick="exportNilaiPDF()">📄 Export PDF</button>
      <button class="btn btn-excel" onclick="exportNilaiExcel()">📊 Export Excel</button>
    </div>
    <div class="nilai-table-container">
      <table class="data-table data-table-center" id="nilai-table-print">
        <thead>
          <tr><th class="col-left">Mahasiswa</th><th class="col-left">Mata Kuliah</th><th>Smt</th><th>Tugas</th><th>Praktik</th><th>UTS</th><th>UAS</th><th>Absen</th><th>Skor</th><th>Grade</th><th>Aksi</th></tr>
        </thead>
        <tbody>
          ${filtered.map(n => {
            const grade = getGrade(n['Skor Normalisasi']);
            return `<tr>
              <td class="col-left"><strong>${n['Nama Mahasiswa']}</strong><br><span style="font-size:10px;color:var(--text-muted);font-family:monospace;">${n['NIM Mahasiswa']}</span></td>
              <td class="col-left">${n['Nama Mata Kuliah']}</td>
              <td>${n.Semester}</td>
              <td>${n.Tugas}</td><td>${n.Praktik}</td><td>${n.UTS}</td><td>${n.UAS}</td><td>${n.Absen}</td>
              <td><strong style="color:${grade.color};">${n['Skor Normalisasi']}</strong></td>
              <td><span style="background:${grade.color};color:white;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800;">${n['Nilai Huruf']}</span></td>
              <td><button class="btn-row-action delete" onclick="hapusNilai('${n.ID}')" title="Hapus">🗑️</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function hapusNilai(id) {
  if (!confirm('Yakin ingin menghapus data nilai ini? IPS dan IPK mahasiswa terkait akan berubah.')) return;
  await apiPost('deleteNilai', { id });
  STATE.data.nilai = STATE.data.nilai.filter(n => n.ID !== id);
  showToast('🗑️ Nilai berhasil dihapus', 'warning');
  renderNilaiTable();
}

// ================================================
// RAPOR / KHS (IPS per semester + IPK kumulatif)
// ================================================
async function renderRaporPage() {
  updateTopbar('Rapor & KHS', 'Lihat IPS per semester, IPK kumulatif, dan status kelulusan mahasiswa');
  await loadAllData();
  const container = document.getElementById('rapor-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🎓 Pilih Mahasiswa</label>
          <select id="rapor-mhs-select" class="filter-select" style="width:100%;" onchange="loadRaporMahasiswa()">
            <option value="">— Pilih mahasiswa untuk melihat rapor —</option>
            ${STATE.data.mahasiswa.map(m => `<option value="${m.NIM}">${m.Nama} (${m.NIM})</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div id="rapor-detail">
      <div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Pilih mahasiswa</div><div class="empty-state-text">Pilih nama mahasiswa di atas untuk melihat rapor lengkapnya</div></div>
    </div>`;
}

async function loadRaporMahasiswa() {
  const nim = document.getElementById('rapor-mhs-select').value;
  const detail = document.getElementById('rapor-detail');
  if (!nim) { detail.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Pilih mahasiswa</div></div>`; return; }

  detail.innerHTML = `<div class="empty-state" style="padding:50px;"><div class="empty-state-icon">⏳</div><div class="empty-state-title">Memuat rapor...</div></div>`;

  const result = await apiGet('getRapor', 'nim=' + encodeURIComponent(nim));
  if (!result || !result.data) { detail.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Gagal memuat rapor</div></div>`; return; }

  const rapor = result.data;
  const mhs = STATE.data.mahasiswa.find(m => String(m.NIM) === String(nim));
  drawRapor(rapor, mhs);
}

function drawRapor(rapor, mhs) {
  const detail = document.getElementById('rapor-detail');
  const ipk = rapor.ipk || 0;
  const pct = Math.min((ipk / 4) * 100, 100);
  const radius = 68, circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  const statusColor = rapor.statusKelulusan?.includes('Memenuhi') ? 'var(--accent)' : rapor.statusKelulusan === 'Sedang Berjalan' ? 'var(--cyan)' : 'var(--rose)';

  detail.innerHTML = `
    <div class="ipk-card fade-in" style="margin-bottom:24px;">
      <div class="ipk-ring-wrap">
        <svg width="156" height="156" viewBox="0 0 156 156">
          <circle cx="78" cy="78" r="${radius}" fill="none" stroke="var(--border)" stroke-width="11"/>
          <circle cx="78" cy="78" r="${radius}" fill="none" stroke="var(--accent)" stroke-width="11"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ}" stroke-linecap="round"
            id="rapor-ipk-ring" style="transition:stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1);"/>
        </svg>
        <div class="ipk-ring-inner">
          <div class="ipk-num">${ipk.toFixed(2)}</div>
          <div class="ipk-num-lbl">IPK Kumulatif</div>
        </div>
      </div>
      <div class="ipk-detail">
        <div class="ipk-detail-title">${mhs ? mhs.Nama : rapor.nim}</div>
        <div class="ipk-detail-sub">NIM ${rapor.nim} · ${rapor.totalMatkul} mata kuliah ditempuh · ${rapor.matkulLulus||0} lulus</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span class="ipk-badge" style="background:var(--accent-subtle); color:var(--accent); border:1px solid var(--accent-border);">🏅 ${rapor.predikat}</span>
          <span class="ipk-badge" style="background:${statusColor}18; color:${statusColor}; border:1px solid ${statusColor}40;">${rapor.statusKelulusan}</span>
        </div>
      </div>
    </div>

    <div class="section-header">
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <div>
          <div class="section-eyebrow">Kartu Hasil Studi</div>
          <div class="section-title" style="font-size:16px;">Riwayat Nilai per Semester</div>
        </div>
        <button class="btn btn-primary" onclick="downloadRaporPDF('${rapor.nim}', '${mhs ? mhs.Nama : rapor.nim}')" style="white-space:nowrap; margin-left:16px;">📥 Download PDF</button>
      </div>
    </div>
    ${rapor.perSemester.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">Belum ada nilai</div></div>` :
      rapor.perSemester.map(sem => `
      <div class="card fade-in" style="margin-bottom:16px;">
        <div class="card-body">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div style="font-weight:800; font-size:14px;">📘 Semester ${sem.semester}</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:11px; color:var(--text-muted);">IPS</span>
              <span class="serif" style="font-size:20px; font-weight:700; color:var(--accent);">${sem.ips.toFixed(2)}</span>
            </div>
          </div>
          <div class="nilai-table-container">
            <table class="data-table data-table-center">
              <thead><tr><th class="col-left">Mata Kuliah</th><th>Kode</th><th>Skor</th><th>Huruf</th><th>Bobot IP</th></tr></thead>
              <tbody>
                ${sem.matkuls.map(mk => {
                  const grade = getGrade(mk.skor);
                  return `<tr>
                    <td class="col-left">${mk.nama}</td>
                    <td style="font-family:monospace;">${mk.kode}</td>
                    <td><strong style="color:${grade.color};">${mk.skor}</strong></td>
                    <td><span style="background:${grade.color};color:white;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;">${mk.nilaiHuruf}</span></td>
                    <td>${Number(mk.bobotIp).toFixed(2)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`).join('')}`;

  setTimeout(() => {
    const ring = document.getElementById('rapor-ipk-ring');
    if (ring) ring.style.strokeDashoffset = circ - dash;
  }, 100);
}

// ================================================
// EXPORT FUNCTIONS (Print, PDF, Excel)
// ================================================
function printNilaiTable() {
  const printWindow = window.open('', '', 'width=1200,height=800');
  const table = document.getElementById('nilai-table-print');
  if (!table) return;
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Laporan Nilai - AkademikAP</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { text-align: center; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #4CAF50; color: white; padding: 12px; text-align: left; border: 1px solid #ddd; }
        td { padding: 10px; border: 1px solid #ddd; }
        tr:nth-child(even) { background: #f9f9f9; }
        .info { text-align: center; color: #666; margin-bottom: 20px; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>Laporan Data Nilai Mahasiswa</h1>
      <div class="info">
        <p>Politeknik Negeri Ujung Pandang - Prodi Administrasi Perkantoran</p>
        <p>Tanggal: ${new Date().toLocaleDateString('id-ID')}</p>
      </div>
      ${table.outerHTML}
      <script>
        window.print();
        window.onafterprint = () => window.close();
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function exportNilaiExcel() {
  const table = document.getElementById('nilai-table-print');
  if (!table) return;
  
  let csv = '\uFEFF'; // BOM untuk support charset
  const rows = table.querySelectorAll('tr');
  
  rows.forEach(row => {
    const cols = row.querySelectorAll('td, th');
    const rowData = Array.from(cols).map(col => {
      let text = col.textContent.replace(/"/g, '""');
      return `"${text}"`;
    }).join(',');
    csv += rowData + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', `Nilai_Mahasiswa_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('✅ File Excel berhasil diunduh', 'success');
}

function exportNilaiPDF() {
  const table = document.getElementById('nilai-table-print');
  if (!table) return;
  
  // Gunakan print-to-PDF browser built-in
  const printWindow = window.open('', '', 'width=1200,height=800');
  const docStyle = `
    <style>
      body { font-family: Arial, sans-serif; margin: 15px; }
      h1 { text-align: center; font-size: 20px; color: #333; margin-bottom: 5px; }
      .header-info { text-align: center; font-size: 11px; color: #666; margin-bottom: 15px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { background: #2d5016; color: white; padding: 8px; text-align: left; border: 1px solid #333; }
      td { padding: 6px; border: 1px solid #999; }
      tr:nth-child(even) { background: #f5f5f5; }
      .strong { font-weight: bold; }
      @media print { body { margin: 0; } }
    </style>
  `;
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Laporan Nilai - AkademikAP</title>
      ${docStyle}
    </head>
    <body>
      <h1>LAPORAN DATA NILAI MAHASISWA</h1>
      <div class="header-info">
        <p><strong>Politeknik Negeri Ujung Pandang</strong><br>
        Program Studi Administrasi Perkantoran<br>
        Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</p>
      </div>
      ${table.outerHTML}
      <script>
        setTimeout(() => { window.print(); }, 500);
        window.onafterprint = () => window.close();
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function downloadRaporPDF(nim, namaLengkap) {
  const ipkCard = document.querySelector('.ipk-card');
  if (!ipkCard) { showToast('⚠️ Rapor belum dimuat', 'error'); return; }
  
  const printWindow = window.open('', '', 'width=1200,height=900');
  const docStyle = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Arial', sans-serif; 
        background: white; 
        color: #333;
        line-height: 1.6;
      }
      .container { max-width: 210mm; margin: 0 auto; padding: 20mm; }
      .header {
        text-align: center;
        border-bottom: 3px solid #2d5016;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      .header h1 { font-size: 24px; color: #2d5016; margin-bottom: 5px; }
      .header p { font-size: 12px; color: #666; }
      .student-info {
        background: #f5f5f5;
        border: 2px solid #2d5016;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
      }
      .student-info h2 { font-size: 16px; color: #2d5016; margin-bottom: 10px; }
      .info-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 12px; }
      .info-item { margin-bottom: 8px; }
      .info-label { font-weight: bold; color: #2d5016; }
      .info-value { color: #333; }
      .section-title {
        font-size: 16px;
        font-weight: bold;
        color: #2d5016;
        margin-top: 25px;
        margin-bottom: 15px;
        border-bottom: 2px solid #2d5016;
        padding-bottom: 8px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 11px;
      }
      th {
        background: #2d5016;
        color: white;
        padding: 10px;
        text-align: left;
        font-weight: bold;
      }
      td {
        padding: 8px 10px;
        border-bottom: 1px solid #ddd;
      }
      tr:nth-child(even) { background: #f9f9f9; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #ddd;
        text-align: center;
        font-size: 11px;
        color: #666;
      }
      .badge {
        display: inline-block;
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: bold;
        margin-right: 5px;
      }
      @media print {
        body { margin: 0; padding: 0; }
        .container { padding: 0; }
      }
    </style>
  `;
  
  // Get data from page
  const ipkNum = document.querySelector('.ipk-num')?.textContent || '-';
  const predicate = document.querySelector('.ipk-badge')?.textContent || '-';
  const status = Array.from(document.querySelectorAll('.ipk-badge')).pop()?.textContent || '-';
  const semesters = document.querySelectorAll('.card-body');
  
  let semetersHTML = '';
  semesters.forEach((sem, idx) => {
    const semTitle = sem.querySelector('div:first-child')?.textContent || '';
    const ipsValue = sem.querySelector('.serif')?.textContent || '0.00';
    const table = sem.querySelector('.data-table');
    
    if (table && semTitle.includes('Semester')) {
      semetersHTML += `
        <div>
          <div class="section-title">${semTitle.trim()} - IPS: ${ipsValue}</div>
          ${table.outerHTML}
        </div>
      `;
    }
  });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Rapor - ${namaLengkap}</title>
      ${docStyle}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>KARTU HASIL STUDI (KHS)</h1>
          <p>Politeknik Negeri Ujung Pandang<br>Program Studi Administrasi Perkantoran</p>
        </div>
        
        <div class="student-info">
          <h2>📋 Data Mahasiswa</h2>
          <div class="info-row">
            <div>
              <div class="info-item">
                <span class="info-label">Nama:</span>
                <span class="info-value">${namaLengkap}</span>
              </div>
              <div class="info-item">
                <span class="info-label">NIM:</span>
                <span class="info-value">${nim}</span>
              </div>
            </div>
            <div>
              <div class="info-item">
                <span class="info-label">IPK Kumulatif:</span>
                <span class="info-value" style="font-weight:bold; color:#2d5016; font-size:14px;">${ipkNum}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Status:</span>
                <div style="margin-top:5px;">
                  <span class="badge" style="background:#d1fae5; color:#065f46;">${predicate}</span>
                  <span class="badge" style="background:#dbeafe; color:#0369a1;">${status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        ${semetersHTML}
        
        <div class="footer">
          <p>Dicetak pada: ${new Date().toLocaleDateString('id-ID', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</p>
          <p style="margin-top:10px; font-size:10px;">Dokumen ini dicetak dari Sistem AkademikAP</p>
        </div>
      </div>
      <script>
        window.print();
        window.onafterprint = () => window.close();
      </script>
    </body>
    </html>
  `;
  
  printWindow.document.write(html);
  printWindow.document.close();
  showToast(`📥 Membuka preview PDF rapor ${namaLengkap}...`, 'success');
}

// ================================================
// INIT
// ================================================
// ================================================
// JADWAL KULIAH (CRUD)
// ================================================
const HARI_ORDER = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

async function renderJadwalPage() {
  updateTopbar('Jadwal Kuliah', 'Kelola jadwal mata kuliah per hari dan jam');
  await loadAllData();
  const container = document.getElementById('jadwal-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">📅 Filter Semester</label>
          <select id="jadwal-filter-smt" class="filter-select" onchange="renderJadwalTable()">
            <option value="all">— Semua Semester —</option>
            ${[...new Set(STATE.data.jadwal.map(j => j.Semester).filter(Boolean))].sort((a,b)=>Number(a)-Number(b)).map(s=>`<option value="${s}">Semester ${s}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">👥 Filter Kelas</label>
          <select id="jadwal-filter-kelas" class="filter-select" onchange="renderJadwalTable()">
            <option value="all">— Semua Kelas —</option>
            ${[...new Set(STATE.data.jadwal.map(j => j.Kelas).filter(Boolean))].sort().map(k=>`<option value="${k}">${k}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari</label>
          <input type="text" id="jadwal-search" class="filter-input" placeholder="Cari mata kuliah, kelas, ruangan, dosen..." oninput="renderJadwalTable()">
        </div>
        <button class="btn btn-primary" onclick="openJadwalModal()">➕ Tambah Jadwal</button>
      </div>
    </div>
    <div id="jadwal-table-wrap"></div>`;

  renderJadwalTable();
}

function renderJadwalTable() {
  const wrap = document.getElementById('jadwal-table-wrap');
  if (!wrap) return;

  const fSmt = document.getElementById('jadwal-filter-smt')?.value || 'all';
  const fKelas = document.getElementById('jadwal-filter-kelas')?.value || 'all';
  const search = (document.getElementById('jadwal-search')?.value || '').toLowerCase();

  const filtered = STATE.data.jadwal.filter(j => {
    const matchSmt = fSmt === 'all' || String(j.Semester) === String(fSmt);
    const matchKelas = fKelas === 'all' || j.Kelas === fKelas;
    const matchSearch = !search || Object.values(j).some(v => String(v).toLowerCase().includes(search));
    return matchSmt && matchKelas && matchSearch;
  }).sort((a, b) => {
    const hariA = HARI_ORDER.indexOf(a.Hari), hariB = HARI_ORDER.indexOf(b.Hari);
    if (hariA !== hariB) return hariA - hariB;
    return (a['Jam Mulai'] || '').localeCompare(b['Jam Mulai'] || '');
  });

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗓️</div><div class="empty-state-title">Belum ada jadwal</div><div class="empty-state-text">Klik "Tambah Jadwal" untuk menambahkan jadwal baru</div></div>`;
    return;
  }

  const hariColors = {
    Senin:'#34D399', Selasa:'#22D3EE', Rabu:'#818CF8',
    Kamis:'#D4AF37', Jumat:'#F43F5E', Sabtu:'#F97316'
  };

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center" style="min-width:900px;">
        <thead>
          <tr>
            <th style="width:90px;">Hari</th>
            <th style="width:110px;">Jam</th>
            <th style="width:50px;">Smt</th>
            <th style="width:90px;">Kelas</th>
            <th class="col-left">Mata Kuliah</th>
            <th style="width:90px;">Ruangan</th>
            <th class="col-left">Dosen Pengampu</th>
            <th style="width:80px;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(j => {
            const color = hariColors[j.Hari] || 'var(--accent)';
            return `<tr>
              <td>
                <span style="background:${color}20;color:${color};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:800;border:1px solid ${color}40;white-space:nowrap;">${j.Hari}</span>
              </td>
              <td style="font-family:monospace;font-size:12px;font-weight:700;color:${color};white-space:nowrap;">${formatJam(j['Jam Mulai'])} – ${formatJam(j['Jam Selesai'])}</td>
              <td style="font-weight:700;">${j.Semester}</td>
              <td><span style="background:var(--accent-subtle);color:var(--accent);padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid var(--accent-border);white-space:nowrap;">${j.Kelas||'-'}</span></td>
              <td class="col-left">
                <div style="font-weight:800;font-size:13px;">${j['Nama Mata Kuliah']}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${j['Kode MK']||''}</div>
              </td>
              <td>
                <span style="background:var(--bg-glass);border:1px solid var(--border);padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;">📍 ${j.Ruangan||'-'}</span>
              </td>
              <td class="col-left" style="font-size:12px;">${j['Dosen Pengampu']||'-'}</td>
              <td>
                <div style="display:flex;gap:6px;justify-content:center;">
                  <button class="btn-row-action edit" onclick='openJadwalModal(${JSON.stringify(j).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusJadwal('${j.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function openJadwalModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-jadwal-title').textContent = data ? 'Edit Jadwal' : 'Tambah Jadwal';

  // Isi dropdown Mata Kuliah
  const mkSelect = document.getElementById('jadwal-matkul');
  mkSelect.innerHTML = '<option value="">— Pilih Mata Kuliah —</option>' +
    STATE.data.mataKuliah.map(m => `<option value="${m.Kode}" data-nama="${m['Nama Mata Kuliah']}" data-semester="${m.Semester}" ${data && data['Kode MK']===m.Kode?'selected':''}>${m.Kode} — ${m['Nama Mata Kuliah']}</option>`).join('');

  // Isi dropdown Ruangan dari data master ruangan
  const ruanganSelect = document.getElementById('jadwal-ruangan');
  if (ruanganSelect) {
    ruanganSelect.innerHTML = '<option value="">— Pilih Ruangan —</option>' +
      STATE.data.ruangan.map(r => `<option value="${r['Nama Ruangan']}" ${data && data['Ruangan']===r['Nama Ruangan']?'selected':''}>${r['Nama Ruangan']}${r['Keterangan']?' — '+r['Keterangan']:''}</option>`).join('');
  }

  // Isi daftar dosen dengan checkbox (multi-select)
  const dosenList = document.getElementById('jadwal-dosen-list');
  const selectedDosen = data ? String(data['Dosen Pengampu']||'').split(',').map(d => d.trim()).filter(Boolean) : [];
  if (dosenList) {
    if (STATE.data.dosen.length === 0) {
      dosenList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px;">Belum ada data dosen — tambahkan dosen terlebih dahulu</div>';
    } else {
      dosenList.innerHTML = STATE.data.dosen.map(d => `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 6px;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-glass)'" onmouseout="this.style.background='transparent'">
          <input type="checkbox" value="${d.Nama}" ${selectedDosen.includes(d.Nama) ? 'checked' : ''}
            style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;">
          <span style="font-size:12px;color:var(--text-primary);">${d.Nama}</span>
        </label>`).join('');
    }
  }

  document.getElementById('jadwal-hari').value = data ? data.Hari : '';
  document.getElementById('jadwal-semester').value = data ? data.Semester : '';
  document.getElementById('jadwal-jam-mulai').value = data ? formatJam(data['Jam Mulai']) : '';
  document.getElementById('jadwal-jam-selesai').value = data ? formatJam(data['Jam Selesai']) : '';
  document.getElementById('jadwal-ruangan').value = data ? data.Ruangan : '';
  document.getElementById('jadwal-kelas').value = data ? data.Kelas : '';

  // Auto-fill semester dari matkul jika tambah baru
  if (!data) {
    document.getElementById('jadwal-matkul').addEventListener('change', function() {
      const opt = this.selectedOptions[0];
      if (opt && opt.dataset.semester) document.getElementById('jadwal-semester').value = opt.dataset.semester;
    }, { once: true });
  }

  document.getElementById('modal-jadwal').classList.add('open');
}

function closeJadwalModal() {
  document.getElementById('modal-jadwal').classList.remove('open');
  STATE.editingId = null;
}

async function submitJadwal() {
  const mkSelect = document.getElementById('jadwal-matkul');
  const kodeMk = mkSelect.value;
  const namaMatkulOpt = mkSelect.selectedOptions[0];
  const namaMatkul = namaMatkulOpt ? namaMatkulOpt.dataset.nama : '';
  const hari = document.getElementById('jadwal-hari').value;
  const semester = document.getElementById('jadwal-semester').value;
  const jamMulai = (document.getElementById('jadwal-jam-mulai').value || '').substring(0, 5);
  const jamSelesai = (document.getElementById('jadwal-jam-selesai').value || '').substring(0, 5);
  const ruanganEl = document.getElementById('jadwal-ruangan');
  const ruangan = ruanganEl.tagName === 'SELECT' ? ruanganEl.value : ruanganEl.value.trim();
  const kelas = document.getElementById('jadwal-kelas').value.trim();
  // Ambil semua dosen yang dicentang
  const dosenChecked = [...document.querySelectorAll('#jadwal-dosen-list input[type="checkbox"]:checked')].map(cb => cb.value);
  const dosen = dosenChecked.join(', ');

  if (!kodeMk || !hari || !semester || !jamMulai || !jamSelesai || !ruangan || !kelas) {
    showToast('⚠️ Semua field wajib kecuali Dosen harus diisi', 'warning'); return;
  }

  const payload = { kodeMk, namaMatkul, hari, semester, kelas, jamMulai, jamSelesai, ruangan, dosenPengampu: dosen };

  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editJadwal', payload);
    const idx = STATE.data.jadwal.findIndex(j => j.ID === STATE.editingId);
    if (idx > -1) STATE.data.jadwal[idx] = { ...STATE.data.jadwal[idx], 'Kode MK': kodeMk, 'Nama Mata Kuliah': namaMatkul, Hari: hari, Semester: semester, Kelas: kelas, 'Jam Mulai': jamMulai, 'Jam Selesai': jamSelesai, Ruangan: ruangan, 'Dosen Pengampu': dosen };
    showToast('✅ Jadwal berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addJadwal', payload);
    STATE.data.jadwal.push({ ID: tempId, 'Kode MK': kodeMk, 'Nama Mata Kuliah': namaMatkul, Hari: hari, Semester: semester, Kelas: kelas, 'Jam Mulai': jamMulai, 'Jam Selesai': jamSelesai, Ruangan: ruangan, 'Dosen Pengampu': dosen });
    showToast('✅ Jadwal berhasil ditambahkan', 'success');
  }

  closeJadwalModal();
  renderJadwalTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusJadwal(id) {
  if (!confirm('Yakin ingin menghapus jadwal ini?')) return;
  await apiPost('deleteJadwal', { id });
  STATE.data.jadwal = STATE.data.jadwal.filter(j => j.ID !== id);
  showToast('🗑️ Jadwal berhasil dihapus', 'warning');
  renderJadwalTable();
}

// ================================================
// JADWAL PUBLIK — TAMPILAN GRID SEPERTI PINTU RUANGAN
// ================================================
const HARI_LIST = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const JAM_SLOTS = ['07:00','07:50','08:40','09:30','10:20','11:10','12:00','13:00','13:50','14:40','15:30','16:20'];

async function renderJadwalPublik() {
  updateTopbar('Jadwal Ruangan', 'Jadwal Penggunaan Ruangan — Prodi Administrasi Perkantoran PNUP');
  await loadAllData(true); // paksa reload
  await loadStatusKuliah(); // muat status real-time

  const container = document.getElementById('jadwal-publik-content');
  if (!container) return;

  const jadwal = STATE.data.jadwal;

  // Isi filter dropdown kelas
  const kelasEl = document.getElementById('jadwal-publik-filter-kelas');
  const ruanganEl = document.getElementById('jadwal-publik-filter-ruangan');
  if (kelasEl && kelasEl.options.length <= 1) {
    [...new Set(jadwal.map(j => j.Kelas).filter(Boolean))].sort().forEach(k => {
      kelasEl.innerHTML += `<option value="${k}">${k}</option>`;
    });
  }
  if (ruanganEl && ruanganEl.options.length <= 1) {
    [...new Set(jadwal.map(j => j.Ruangan).filter(Boolean))].sort().forEach(r => {
      ruanganEl.innerHTML += `<option value="${r}">${r}</option>`;
    });
  }

  const fKelas = kelasEl?.value || 'all';
  const fRuangan = ruanganEl?.value || 'all';
  const filtered = jadwal.filter(j =>
    (fKelas === 'all' || j.Kelas === fKelas) &&
    (fRuangan === 'all' || j.Ruangan === fRuangan)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📌</div><div class="empty-state-title">Belum ada jadwal</div><div class="empty-state-text">Tambahkan jadwal terlebih dahulu di menu Jadwal Kuliah</div></div>`;
    return;
  }

  // Definisi slot jam standar PNUP
  const SLOTS = [
    { no: '1',  mulai: '07:30', selesai: '08:20' },
    { no: '2',  mulai: '08:20', selesai: '09:10' },
    { no: '3',  mulai: '09:10', selesai: '10:00' },
    { no: 'IST', mulai: '10:00', selesai: '10:20', istirahat: true },
    { no: '4',  mulai: '10:20', selesai: '11:10' },
    { no: '5',  mulai: '11:10', selesai: '12:00' },
    { no: 'IST', mulai: '12:00', selesai: '13:00', istirahat: true },
    { no: '6',  mulai: '13:00', selesai: '13:50' },
    { no: '7',  mulai: '13:50', selesai: '14:40' },
    { no: '8',  mulai: '14:40', selesai: '15:30' },
    { no: 'IST', mulai: '15:30', selesai: '16:00', istirahat: true },
    { no: '9',  mulai: '16:00', selesai: '16:50' },
    { no: '10', mulai: '16:50', selesai: '17:40' },
  ];

  const hariWarna = { Senin:'#34D399',Selasa:'#22D3EE',Rabu:'#818CF8',Kamis:'#D4AF37',Jumat:'#F43F5E',Sabtu:'#F97316' };
  const kelasList = [...new Set(filtered.map(j => j.Kelas).filter(Boolean))].sort();

  // Fungsi cari slot yang dipakai jadwal berdasarkan jam mulai-selesai
  function getSlotRange(jamMulai, jamSelesai) {
    const mulai = formatJam(jamMulai);
    const selesai = formatJam(jamSelesai);
    let startIdx = -1, endIdx = -1;
    SLOTS.forEach((s, i) => {
      if (!s.istirahat) {
        if (s.mulai === mulai) startIdx = i;
        if (s.selesai === selesai) endIdx = i;
      }
    });
    // Fallback: cari slot terdekat
    if (startIdx === -1) {
      SLOTS.forEach((s, i) => { if (!s.istirahat && s.mulai <= mulai && startIdx === -1) startIdx = i; });
    }
    if (endIdx === -1) {
      for (let i = SLOTS.length - 1; i >= 0; i--) {
        if (!s.istirahat && SLOTS[i].selesai >= selesai) { endIdx = i; break; }
      }
      if (endIdx === -1) endIdx = startIdx;
    }
    return { startIdx, endIdx };
  }

  let html = `
    <style>
      .jp-cell { transition: filter 0.15s; }
      .jp-cell:hover { filter: brightness(1.15); }
      .jp-tooltip {
        display: none;
        position: fixed;
        z-index: 999999;
        min-width: 230px;
        max-width: 270px;
        border-radius: 10px;
        padding: 12px 14px;
        text-align: left;
        pointer-events: none;
        background: #0a0f1e;
        border: 1.5px solid #1e293b;
        opacity: 1 !important;
      }
      .jp-tt-title {
        font-size: 11px; font-weight: 700; margin-bottom: 8px;
        padding-bottom: 7px; border-bottom: 1px solid #1e293b;
        color: #f1f5f9;
      }
      .jp-tt-row {
        display: flex; gap: 8px; align-items: flex-start;
        font-size: 11px; margin-bottom: 5px;
      }
      .jp-tt-lbl { flex-shrink: 0; color: #475569; min-width: 85px; font-weight: 600; }
      .jp-tt-val { color: #e2e8f0; font-weight: 500; line-height: 1.4; }
      .jp-sedang .jp-tooltip  { background: #021a08; border-color: #16a34a; }
      .jp-sedang .jp-tt-title { color: #4ade80; border-bottom-color: #14532d; }
      .jp-sedang .jp-tt-lbl   { color: #166534; }
      .jp-sedang .jp-tt-val   { color: #bbf7d0; }
      .jp-booking .jp-tooltip  { background: #020b2e; border-color: #2563eb; }
      .jp-booking .jp-tt-title { color: #93c5fd; border-bottom-color: #1e3a8a; }
      .jp-booking .jp-tt-lbl   { color: #1d4ed8; }
      .jp-booking .jp-tt-val   { color: #bfdbfe; }
      /* hover ditangani JS */
      /* Cell kosong hover */
      .jp-cell-kosong {
        padding: 6px 4px; border: 1.5px solid var(--border);
        text-align: center; vertical-align: middle;
        transition: background 0.15s; position: relative;
      }
      .jp-cell-kosong:hover { background: var(--bg-elevated); }
    </style>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button onclick="printJadwal()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-surface);color:var(--text-primary);font-size:12px;font-weight:700;cursor:pointer;">🖨️ Print</button>
      <button onclick="downloadJadwalPDF()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;border:1.5px solid #F43F5E;background:rgba(244,63,94,0.08);color:#F43F5E;font-size:12px;font-weight:700;cursor:pointer;">📄 Download PDF</button>
      <button onclick="exportJadwalExcel()" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;border:1.5px solid #10B981;background:rgba(16,185,129,0.08);color:#10B981;font-size:12px;font-weight:700;cursor:pointer;">📊 Export Excel</button>
    </div>
    <div id="jadwal-print-area" style="overflow-x:auto;">
      <div style="font-family:'Lora',serif;text-align:center;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:4px;">Politeknik Negeri Ujung Pandang</div>
        <div style="font-size:20px;font-weight:700;color:var(--text-primary);">JADWAL PENGGUNAAN RUANGAN & LAB</div>
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Program Studi Administrasi Perkantoran</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Semester Aktif Tahun Akademik ${new Date().getFullYear()}/${new Date().getFullYear()+1}</div>
      </div>`;

  kelasList.forEach(kelas => {
    const jadwalKelas = filtered.filter(j => j.Kelas === kelas);

    html += `
      <div style="margin-bottom:40px;">
        <div style="font-weight:800;font-size:15px;margin-bottom:12px;padding:10px 16px;background:var(--accent-subtle);border-left:4px solid var(--accent);border-radius:0 10px 10px 0;color:var(--accent);">
          🎓 Kelas: ${kelas}
        </div>
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:900px;table-layout:auto;">
          <thead>
            <tr>
              <th style="padding:10px 14px;text-align:center;border:1.5px solid var(--border);background:var(--bg-elevated);font-size:11px;font-weight:800;min-width:80px;letter-spacing:0.5px;">HARI</th>
              ${SLOTS.map(s => s.istirahat ?
                `<th style="padding:6px 4px;text-align:center;border:1.5px solid var(--border);background:var(--bg-elevated);font-size:8px;font-weight:600;color:var(--text-muted);min-width:36px;max-width:36px;"><div style="writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:1px;">IST</div><div style="font-size:7px;margin-top:2px;">${s.mulai}</div></th>` :
                `<th style="padding:8px 6px;text-align:center;border:1.5px solid var(--border);background:var(--bg-elevated);font-size:13px;font-weight:900;min-width:80px;"><div>${s.no}</div><div style="font-size:8px;font-weight:400;color:var(--text-muted);margin-top:3px;">${s.mulai}–${s.selesai}</div></th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${['Senin','Selasa','Rabu','Kamis','Jumat'].map(hari => {
              const jadwalHari = jadwalKelas.filter(j => j.Hari === hari);
              const warna = hariWarna[hari] || 'var(--accent)';

              // Build sel per slot — tandai slot mana yang sudah dipakai (colspan)
              const rendered = new Array(SLOTS.length).fill(null);
              jadwalHari.forEach(j => {
                const mulai = formatJam(j['Jam Mulai']);
                const selesai = formatJam(j['Jam Selesai']);
                let startIdx = -1, endIdx = -1;
                SLOTS.forEach((s, i) => {
                  if (!s.istirahat) {
                    if (s.mulai === mulai && startIdx === -1) startIdx = i;
                    if (s.selesai === selesai) endIdx = i;
                  }
                });
                if (startIdx === -1) {
                  for (let i = 0; i < SLOTS.length; i++) {
                    if (!SLOTS[i].istirahat && SLOTS[i].mulai <= mulai) startIdx = i;
                  }
                }
                if (endIdx === -1 || endIdx < startIdx) endIdx = startIdx;

                // Isi setiap slot dalam range, lewati istirahat (biarkan kosong)
                let currentStart = startIdx;
                let spanCount = 0;
                for (let x = startIdx; x <= endIdx; x++) {
                  if (SLOTS[x].istirahat) {
                    // Simpan segment sebelum istirahat
                    if (spanCount > 0) {
                      rendered[currentStart] = { jadwal: j, span: spanCount, warna };
                      for (let y = currentStart + 1; y < currentStart + spanCount; y++) rendered[y] = 'skip';
                    }
                    spanCount = 0;
                    currentStart = x + 1;
                  } else {
                    spanCount++;
                  }
                }
                // Simpan segment terakhir
                if (spanCount > 0) {
                  rendered[currentStart] = { jadwal: j, span: spanCount, warna };
                  for (let y = currentStart + 1; y < currentStart + spanCount; y++) rendered[y] = 'skip';
                }
              });

              return `<tr>
                <td style="padding:10px 14px;border:1.5px solid var(--border);font-weight:800;font-size:12px;color:${warna};background:${warna}10;white-space:nowrap;text-align:center;">${hari}</td>
                ${SLOTS.map((s, i) => {
                  if (rendered[i] === 'skip') return '';
                  if (s.istirahat) {
                    return `<td style="padding:2px;border:1.5px solid var(--border);background:var(--bg-elevated);text-align:center;"><span style="font-size:8px;color:var(--text-muted);writing-mode:vertical-rl;transform:rotate(180deg);">Ist</span></td>`;
                  }
                  if (rendered[i] === null) {
                    return `<td class="jp-cell-kosong"></td>`;
                  }
                  const { jadwal: j, span } = rendered[i];
                  const statusR   = STATUS_KULIAH_DATA[j.Ruangan] || {};
                  const statusNow = statusR.status || '';
                  const isSedang  = statusNow === 'Sedang Dipakai';
                  const isBooking = statusNow === 'Dibooking';

                  const statusBadge = isSedang
                    ? `<div style="margin-top:5px;display:inline-block;font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:#4ade8025;color:#4ade80;border:1px solid #166534;">🟢 Sedang Dipakai</div>`
                    : isBooking
                    ? `<div style="margin-top:5px;display:inline-block;font-size:9px;font-weight:800;padding:2px 7px;border-radius:4px;background:#60a5fa25;color:#60a5fa;border:1px solid #1e3a8a;">📅 Dibooking</div>`
                    : `<div style="margin-top:5px;display:inline-block;font-size:9px;font-weight:600;padding:2px 7px;border-radius:4px;background:var(--bg-elevated);color:var(--text-muted);">⬜ Kosong</div>`;

                  // Tooltip hover untuk booking/sedang dipakai
                  const tooltipContent = (isSedang || isBooking) ? `
                    <div class="jp-tooltip">
                      <div class="jp-tt-title">${isSedang ? '🟢 Sedang Dipakai' : '📅 Dibooking'}</div>
                      <div class="jp-tt-row"><span class="jp-tt-lbl">Mata Kuliah</span><span class="jp-tt-val">${statusR.mataKuliah || j['Nama Mata Kuliah']}</span></div>
                      <div class="jp-tt-row"><span class="jp-tt-lbl">Dosen</span><span class="jp-tt-val">${statusR.dosen || j['Dosen Pengampu'] || '-'}</span></div>
                      <div class="jp-tt-row"><span class="jp-tt-lbl">Kelas</span><span class="jp-tt-val">${statusR.kelas || j['Kelas'] || '-'}</span></div>
                      <div class="jp-tt-row"><span class="jp-tt-lbl">Ruangan</span><span class="jp-tt-val">${j.Ruangan}</span></div>
                      <div class="jp-tt-row"><span class="jp-tt-lbl">Jam</span><span class="jp-tt-val">${statusR.jamMulai || formatJam(j['Jam Mulai'])} – ${statusR.jamSelesai || formatJam(j['Jam Selesai'])}</span></div>
                      <div class="jp-tt-row"><span class="jp-tt-lbl">Ketua Kelas</span><span class="jp-tt-val">${statusR.namaKetua || '-'}</span></div>
                    </div>` : '';

                  const namaMK   = (isSedang||isBooking) ? (statusR.mataKuliah||j['Nama Mata Kuliah']) : j['Nama Mata Kuliah'];
                  const namaDsn  = (isSedang||isBooking) ? (statusR.dosen||j['Dosen Pengampu']||'') : (j['Dosen Pengampu']||'');
                  const badgeColor = isSedang ? '#4ade80' : isBooking ? '#60a5fa' : null;
                  const badgeBg    = isSedang ? '#4ade8018' : isBooking ? '#60a5fa18' : null;
                  const badgeBdr   = isSedang ? '#16a34a' : isBooking ? '#2563eb' : null;
                  const badgeTxt   = isSedang ? '🟢 Sedang Dipakai' : isBooking ? '📅 Dibooking' : null;
                  return `<td colspan="${span}" class="jp-cell ${isSedang?'jp-sedang':isBooking?'jp-booking':''}"
                    data-ruangan="${j.Ruangan||''}"
                    style="padding:8px 6px;
                      border:1.5px solid ${isSedang?'#16a34a':isBooking?'#2563eb':'var(--border)'};
                      background:${isSedang?'#041c0e':isBooking?'#040d1c':warna+'10'};
                      vertical-align:middle;text-align:center;position:relative;">
                    ${tooltipContent}
                    <div style="font-weight:700;font-size:11px;color:var(--text-primary);line-height:1.35;margin-bottom:3px;">${namaMK}</div>
                    <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:4px;">${namaDsn}</div>
                    <div style="font-size:9px;font-weight:600;color:${warna};padding:1px 5px;background:${warna}18;border-radius:3px;display:inline-block;margin-bottom:${badgeTxt?'3px':'0'};">📍 ${j.Ruangan||''}</div>
                    ${badgeTxt ? `<br><span class="jp-status-badge" style="display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;margin-top:2px;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBdr};">${badgeTxt}</span>` : ''}
                  </td>`;
                }).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  });

  html += '</div></div>';
  container.innerHTML = html;

  // Tooltip global — satu elemen di body, pindah mengikuti mouse
  let _globalTT = document.getElementById('jp-global-tooltip');
  if (!_globalTT) {
    _globalTT = document.createElement('div');
    _globalTT.id = 'jp-global-tooltip';
    _globalTT.style.cssText = [
      'position:fixed',
      'z-index:999999',
      'display:none',
      'pointer-events:none',
      'min-width:230px',
      'max-width:270px',
      'border-radius:10px',
      'padding:12px 14px',
      'font-size:11px',
      'font-family:var(--font-sans,sans-serif)',
    ].join(';');
    document.body.appendChild(_globalTT);
  }

  container.querySelectorAll('.jp-cell[data-ruangan]').forEach(cell => {
    const src = cell.querySelector('.jp-tooltip');
    if (!src) return;

    cell.addEventListener('mouseenter', () => {
      const isS = cell.classList.contains('jp-sedang');
      const isB = cell.classList.contains('jp-booking');
      _globalTT.innerHTML  = src.innerHTML;
      _globalTT.style.background   = isS ? '#021a08' : isB ? '#020b2e' : '#0a0f1e';
      _globalTT.style.border       = isS ? '1.5px solid #16a34a' : isB ? '1.5px solid #2563eb' : '1.5px solid #1e293b';
      _globalTT.style.color        = isS ? '#bbf7d0' : isB ? '#bfdbfe' : '#e2e8f0';
      _globalTT.style.display      = 'block';
    });

    cell.addEventListener('mouseleave', () => {
      _globalTT.style.display = 'none';
    });

    cell.addEventListener('mousemove', e => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tw = _globalTT.offsetWidth  || 250;
      const th = _globalTT.offsetHeight || 180;
      const ox = 12; // offset dari kursor
      const oy = 12;
      let left = e.clientX + ox;
      let top  = e.clientY + oy;
      if (left + tw > vw - 8) left = e.clientX - tw - ox;
      if (top  + th > vh - 8) top  = e.clientY - th - oy;
      _globalTT.style.left = left + 'px';
      _globalTT.style.top  = top  + 'px';
    });
  });

  // Auto-refresh jadwal publik tiap 20 detik untuk sinkron dengan status kuliah
  if (window._jadwalPubInterval) clearInterval(window._jadwalPubInterval);
  window._jadwalPubInterval = setInterval(async () => {
    if (!document.getElementById('page-jadwal-publik')?.classList.contains('active')) return;
    await loadStatusKuliah();
    renderJadwalPublik();
  }, 20000);
}

// ================================================
// JADWAL RUANGAN — PRINT, PDF, EXCEL
// ================================================
function printJadwal() {
  const area = document.getElementById('jadwal-print-area');
  if (!area) return;
  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Jadwal Penggunaan Ruangan - Prodi Administrasi Perkantoran PNUP</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; font-size:10px; color:#000; background:#fff; padding:20px; }
        h1 { font-size:16px; text-align:center; margin-bottom:4px; }
        h2 { font-size:13px; text-align:center; margin-bottom:2px; font-weight:600; }
        .subtitle { font-size:10px; text-align:center; color:#555; margin-bottom:20px; }
        .kelas-header { font-weight:800; font-size:12px; margin:20px 0 8px; padding:6px 12px; background:#1E3A5F; color:#fff; border-radius:4px; }
        table { width:100%; border-collapse:collapse; margin-bottom:24px; font-size:9px; }
        th { padding:6px 4px; text-align:center; border:1px solid #333; background:#1E3A5F; color:#fff; font-weight:700; }
        td { padding:6px 4px; text-align:center; border:1px solid #999; vertical-align:middle; }
        td.hari { font-weight:800; background:#f0f4ff; color:#1E3A5F; white-space:nowrap; }
        td.ist { background:#f5f5f5; color:#888; font-size:8px; font-style:italic; }
        td.has-jadwal { background:#e8f4fd; }
        .matkul { font-weight:800; font-size:9px; line-height:1.3; margin-bottom:2px; }
        .dosen { font-size:8px; color:#555; margin-bottom:2px; }
        .ruangan { font-size:8px; font-weight:700; color:#1E3A5F; }
        @media print { body { padding:10px; } @page { size: A4 landscape; margin:10mm; } }
      </style>
    </head>
    <body>
      <h1>JADWAL PENGGUNAAN RUANGAN & LAB</h1>
      <h2>Program Studi Administrasi Perkantoran</h2>
      <div class="subtitle">Politeknik Negeri Ujung Pandang — Semester Aktif Tahun Akademik ${new Date().getFullYear()}/${new Date().getFullYear()+1}</div>
      ${area.innerHTML
        .replace(/style="[^"]*color:[^";]*var\([^)]*\)[^"]*"/g, '')
        .replace(/background:[^;]*var\([^)]*\)[^;]*/g, '')
        .replace(/color:[^;]*var\([^)]*\)[^;]*/g, '')
      }
    </body>
    </html>
  `);
  printWin.document.close();
  setTimeout(() => { printWin.focus(); printWin.print(); }, 500);
}

async function downloadJadwalPDF() {
  showToast('⏳ Menyiapkan PDF...', 'info');
  const area = document.getElementById('jadwal-print-area');
  if (!area) return;

  // Muat jsPDF dan html2canvas
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
  ]);

  const { jsPDF } = window.jspdf;

  // Clone area dengan styling putih untuk PDF
  const clone = area.cloneNode(true);
  clone.style.cssText = 'position:fixed;top:-9999px;left:0;width:1200px;background:#fff;color:#000;padding:20px;font-family:Arial,sans-serif;';
  // Override CSS variables ke nilai solid
  clone.querySelectorAll('*').forEach(el => {
    el.style.color = el.style.color || '#000';
    el.style.borderColor = '#ccc';
  });
  document.body.appendChild(clone);

  try {
    const canvas = await window.html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    document.body.removeChild(clone);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    const imgH = pdfW / ratio;

    let posY = 0;
    while (posY < canvas.height) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.min(canvas.height - posY, canvas.width / (pdfW / pdfH));
      const ctx = pageCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, posY, canvas.width, pageCanvas.height, 0, 0, canvas.width, pageCanvas.height);
      if (posY > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, pdfW * pageCanvas.height / canvas.width);
      posY += pageCanvas.height;
    }

    pdf.save(`Jadwal_AP_${new Date().getFullYear()}.pdf`);
    showToast('✅ PDF berhasil didownload', 'success');
  } catch(e) {
    document.body.removeChild(clone);
    showToast('❌ Gagal membuat PDF: ' + e.message, 'error');
  }
}

function exportJadwalExcel() {
  showToast('⏳ Menyiapkan Excel...', 'info');

  const SLOTS_EXPORT = [
    { no:'1', mulai:'07:30', selesai:'08:20' },
    { no:'2', mulai:'08:20', selesai:'09:10' },
    { no:'3', mulai:'09:10', selesai:'10:00' },
    { no:'IST', mulai:'10:00', selesai:'10:20', istirahat:true },
    { no:'4', mulai:'10:20', selesai:'11:10' },
    { no:'5', mulai:'11:10', selesai:'12:00' },
    { no:'IST', mulai:'12:00', selesai:'13:00', istirahat:true },
    { no:'6', mulai:'13:00', selesai:'13:50' },
    { no:'7', mulai:'13:50', selesai:'14:40' },
    { no:'8', mulai:'14:40', selesai:'15:30' },
    { no:'IST', mulai:'15:30', selesai:'16:00', istirahat:true },
    { no:'9', mulai:'16:00', selesai:'16:50' },
    { no:'10', mulai:'16:50', selesai:'17:40' },
  ];

  const wb = XLSX.utils.book_new();
  const kelasList = [...new Set(STATE.data.jadwal.map(j => j.Kelas).filter(Boolean))].sort();

  kelasList.forEach(kelas => {
    const jadwalKelas = STATE.data.jadwal.filter(j => j.Kelas === kelas);
    const rows = [];

    // Header judul
    rows.push([`JADWAL KULIAH KELAS ${kelas} — PRODI ADMINISTRASI PERKANTORAN PNUP`]);
    rows.push([`Semester Aktif Tahun Akademik ${new Date().getFullYear()}/${new Date().getFullYear()+1}`]);
    rows.push([]);

    // Header kolom
    const headerRow = ['HARI'];
    SLOTS_EXPORT.forEach(s => headerRow.push(s.istirahat ? 'ISTIRAHAT' : `Slot ${s.no}\n${s.mulai}-${s.selesai}`));
    rows.push(headerRow);

    // Data per hari
    ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].forEach(hari => {
      const jadwalHari = jadwalKelas.filter(j => j.Hari === hari);
      const row = [hari];
      SLOTS_EXPORT.forEach(s => {
        if (s.istirahat) { row.push('---'); return; }
        const slot = jadwalHari.find(j => formatJam(j['Jam Mulai']) === s.mulai || formatJam(j['Jam Selesai']) === s.selesai ||
          (formatJam(j['Jam Mulai']) <= s.mulai && formatJam(j['Jam Selesai']) >= s.selesai));
        if (slot) row.push(`${slot['Nama Mata Kuliah']}\n${slot['Dosen Pengampu']||''}\n📍 ${slot.Ruangan||''}`);
        else row.push('');
      });
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Styling lebar kolom
    ws['!cols'] = [{ wch: 10 }, ...SLOTS_EXPORT.map(s => ({ wch: s.istirahat ? 8 : 20 }))];

    // Merge judul
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: SLOTS_EXPORT.length } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: SLOTS_EXPORT.length } },
    ];

    const sheetName = kelas.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `Jadwal_AP_${new Date().getFullYear()}.xlsx`);
  showToast('✅ Excel berhasil didownload', 'success');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ================================================
// STATUS KULIAH — JADWAL 2 (SEDANG / BELUM KULIAH)
// ================================================
let STATUS_KULIAH_DATA = {};
let STATUS_INTERVAL = null;
let KETUA_SESSION = null;

async function renderStatusKuliah() {
  updateTopbar('Status Kuliah', 'Pantau kehadiran kuliah dan ketersediaan ruangan hari ini');
  await loadAllData(true); // paksa reload supaya data ruangan selalu fresh

  // Cek session ketua
  const savedSession = localStorage.getItem('ketua_session');
  if (savedSession) {
    try { KETUA_SESSION = JSON.parse(savedSession); } catch(e) { KETUA_SESSION = null; }
  }

  const loginBox = document.getElementById('status-kuliah-login-box');
  const infoBar = document.getElementById('ketua-info-bar');

  if (KETUA_SESSION) {
    if (loginBox) loginBox.style.display = 'none';
    if (infoBar) {
      infoBar.style.display = 'flex';
      document.getElementById('ketua-info-text').textContent = `🎓 Login sebagai: ${KETUA_SESSION.nama} (${KETUA_SESSION.kelas})`;
    }
  } else {
    if (loginBox) loginBox.style.display = 'block';
    if (infoBar) infoBar.style.display = 'none';
  }

  await loadStatusKuliah();
  drawStatusKuliah();

  // Timer presisi sudah handle perubahan jam — ini hanya fallback + sync server
  if (STATUS_INTERVAL) clearInterval(STATUS_INTERVAL);
  STATUS_INTERVAL = setInterval(() => {
    cekJamOtomatisLokal(); // fallback jaga-jaga
  }, 30000);

  // Sync data dari server tiap 20 detik
  if (window._syncInterval) clearInterval(window._syncInterval);
  window._syncInterval = setInterval(async () => {
    await loadStatusKuliah(); // ini yang pasang timer baru jika ada booking baru
    drawStatusKuliah();
  }, 20000);
}

async function loadStatusKuliah() {
  if (!APPS_SCRIPT_URL) return;
  const url = `${APPS_SCRIPT_URL}?action=getStatusKuliah`;
  const attempts = [
    () => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000) }),
    () => fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) }),
    () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) })
  ];
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const text = await res.text();
      if (!text) continue;
      const json = JSON.parse(text);
      if (json.status === 'success') {
        STATUS_KULIAH_DATA = json.data || {};
        pasangSemuaTimer(); // pasang timer presisi setelah data masuk
        return;
      }
    } catch(e) { continue; }
  }
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function getNamaHariIni() {
  return ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date().getDay()];
}

function getJamSekarang() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function formatJam(jam) {
  if (!jam) return '-';
  const s = String(jam);
  // Handle format Date object dari Google Sheets: "1899-12-30T05:52:48.000Z"
  if (s.includes('T') || s.includes('1899')) {
    const d = new Date(s);
    if (!isNaN(d)) return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  }
  // Sudah format HH:MM
  if (/^\d{2}:\d{2}/.test(s)) return s.substring(0,5);
  return s;
}


// ================================================
// TIMER PRESISI — tembak tepat di jam mulai/selesai
// ================================================
const _timers = {}; // simpan semua timer aktif

// Konversi "HH:MM" ke milidetik dari sekarang
function msHingga(jamStr) {
  if (!jamStr || jamStr.length < 5) return -1;
  const [hh, mm] = jamStr.split(':').map(Number);
  const now  = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  return target - now; // bisa negatif kalau sudah lewat
}

// Pasang timer presisi untuk satu ruangan
function pasangTimerRuangan(ruangan) {
  const d = STATUS_KULIAH_DATA[ruangan];
  if (!d || !d.jamMulai || !d.jamSelesai) return;

  // Bersihkan timer lama
  if (_timers[ruangan + '_mulai'])   clearTimeout(_timers[ruangan + '_mulai']);
  if (_timers[ruangan + '_selesai']) clearTimeout(_timers[ruangan + '_selesai']);

  const msMulai   = msHingga(d.jamMulai);
  const msSelesai = msHingga(d.jamSelesai);

  // Timer JAM MULAI — tembak tepat saat jam mulai
  if (d.status === 'Dibooking' && msMulai >= 0) {
    _timers[ruangan + '_mulai'] = setTimeout(() => {
      if (!STATUS_KULIAH_DATA[ruangan]) return;
      STATUS_KULIAH_DATA[ruangan].status = 'Sedang Dipakai';
      showToast(`🟢 ${ruangan} — Kuliah dimulai! (${d.mataKuliah})`, 'success');
      apiPost('setStatusRuangan', {
        ruangan, statusBaru: 'Sedang Dipakai',
        mataKuliah: d.mataKuliah, dosen: d.dosen,
        jamMulai: d.jamMulai, jamSelesai: d.jamSelesai,
        kelas: d.kelas, namaKetua: d.namaKetua
      });
      refreshSemuaTab(); // update kedua tab
      // Setelah mulai, pasang timer selesai
      pasangTimerSelesai(ruangan);
    }, msMulai);
  }

  // Timer JAM SELESAI — tembak tepat saat jam selesai
  if ((d.status === 'Sedang Dipakai' || d.status === 'Dibooking') && msSelesai >= 0) {
    pasangTimerSelesai(ruangan);
  }
}

function pasangTimerSelesai(ruangan) {
  const d = STATUS_KULIAH_DATA[ruangan];
  if (!d || !d.jamSelesai) return;
  if (_timers[ruangan + '_selesai']) clearTimeout(_timers[ruangan + '_selesai']);

  const msSelesai = msHingga(d.jamSelesai);
  if (msSelesai < 0) return; // sudah lewat

  _timers[ruangan + '_selesai'] = setTimeout(() => {
    const snap = STATUS_KULIAH_DATA[ruangan];
    if (!snap) return;
    const namaKetua = snap.namaKetua || '-';
    const matkul    = snap.mataKuliah || '';
    STATUS_KULIAH_DATA[ruangan] = {};
    showToast(`⬜ ${ruangan} — Selesai (${matkul})`, 'info');
    apiPost('resetStatusRuangan', { ruangan, namaKetua });
    refreshSemuaTab(); // update kedua tab
    delete _timers[ruangan + '_mulai'];
    delete _timers[ruangan + '_selesai'];
  }, msSelesai);
}

// Panggil ini setiap STATUS_KULIAH_DATA diperbarui
function pasangSemuaTimer() {
  Object.keys(STATUS_KULIAH_DATA).forEach(r => pasangTimerRuangan(r));
}

// Tetap ada cek fallback tiap 30 detik untuk jaga-jaga
function cekJamOtomatisLokal() {
  const jamSekarang = getJamSekarang();
  let adaPerubahan = false;
  Object.keys(STATUS_KULIAH_DATA).forEach(ruangan => {
    const d = STATUS_KULIAH_DATA[ruangan];
    if (!d || !d.jamMulai || !d.jamSelesai) return;
    if (d.status === 'Dibooking' && jamSekarang >= d.jamMulai && jamSekarang < d.jamSelesai) {
      STATUS_KULIAH_DATA[ruangan].status = 'Sedang Dipakai';
      adaPerubahan = true;
      apiPost('setStatusRuangan', {
        ruangan, statusBaru: 'Sedang Dipakai',
        mataKuliah: d.mataKuliah, dosen: d.dosen,
        jamMulai: d.jamMulai, jamSelesai: d.jamSelesai,
        kelas: d.kelas, namaKetua: d.namaKetua
      });
    }
    if ((d.status === 'Sedang Dipakai' || d.status === 'Dibooking') && jamSekarang >= d.jamSelesai) {
      const namaKetua = d.namaKetua || '-';
      STATUS_KULIAH_DATA[ruangan] = {};
      adaPerubahan = true;
      apiPost('resetStatusRuangan', { ruangan, namaKetua });
    }
  });
  if (adaPerubahan) drawStatusKuliah();
}

// Update badge di jadwal publik TANPA rebuild seluruh tabel
function updateBadgeJadwalPublik() {
  const area = document.getElementById('jadwal-print-area');
  if (!area) return;

  // Update semua cell yang punya data-ruangan
  area.querySelectorAll('.jp-cell[data-ruangan]').forEach(cell => {
    const ruangan   = cell.dataset.ruangan;
    const statusD   = STATUS_KULIAH_DATA[ruangan] || {};
    const statusNow = statusD.status || '';
    const isSedang  = statusNow === 'Sedang Dipakai';
    const isBooking = statusNow === 'Dibooking';

    // Update border & background cell
    cell.style.border      = `1.5px solid ${isSedang ? '#16a34a' : isBooking ? '#2563eb' : 'var(--border)'}`;
    cell.style.background  = isSedang ? '#041c0e' : isBooking ? '#040d1c' : '';

    // Update badge
    const badge = cell.querySelector('.jp-status-badge');
    if (badge) {
      if (isSedang) {
        badge.style.display = 'inline-block';
        badge.style.background = '#4ade8025';
        badge.style.color = '#4ade80';
        badge.style.border = '1px solid #166534';
        badge.textContent = '🟢 Sedang Dipakai';
      } else if (isBooking) {
        badge.style.display = 'inline-block';
        badge.style.background = '#60a5fa25';
        badge.style.color = '#60a5fa';
        badge.style.border = '1px solid #1e3a8a';
        badge.textContent = '📅 Dibooking';
      } else {
        badge.style.display = 'inline-block';
        badge.style.background = 'var(--bg-elevated)';
        badge.style.color = 'var(--text-muted)';
        badge.style.border = '1px solid var(--border)';
        badge.textContent = '⬜ Kosong';
      }
    }

    // Update tooltip
    const tt = cell.querySelector('.jp-tooltip');
    if (tt && (isSedang || isBooking)) {
      tt.querySelector('.jp-tt-title').textContent = isSedang ? '🟢 Sedang Dipakai' : '📅 Dibooking';
      const rows = tt.querySelectorAll('.jp-tt-val');
      if (rows[0]) rows[0].textContent = statusD.mataKuliah || '';
      if (rows[1]) rows[1].textContent = statusD.dosen || '';
      if (rows[2]) rows[2].textContent = statusD.kelas || '';
      if (rows[4]) rows[4].textContent = `${statusD.jamMulai || ''} – ${statusD.jamSelesai || ''}`;
      if (rows[5]) rows[5].textContent = statusD.namaKetua || '';
      tt.parentElement?.classList.remove('jp-sedang','jp-booking');
      tt.parentElement?.classList.add(isSedang ? 'jp-sedang' : 'jp-booking');
    }
  });
}

// Update kedua tab sekaligus
function refreshSemuaTab() {
  // Update Status Kuliah kalau sedang aktif
  if (document.getElementById('page-status-kuliah')?.classList.contains('active')) {
    drawStatusKuliah();
  }
  // Update Jadwal Ruangan - cukup update badge, tidak perlu rebuild seluruh tabel
  if (document.getElementById('page-jadwal-publik')?.classList.contains('active')) {
    const area = document.getElementById('jadwal-print-area');
    if (area) {
      updateBadgeJadwalPublik(); // update badge instan
    } else {
      renderJadwalPublik(); // kalau belum ada, baru render penuh
    }
  }
}

function drawStatusKuliah() {
  const container = document.getElementById('status-kuliah-content');
  if (!container) return;

  if (!KETUA_SESSION) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:40px;margin-bottom:14px;">🔐</div>
        <div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:8px;">Login Diperlukan</div>
        <div style="font-size:13px;color:var(--text-muted);">Login sebagai Ketua Kelas untuk mengubah status ruangan</div>
      </div>`;
    return;
  }

  // Ambil semua ruangan dari data master ruangan
  // Ambil dari master ruangan, fallback ke ruangan dari data jadwal
  let semuaRuangan = [...STATE.data.ruangan].sort((a,b) =>
    String(a['Nama Ruangan']).localeCompare(String(b['Nama Ruangan']))
  );

  // Fallback: kalau master ruangan kosong, ambil dari data jadwal
  if (semuaRuangan.length === 0) {
    const ruanganDariJadwal = [...new Set(STATE.data.jadwal.map(j => j.Ruangan).filter(Boolean))].sort();
    semuaRuangan = ruanganDariJadwal.map(r => ({ ID: r, 'Nama Ruangan': r, Keterangan: '' }));
  }

  if (semuaRuangan.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🚪</div><div class="empty-state-title">Belum ada ruangan</div><div class="empty-state-text">Tambahkan ruangan di menu Ruangan atau tambahkan jadwal kuliah terlebih dahulu</div></div>`;
    return;
  }

  const hariIni = getNamaHariIni();
  const jamSekarang = getJamSekarang();

  // Jadwal hari ini per ruangan
  const jadwalHariIni = {};
  STATE.data.jadwal.forEach(j => {
    if (j.Hari === hariIni && j.Ruangan) {
      if (!jadwalHariIni[j.Ruangan]) jadwalHariIni[j.Ruangan] = [];
      jadwalHariIni[j.Ruangan].push(j);
    }
  });
  // Urutkan per jam mulai
  Object.keys(jadwalHariIni).forEach(r => {
    jadwalHariIni[r].sort((a,b) => formatJam(a['Jam Mulai']).localeCompare(formatJam(b['Jam Mulai'])));
  });

  // Hitung stat
  const namaRuanganList = semuaRuangan.map(r => r['Nama Ruangan']);
  const jmlSedang   = namaRuanganList.filter(r => STATUS_KULIAH_DATA[r]?.status === 'Sedang Dipakai').length;
  const jmlBooking  = namaRuanganList.filter(r => STATUS_KULIAH_DATA[r]?.status === 'Dibooking').length;
  const jmlKosong   = namaRuanganList.filter(r => {
    const s = STATUS_KULIAH_DATA[r]?.status;
    return !s || s === 'Kosong' || s === 'Belum Kuliah';
  }).length;

  let html = `
    <style>
      @keyframes sk-pulse{0%,100%{opacity:1}50%{opacity:0.35}}
      .hs-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;}
      .hs{border-radius:14px;padding:16px 16px 14px;border:1px solid;position:relative;}
      .hs.s-green{background:#041c0e;border-color:#166534;}
      .hs.s-amber{background:#1c1200;border-color:#92400e;}
      .hs.s-gray{background:#111110;border-color:#333331;}
      .hs.s-blue{background:#040d1c;border-color:#1e3a5f;}
      .hs-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:12px;}
      .s-green .hs-icon{background:#0d2e1a;color:#4ade80;}
      .s-amber .hs-icon{background:#2b1e00;color:#fbbf24;}
      .s-gray  .hs-icon{background:#1c1c1a;color:#888;}
      .s-blue  .hs-icon{background:#0a1829;color:#60a5fa;}
      .hs-badge{position:absolute;top:12px;right:12px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;letter-spacing:.04em;}
      .s-green .hs-badge{background:#0d2e1a;color:#4ade80;border:1px solid #166534;}
      .s-amber .hs-badge{background:#2b1e00;color:#fbbf24;border:1px solid #92400e;}
      .s-gray  .hs-badge{background:#1c1c1a;color:#666;border:1px solid #333;}
      .s-blue  .hs-badge{background:#0a1829;color:#60a5fa;border:1px solid #1e3a5f;}
      .hs-num{font-size:32px;font-weight:700;line-height:1;margin-bottom:4px;}
      .s-green .hs-num{color:#4ade80;} .s-amber .hs-num{color:#fbbf24;} .s-gray .hs-num{color:#aaa;} .s-blue .hs-num{color:#e2e8f0;}
      .hs-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#444;}
      .rm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;}
      .rc{border-radius:16px;overflow:hidden;position:relative;transition:transform .2s,box-shadow .2s;}
      .rc:hover{transform:translateY(-3px);}
      .rc.kosong        {background:#0f0f0f;border:1.5px solid #222;}
      .rc.belum-kuliah  {background:#080f09;border:1.5px solid #1a3a22;}
      .rc.sedang-dipakai{background:#04110a;border:1.5px solid #16a34a;}
      .rc.dibooking     {background:#07091a;border:1.5px solid #2563eb;}
      .rc.terkunci      {background:#120d00;border:1.5px solid #b45309;}
      .rc-stripe{height:3px;width:100%;}
      .rc.kosong         .rc-stripe{background:#222;}
      .rc.belum-kuliah   .rc-stripe{background:#1a3a22;}
      .rc.sedang-dipakai .rc-stripe{background:linear-gradient(90deg,#16a34a,#4ade80);}
      .rc.dibooking      .rc-stripe{background:linear-gradient(90deg,#2563eb,#60a5fa);}
      .rc.terkunci       .rc-stripe{background:#b45309;}
      .rc-body{padding:14px 14px 12px;}
      .rc-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;}
      .rc-name{font-size:15px;font-weight:700;color:#f1f5f9;letter-spacing:-.01em;}
      .rc-tag{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:20px;}
      .rc.kosong         .rc-tag{background:#1a1a1a;color:#4b5563;}
      .rc.belum-kuliah   .rc-tag{background:#052e16;color:#4ade80;}
      .rc.sedang-dipakai .rc-tag{background:#052e16;color:#4ade80;}
      .rc.dibooking      .rc-tag{background:#0f172a;color:#60a5fa;}
      .rc.terkunci       .rc-tag{background:#1c1100;color:#fbbf24;}
      .rc-info{border-radius:10px;padding:10px 12px;margin-bottom:10px;border:1px solid;min-height:56px;display:flex;flex-direction:column;justify-content:center;gap:1px;}
      .rc.kosong         .rc-info{background:#141414;border-color:#222;}
      .rc.belum-kuliah   .rc-info{background:#061208;border-color:#1a3a22;}
      .rc.sedang-dipakai .rc-info{background:#051709;border-color:#16a34a55;}
      .rc.dibooking      .rc-info{background:#060c1e;border-color:#2563eb55;}
      .rc.terkunci       .rc-info{background:#110d00;border-color:#b4530955;}
      .rc-info-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;}
      .rc.belum-kuliah   .rc-info-label{color:#4ade8088;}
      .rc.sedang-dipakai .rc-info-label{color:#4ade80;}
      .rc.dibooking      .rc-info-label{color:#60a5fa;}
      .rc.terkunci       .rc-info-label{color:#fbbf24;}
      .rc-info-matkul{font-size:12px;font-weight:700;color:#f1f5f9;line-height:1.35;margin-bottom:2px;}
      .rc-info-dosen{font-size:11px;color:#64748b;}
      .rc-info-jam{font-size:11px;font-family:monospace;font-weight:700;margin-top:4px;}
      .rc.belum-kuliah   .rc-info-jam{color:#4ade8088;}
      .rc.sedang-dipakai .rc-info-jam{color:#4ade80;}
      .rc.dibooking      .rc-info-jam{color:#60a5fa;}
      .rc-info-by{font-size:10px;color:#475569;margin-top:3px;}
      .rc-empty{font-size:11px;color:#374151;text-align:center;width:100%;padding:4px 0;}
      .rc-footer{display:flex;align-items:center;gap:8px;}
      .rc-pill{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;padding:5px 10px;border-radius:20px;flex-shrink:0;letter-spacing:.02em;}
      .pill-dot{width:6px;height:6px;border-radius:50%;}
      .rc.kosong         .rc-pill{background:#1a1a1a;color:#4b5563;}
      .rc.belum-kuliah   .rc-pill{background:#052e16;color:#4ade80;}
      .rc.sedang-dipakai .rc-pill{background:#052e16;color:#4ade80;}
      .rc.dibooking      .rc-pill{background:#0f172a;color:#60a5fa;}
      .rc.terkunci       .rc-pill{background:#1c1100;color:#fbbf24;}
      .rc.kosong         .pill-dot{background:#4b5563;}
      .rc.belum-kuliah   .pill-dot{background:#4ade8055;}
      .rc.sedang-dipakai .pill-dot{background:#4ade80;animation:sk-pulse 2s infinite;box-shadow:0 0 6px #4ade80;}
      .rc.dibooking      .pill-dot{background:#60a5fa;animation:sk-pulse 2s infinite;box-shadow:0 0 6px #60a5fa;}
      .rc.terkunci       .pill-dot{background:#fbbf24;}
      .abtn{font-size:11px;font-weight:700;padding:7px 10px;border-radius:9px;cursor:pointer;border:1.5px solid;flex:1;text-align:center;white-space:nowrap;background:transparent;letter-spacing:.01em;}
      .abtn.kuliah {color:#4ade80;border-color:#16a34a;} .abtn.kuliah:hover {background:#052e16;}
      .abtn.booking{color:#60a5fa;border-color:#2563eb;} .abtn.booking:hover{background:#0f172a;}
      .abtn.stop   {color:#f87171;border-color:#991b1b;} .abtn.stop:hover   {background:#1c0505;}
      .abtn.locked {color:#374151;border-color:#222;cursor:not-allowed;}
      /* Modal Booking */
      .bk-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;}
      .bk-modal{background:#0d0d0d;border:1px solid #222;border-radius:18px;padding:24px;width:380px;max-width:92vw;}
      .bk-title{font-size:15px;font-weight:800;color:#e8e8e8;margin-bottom:3px;}
      .bk-sub{font-size:12px;color:#555;margin-bottom:18px;}
      .bk-field{margin-bottom:12px;}
      .bk-field label{display:block;font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}
      .bk-field input{width:100%;background:#111;border:1px solid #222;border-radius:8px;padding:9px 12px;font-size:12px;color:#e8e8e8;outline:none;box-sizing:border-box;}
      .bk-field input:focus{border-color:#1e3a8a;}
      .bk-field input[disabled]{color:#444;cursor:not-allowed;}
      .bk-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .bk-actions{display:flex;gap:8px;margin-top:18px;}
      .bk-cancel{flex:1;padding:10px;border-radius:9px;border:1px solid #222;background:transparent;color:#555;font-size:12px;font-weight:600;cursor:pointer;}
      .bk-cancel:hover{background:#111;}
      .bk-submit{flex:2;padding:10px;border-radius:9px;border:none;background:#1e3a8a;color:#93c5fd;font-size:12px;font-weight:700;cursor:pointer;}
      .bk-submit:hover{background:#1d4ed8;}
    </style>

    <div class="hs-grid">
      <div class="hs s-green">
        <div class="hs-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4l-6 4v12l6 4V4z"/></svg></div>
        <span class="hs-badge">Kuliah</span>
        <div class="hs-num">${jmlSedang}</div>
        <div class="hs-lbl">Sedang Kuliah</div>
      </div>
      <div class="hs s-amber">
        <div class="hs-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <span class="hs-badge">Booking</span>
        <div class="hs-num">${jmlBooking}</div>
        <div class="hs-lbl">Dibooking</div>
      </div>
      <div class="hs s-gray">
        <div class="hs-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4l-6 4v12l6 4V4z"/></svg></div>
        <span class="hs-badge">Bebas</span>
        <div class="hs-num">${jmlKosong}</div>
        <div class="hs-lbl">Kosong / Belum Mulai</div>
      </div>
      <div class="hs s-blue">
        <div class="hs-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
        <span class="hs-badge">Total</span>
        <div class="hs-num">${semuaRuangan.length}</div>
        <div class="hs-lbl">Semua Ruangan</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#444;">
        Status Ruangan — ${hariIni}
      </span>
      <button onclick="resetSemuaStatusRuangan()" style="font-size:11px;color:#555;background:transparent;border:1px solid #222;border-radius:8px;padding:4px 12px;cursor:pointer;display:flex;align-items:center;gap:5px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        Reset semua
      </button>
    </div>

    <div class="rm-grid">
      ${semuaRuangan.map(rObj => {
        const namaR     = rObj['Nama Ruangan'];
        const statusD   = STATUS_KULIAH_DATA[namaR] || {};
        const statusNow = statusD.status || '';

        // Cek jadwal hari ini untuk ruangan ini
        const jadwalR   = jadwalHariIni[namaR] || [];
        const adaJadwal = jadwalR.length > 0;

        // Tentukan state
        let state, tagText, pillText;
        const isLocked = (statusNow === 'Sedang Dipakai' || statusNow === 'Dibooking')
                      && statusD.namaKetua && statusD.namaKetua !== KETUA_SESSION.nama;

        if (isLocked) {
          state = 'terkunci'; tagText = 'Dikunci'; pillText = 'Terkunci';
        } else if (statusNow === 'Sedang Dipakai') {
          state = 'sedang-dipakai'; tagText = 'Sedang Dipakai'; pillText = 'Live';
        } else if (statusNow === 'Dibooking') {
          state = 'dibooking'; tagText = 'Dibooking'; pillText = 'Booking';
        } else if (adaJadwal) {
          state = 'belum-kuliah'; tagText = 'Belum Kuliah'; pillText = 'Terjadwal';
        } else {
          state = 'kosong'; tagText = 'Kosong'; pillText = 'Bebas';
        }

        // Info di dalam card
        let infoHTML = '';
        if (statusNow === 'Sedang Dipakai') {
          const mk  = statusD.mataKuliah || (adaJadwal ? jadwalR[0]['Nama Mata Kuliah'] : '-');
          const dsn = statusD.dosen      || (adaJadwal ? jadwalR[0]['Dosen Pengampu']   : '-');
          const jm  = statusD.jamMulai   || (adaJadwal ? formatJam(jadwalR[0]['Jam Mulai'])   : '');
          const jsl = statusD.jamSelesai || (adaJadwal ? formatJam(jadwalR[0]['Jam Selesai']) : '');
          infoHTML = `
            <div class="rc-info-label">Sedang Berlangsung</div>
            <div class="rc-info-matkul">${mk}</div>
            <div class="rc-info-dosen">${dsn}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px;">
              <div class="rc-info-jam">${jm} – ${jsl}</div>
              <div style="font-size:9px;color:#4b5563;font-style:italic;">${statusD.namaKetua||''}</div>
            </div>`;
        } else if (statusNow === 'Dibooking') {
          infoHTML = `
            <div class="rc-info-label">Dibooking</div>
            <div class="rc-info-matkul">${statusD.mataKuliah||'-'}</div>
            <div class="rc-info-dosen">${statusD.dosen||'-'}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px;">
              <div class="rc-info-jam">${statusD.jamMulai||''} – ${statusD.jamSelesai||''}</div>
              <div style="font-size:9px;color:#4b5563;font-style:italic;">${statusD.namaKetua||''}</div>
            </div>`;
        } else if (adaJadwal) {
          infoHTML = `
            <div class="rc-info-label">Jadwal Hari Ini</div>
            <div class="rc-info-matkul">${jadwalR[0]['Nama Mata Kuliah']}</div>
            <div class="rc-info-dosen">${jadwalR[0]['Dosen Pengampu']||'-'}</div>
            <div class="rc-info-jam" style="margin-top:5px;">${formatJam(jadwalR[0]['Jam Mulai'])} – ${formatJam(jadwalR[0]['Jam Selesai'])}</div>`;
        } else {
          infoHTML = `<span class="rc-empty">Tidak ada jadwal hari ini</span>`;
        }

        // Corner icon
        const cornerSVG = isLocked
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
          : statusNow === 'Sedang Dipakai'
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`
          : statusNow === 'Dibooking'
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
          : adaJadwal
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
          : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4l-6 4v12l6 4V4z"/></svg>`;

        // Tombol aksi
        let btnHTML = '';
        if (isLocked) {
          btnHTML = `<button class="abtn locked" disabled>🔒 Dikunci</button>`;
        } else if (statusNow === 'Sedang Dipakai') {
          btnHTML = `<button class="abtn stop" onclick="aksiRuangan('selesai','${namaR}')">⏹ Selesai</button>`;
        } else if (statusNow === 'Dibooking') {
          btnHTML = `<button class="abtn stop" onclick="aksiRuangan('batalBooking','${namaR}')">✕ Batalkan</button>`;
        } else if (adaJadwal) {
          btnHTML = `<button class="abtn kuliah" onclick="aksiRuangan('mulaiKuliah','${namaR}')">▶ Mulai Kuliah</button>`;
        } else {
          btnHTML = `<button class="abtn booking" onclick="aksiRuangan('booking','${namaR}')">📅 Booking</button>`;
        }

        return `<div class="rc ${state}">
          <div class="rc-stripe"></div>
          <div class="rc-body">
            <div class="rc-head">
              <div class="rc-name">${namaR}</div>
              <div class="rc-tag">${tagText}</div>
            </div>
            <div class="rc-info">${infoHTML}</div>
            <div class="rc-footer">
              <span class="rc-pill"><span class="pill-dot"></span>${pillText}</span>
              ${btnHTML}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  container.innerHTML = html;
}

// Aksi tombol ruangan
async function aksiRuangan(aksi, namaR) {
  if (!KETUA_SESSION) { showToast('⚠️ Login terlebih dahulu', 'warning'); return; }

  const statusD = STATUS_KULIAH_DATA[namaR] || {};

  // Cek dikunci ketua lain
  if (['selesai','batalBooking'].includes(aksi)) {
    if (statusD.namaKetua && statusD.namaKetua !== KETUA_SESSION.nama) {
      showToast(`🔒 ${namaR} dikunci oleh ${statusD.namaKetua}`, 'warning');
      return;
    }
  }

  const hariIni = getNamaHariIni();

  if (aksi === 'mulaiKuliah') {
    // Ambil data jadwal hari ini untuk ruangan ini
    const jadwalR    = STATE.data.jadwal.find(j => j.Ruangan === namaR && j.Hari === hariIni);
    const mataKuliah = jadwalR ? jadwalR['Nama Mata Kuliah'] : '';
    const dosen      = jadwalR ? (jadwalR['Dosen Pengampu'] || '') : '';
    const jamMulai   = jadwalR ? formatJam(jadwalR['Jam Mulai'])   : '';
    const jamSelesai = jadwalR ? formatJam(jadwalR['Jam Selesai']) : '';
    const kelas      = jadwalR ? (jadwalR['Kelas'] || KETUA_SESSION.kelas) : KETUA_SESSION.kelas;

    STATUS_KULIAH_DATA[namaR] = { status:'Sedang Dipakai', mataKuliah, dosen, jamMulai, jamSelesai, kelas, namaKetua:KETUA_SESSION.nama, waktuUpdate:getJamSekarang() };
    await apiPost('setStatusRuangan', { ruangan:namaR, statusBaru:'Sedang Dipakai', mataKuliah, dosen, jamMulai, jamSelesai, kelas, namaKetua:KETUA_SESSION.nama });
    showToast(`✅ ${namaR} — Sedang Dipakai`, 'success');
    refreshSemuaTab();

  } else if (aksi === 'selesai' || aksi === 'batalBooking') {
    STATUS_KULIAH_DATA[namaR] = {};
    await apiPost('resetStatusRuangan', { ruangan:namaR, namaKetua:KETUA_SESSION.nama });
    showToast(`⬜ ${namaR} — ${aksi==='selesai' ? 'Kuliah selesai' : 'Booking dibatalkan'}`, 'info');
    refreshSemuaTab();

  } else if (aksi === 'booking') {
    tampilModalBooking(namaR);
  }
}

// Modal booking untuk ruangan kosong
function tampilModalBooking(namaR) {
  document.getElementById('bk-modal-wrap')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'bk-modal-wrap';
  wrap.className = 'bk-overlay';
  wrap.innerHTML = `
    <div class="bk-modal">
      <div class="bk-title">📅 Booking Ruangan</div>
      <div class="bk-sub">📍 ${namaR}</div>
      <div class="bk-field">
        <label>Nama Ketua Kelas</label>
        <input type="text" id="bk-ketua" value="${KETUA_SESSION.nama}" disabled>
      </div>
      <div class="bk-field">
        <label>Kelas</label>
        <input type="text" id="bk-kelas" value="${KETUA_SESSION.kelas}" disabled>
      </div>
      <div class="bk-field">
        <label>Mata Kuliah <span style="color:#f87171;">*</span></label>
        <input type="text" id="bk-matkul" placeholder="Nama mata kuliah...">
      </div>
      <div class="bk-field">
        <label>Dosen <span style="color:#f87171;">*</span></label>
        <input type="text" id="bk-dosen" placeholder="Nama dosen...">
      </div>
      <div class="bk-field bk-row">
        <div>
          <label>Jam Mulai <span style="color:#f87171;">*</span></label>
          <input type="time" id="bk-jam-mulai">
        </div>
        <div>
          <label>Jam Selesai <span style="color:#f87171;">*</span></label>
          <input type="time" id="bk-jam-selesai">
        </div>
      </div>
      <div class="bk-actions">
        <button class="bk-cancel" onclick="document.getElementById('bk-modal-wrap').remove()">Batal</button>
        <button class="bk-submit" onclick="submitBooking('${namaR}')">📅 Booking Sekarang</button>
      </div>
    </div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}

async function submitBooking(namaR) {
  const mataKuliah = document.getElementById('bk-matkul')?.value.trim();
  const dosen      = document.getElementById('bk-dosen')?.value.trim();
  const jamMulai   = document.getElementById('bk-jam-mulai')?.value;
  const jamSelesai = document.getElementById('bk-jam-selesai')?.value;

  if (!mataKuliah || !dosen || !jamMulai || !jamSelesai) {
    showToast('⚠️ Semua field wajib diisi', 'warning'); return;
  }
  if (jamSelesai <= jamMulai) {
    showToast('⚠️ Jam selesai harus lebih dari jam mulai', 'warning'); return;
  }

  STATUS_KULIAH_DATA[namaR] = {
    status:'Dibooking', mataKuliah, dosen, jamMulai, jamSelesai,
    kelas:KETUA_SESSION.kelas, namaKetua:KETUA_SESSION.nama, waktuUpdate:getJamSekarang()
  };
  await apiPost('bookingRuangan', {
    ruangan:namaR, statusBaru:'Dibooking', mataKuliah, dosen, jamMulai, jamSelesai,
    kelas:KETUA_SESSION.kelas, namaKetua:KETUA_SESSION.nama
  });
  document.getElementById('bk-modal-wrap')?.remove();
  showToast(`✅ ${namaR} berhasil dibooking!`, 'success');
  pasangTimerRuangan(namaR); // pasang timer presisi langsung setelah booking
  refreshSemuaTab(); // update kedua tab langsung
}

async function resetSemuaStatusRuangan() {
  if (!confirm('Reset semua ruangan ke status Kosong?')) return;
  STATUS_KULIAH_DATA = {};
  drawStatusKuliah();
  await apiPost('resetStatusKuliah', { namaKetua: KETUA_SESSION?.nama || '-' });
  showToast('🔄 Semua ruangan direset ke Kosong', 'info');
}

async function loginKetua() {
  const username = document.getElementById('ketua-username').value.trim();
  const password = document.getElementById('ketua-password').value.trim();
  if (!username || !password) { showToast('⚠️ Isi username dan password', 'warning'); return; }
  if (!APPS_SCRIPT_URL) { showToast('⚠️ APPS_SCRIPT_URL belum diisi', 'error'); return; }

  showToast('⏳ Memeriksa akun...', 'info');
  const url = `${APPS_SCRIPT_URL}?action=loginKetua&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const json = await res.json();
    if (json.status === 'success') {
      KETUA_SESSION = json.data;
      localStorage.setItem('ketua_session', JSON.stringify(KETUA_SESSION));
      showToast(`✅ Login berhasil! Selamat datang, ${KETUA_SESSION.nama}`, 'success');
      renderStatusKuliah();
    } else {
      showToast('❌ ' + (json.message || 'Username atau password salah'), 'error');
    }
  } catch(e) {
    showToast('❌ Gagal terhubung ke server', 'error');
  }
}

function logoutKetua() {
  KETUA_SESSION = null;
  localStorage.removeItem('ketua_session');
  showToast('👋 Logout berhasil', 'info');
  renderStatusKuliah();
}


// ================================================
// RUANGAN (CRUD)
// ================================================
async function renderRuanganPage() {
  updateTopbar('Ruangan', 'Kelola daftar ruangan yang tersedia untuk jadwal kuliah dan booking');
  await loadAllData();
  const container = document.getElementById('ruangan-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari Ruangan</label>
          <input type="text" id="rng-search" class="filter-input" placeholder="Cari nama ruangan, keterangan..." oninput="renderRuanganTable()">
        </div>
        <button class="btn btn-primary" onclick="openRuanganModal()">➕ Tambah Ruangan</button>
      </div>
    </div>
    <div id="rng-table-wrap"></div>`;
  renderRuanganTable();
}

function renderRuanganTable() {
  const wrap = document.getElementById('rng-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('rng-search')?.value || '').toLowerCase();
  const filtered = STATE.data.ruangan.filter(r =>
    !search || Object.values(r).some(v => String(v).toLowerCase().includes(search))
  ).sort((a,b) => String(a['Nama Ruangan']).localeCompare(String(b['Nama Ruangan'])));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🚪</div><div class="empty-state-title">Belum ada data ruangan</div><div class="empty-state-text">Klik "Tambah Ruangan" untuk menambahkan ruangan baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center">
        <thead><tr><th class="col-left">Nama Ruangan</th><th class="col-left">Keterangan</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filtered.map(r => `
            <tr>
              <td class="col-left"><strong>${r['Nama Ruangan']}</strong></td>
              <td class="col-left" style="color:var(--text-muted);">${r['Keterangan']||'-'}</td>
              <td>
                <div style="display:flex;gap:6px;justify-content:center;">
                  <button class="btn-row-action edit" onclick='openRuanganModal(${JSON.stringify(r).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusRuangan('${r.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openRuanganModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-ruangan-title').textContent = data ? 'Edit Ruangan' : 'Tambah Ruangan';
  document.getElementById('ruangan-nama').value = data ? data['Nama Ruangan'] : '';
  document.getElementById('ruangan-keterangan').value = data ? (data['Keterangan']||'') : '';
  document.getElementById('modal-ruangan').classList.add('open');
}

function closeRuanganModal() {
  document.getElementById('modal-ruangan').classList.remove('open');
  STATE.editingId = null;
}

async function submitRuangan() {
  const namaRuangan  = document.getElementById('ruangan-nama').value.trim();
  const keterangan   = document.getElementById('ruangan-keterangan').value.trim();
  if (!namaRuangan) { showToast('⚠️ Nama ruangan wajib diisi', 'warning'); return; }

  const payload = { namaRuangan, keterangan };
  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editRuangan', payload);
    const idx = STATE.data.ruangan.findIndex(r => r.ID === STATE.editingId);
    if (idx > -1) STATE.data.ruangan[idx] = { ...STATE.data.ruangan[idx], 'Nama Ruangan': namaRuangan, Keterangan: keterangan };
    showToast('✅ Ruangan berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addRuangan', payload);
    STATE.data.ruangan.push({ ID: tempId, 'Nama Ruangan': namaRuangan, Keterangan: keterangan });
    showToast('✅ Ruangan berhasil ditambahkan', 'success');
  }
  closeRuanganModal();
  renderRuanganTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusRuangan(id) {
  if (!confirm('Yakin ingin menghapus ruangan ini? Jadwal yang menggunakan ruangan ini tidak ikut terhapus.')) return;
  await apiPost('deleteRuangan', { id });
  STATE.data.ruangan = STATE.data.ruangan.filter(r => r.ID !== id);
  showToast('🗑️ Ruangan berhasil dihapus', 'warning');
  renderRuanganTable();
}

// ================================================
// AKUN KETUA KELAS (CRUD)
// ================================================
async function renderAkunKetuaPage() {
  updateTopbar('Akun Ketua Kelas', 'Kelola akun login ketua kelas');
  await loadAllData();
  const container = document.getElementById('akun-ketua-content');
  if (!container) return;

  container.innerHTML = `
    <div class="filter-bar-wrap">
      <div class="filter-row">
        <div class="filter-group" style="flex:1;">
          <label class="filter-label">🔍 Cari</label>
          <input type="text" id="kt-search" class="filter-input" placeholder="Cari nama, username, kelas..." oninput="renderAkunKetuaTable()">
        </div>
        <button class="btn btn-primary" onclick="openAkunKetuaModal()">➕ Tambah Akun Ketua</button>
      </div>
    </div>
    <div id="kt-table-wrap"></div>`;

  renderAkunKetuaTable();
}

function renderAkunKetuaTable() {
  const wrap = document.getElementById('kt-table-wrap');
  if (!wrap) return;
  const search = (document.getElementById('kt-search')?.value || '').toLowerCase();
  const filtered = STATE.data.akunKetua.filter(a =>
    !search || Object.values(a).some(v => String(v).toLowerCase().includes(search))
  ).sort((a,b) => String(a.Nama).localeCompare(String(b.Nama)));

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔑</div><div class="empty-state-title">Belum ada akun ketua kelas</div><div class="empty-state-text">Klik "Tambah Akun Ketua" untuk menambahkan akun baru</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="nilai-table-container">
      <table class="data-table data-table-center">
        <thead><tr><th class="col-left">Nama</th><th>Kelas</th><th>Username</th><th>Password</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filtered.map(a => `
            <tr>
              <td class="col-left"><strong>${a.Nama}</strong></td>
              <td><span style="background:var(--accent-subtle);color:var(--accent);padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid var(--accent-border);">${a.Kelas}</span></td>
              <td style="font-family:monospace;">${a.Username}</td>
              <td style="font-family:monospace;">${a.Password}</td>
              <td>
                <div style="display:flex;gap:6px;justify-content:center;">
                  <button class="btn-row-action edit" onclick='openAkunKetuaModal(${JSON.stringify(a).replace(/'/g,"&apos;")})' title="Edit">✏️</button>
                  <button class="btn-row-action delete" onclick="hapusAkunKetua('${a.ID}')" title="Hapus">🗑️</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function openAkunKetuaModal(data) {
  STATE.editingId = data ? data.ID : null;
  document.getElementById('modal-kt-title').textContent = data ? 'Edit Akun Ketua' : 'Tambah Akun Ketua Kelas';
  document.getElementById('kt-nama').value = data ? data.Nama : '';
  document.getElementById('kt-kelas').value = data ? data.Kelas : '';
  document.getElementById('kt-username').value = data ? data.Username : '';
  document.getElementById('kt-password').value = data ? data.Password : '';
  document.getElementById('modal-akun-ketua').classList.add('open');
}

function closeAkunKetuaModal() {
  document.getElementById('modal-akun-ketua').classList.remove('open');
  STATE.editingId = null;
}

async function submitAkunKetua() {
  const nama = document.getElementById('kt-nama').value.trim();
  const kelas = document.getElementById('kt-kelas').value.trim();
  const username = document.getElementById('kt-username').value.trim();
  const password = document.getElementById('kt-password').value.trim();
  if (!nama || !kelas || !username || !password) { showToast('⚠️ Semua field wajib diisi', 'warning'); return; }

  const payload = { nama, kelas, username, password };
  if (STATE.editingId) {
    payload.id = STATE.editingId;
    await apiPost('editAkunKetua', payload);
    const idx = STATE.data.akunKetua.findIndex(a => a.ID === STATE.editingId);
    if (idx > -1) STATE.data.akunKetua[idx] = { ...STATE.data.akunKetua[idx], Nama: nama, Kelas: kelas, Username: username, Password: password };
    showToast('✅ Akun berhasil diupdate', 'success');
  } else {
    const tempId = 'TEMP-' + Date.now();
    await apiPost('addAkunKetua', payload);
    STATE.data.akunKetua.push({ ID: tempId, Nama: nama, Kelas: kelas, Username: username, Password: password });
    showToast('✅ Akun ketua berhasil ditambahkan', 'success');
  }
  closeAkunKetuaModal();
  renderAkunKetuaTable();
  setTimeout(() => loadAllData(true), 1500);
}

async function hapusAkunKetua(id) {
  if (!confirm('Yakin ingin menghapus akun ketua ini?')) return;
  await apiPost('deleteAkunKetua', { id });
  STATE.data.akunKetua = STATE.data.akunKetua.filter(a => a.ID !== id);
  showToast('🗑️ Akun berhasil dihapus', 'warning');
  renderAkunKetuaTable();
}

document.addEventListener('DOMContentLoaded', () => {
  loadSession();  // Load session pertama kali
  
  const savedTheme = localStorage.getItem('akademikap_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.querySelectorAll('.theme-toggle').forEach(b => b.textContent = savedTheme === 'dark' ? '🌙 Mode Gelap' : '☀️ Mode Terang');
  document.querySelectorAll('#theme-btn-top').forEach(b => b.textContent = savedTheme === 'dark' ? '🌙' : '☀️');

  navigate('dashboard');

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  document.getElementById('sidebar-overlay')?.addEventListener('click', toggleSidebar);
});
