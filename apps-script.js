// ================================================
//  AKADEMIKAP - GOOGLE APPS SCRIPT BACKEND
//  Portal Administrasi Perkantoran PNUP
//  Paste script ini ke Google Sheets kamu
//  Extensions → Apps Script → paste → Save → Deploy
// ================================================

// ---- KONFIGURASI SHEET ----
const SHEET_MAHASISWA = 'Mahasiswa';
const SHEET_DOSEN = 'Dosen';
const SHEET_STAF = 'Staf';
const SHEET_MATAKULIAH = 'MataKuliah';
const SHEET_NILAI = 'Nilai';

const HEADERS = {
  Mahasiswa: ['ID', 'NIM', 'Nama', 'Angkatan', 'Status', 'Tanggal Daftar'],
  Dosen: ['ID', 'NIDN', 'Nama', 'Jabatan', 'Tanggal Daftar'],
  Staf: ['ID', 'Nama', 'Jabatan', 'Tanggal Daftar'],
  MataKuliah: ['ID', 'Kode', 'Nama Mata Kuliah', 'Semester', 'Dosen Pengampu', 'Tanggal Dibuat'],
  Nilai: ['ID', 'NIM Mahasiswa', 'Nama Mahasiswa', 'Kode MK', 'Nama Mata Kuliah', 'Semester',
          'Tugas', 'Praktik', 'UTS', 'UAS', 'Absen', 'Skor Mentah', 'Skor Normalisasi',
          'Nilai Huruf', 'Bobot IP', 'Tanggal Input']
};

// ---- BOBOT KOMPONEN NILAI ----
const BOBOT = { tugas: 0.20, praktik: 0.50, uts: 0.25, uas: 0.35, absen: 0.05 };
const TOTAL_BOBOT = 1.35; // untuk normalisasi ke skala 0-100

// ---- KONVERSI NILAI HURUF & BOBOT IP (skala 4 dengan +) ----
function konversiNilai(skor) {
  if (skor >= 85) return { huruf: 'A', bobot: 4.0 };
  if (skor >= 80) return { huruf: 'B+', bobot: 3.5 };
  if (skor >= 75) return { huruf: 'B', bobot: 3.0 };
  if (skor >= 70) return { huruf: 'C+', bobot: 2.5 };
  if (skor >= 60) return { huruf: 'C', bobot: 2.0 };
  if (skor >= 50) return { huruf: 'D', bobot: 1.0 };
  return { huruf: 'E', bobot: 0.0 };
}

// ================================================
// SHEET HELPERS
// ================================================
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#1E3A5F');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function generateId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ================================================
// ROUTER
// ================================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getAll') return handleGetAll();
    if (action === 'getMahasiswa') return handleGetList(SHEET_MAHASISWA);
    if (action === 'getDosen') return handleGetList(SHEET_DOSEN);
    if (action === 'getStaf') return handleGetList(SHEET_STAF);
    if (action === 'getMataKuliah') return handleGetList(SHEET_MATAKULIAH);
    if (action === 'getNilai') return handleGetList(SHEET_NILAI);
    if (action === 'getRapor' && e.parameter.nim) return handleGetRapor(e.parameter.nim);
    return jsonOutput({ status: 'ok', message: 'AkademikAP API aktif' });
  } catch (err) {
    return jsonOutput({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'addMahasiswa') return handleAdd(SHEET_MAHASISWA, buildMahasiswaRow(data));
    if (action === 'editMahasiswa') return handleEdit(SHEET_MAHASISWA, data.id, buildMahasiswaRow(data, data.id));
    if (action === 'deleteMahasiswa') return handleDelete(SHEET_MAHASISWA, data.id);

    if (action === 'addDosen') return handleAdd(SHEET_DOSEN, buildDosenRow(data));
    if (action === 'editDosen') return handleEdit(SHEET_DOSEN, data.id, buildDosenRow(data, data.id));
    if (action === 'deleteDosen') return handleDelete(SHEET_DOSEN, data.id);

    if (action === 'addStaf') return handleAdd(SHEET_STAF, buildStafRow(data));
    if (action === 'editStaf') return handleEdit(SHEET_STAF, data.id, buildStafRow(data, data.id));
    if (action === 'deleteStaf') return handleDelete(SHEET_STAF, data.id);

    if (action === 'addMataKuliah') return handleAdd(SHEET_MATAKULIAH, buildMataKuliahRow(data));
    if (action === 'editMataKuliah') return handleEdit(SHEET_MATAKULIAH, data.id, buildMataKuliahRow(data, data.id));
    if (action === 'deleteMataKuliah') return handleDelete(SHEET_MATAKULIAH, data.id);

    if (action === 'addNilai') return handleAddNilai(data);
    if (action === 'editNilai') return handleEditNilai(data);
    if (action === 'deleteNilai') return handleDelete(SHEET_NILAI, data.id);

    return jsonOutput({ status: 'error', message: 'Action tidak dikenali: ' + action });
  } catch (err) {
    return jsonOutput({ status: 'error', message: err.toString() });
  }
}

// ================================================
// BUILD ROW HELPERS
// ================================================
function buildMahasiswaRow(data, existingId) {
  const id = existingId || generateId('MHS');
  return [id, data.nim || '', data.nama || '', data.angkatan || '', data.status || 'Aktif',
          existingId ? null : new Date().toISOString()];
}
function buildDosenRow(data, existingId) {
  const id = existingId || generateId('DSN');
  return [id, data.nidn || '', data.nama || '', data.jabatan || '',
          existingId ? null : new Date().toISOString()];
}
function buildStafRow(data, existingId) {
  const id = existingId || generateId('STF');
  return [id, data.nama || '', data.jabatan || '',
          existingId ? null : new Date().toISOString()];
}
function buildMataKuliahRow(data, existingId) {
  const id = existingId || generateId('MK');
  return [id, data.kode || '', data.namaMatkul || '', data.semester || '', data.dosenPengampu || '',
          existingId ? null : new Date().toISOString()];
}

// ================================================
// CRUD GENERIK
// ================================================
function handleAdd(sheetName, rowData) {
  const sheet = getOrCreateSheet(sheetName);
  sheet.appendRow(rowData);
  return jsonOutput({ status: 'success', message: 'Data berhasil ditambahkan', id: rowData[0] });
}

function handleEdit(sheetName, id, rowData) {
  const sheet = getOrCreateSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const lastCol = sheet.getLastColumn();
      // Pertahankan tanggal daftar asli (kolom terakhir), jangan ditimpa null
      const tanggalAsli = data[i][lastCol - 1];
      const finalRow = rowData.map((v, idx) => (idx === rowData.length - 1 && v === null) ? tanggalAsli : v);
      sheet.getRange(i + 1, 1, 1, finalRow.length).setValues([finalRow]);
      return jsonOutput({ status: 'success', message: 'Data berhasil diupdate' });
    }
  }
  return jsonOutput({ status: 'error', message: 'Data tidak ditemukan' });
}

function handleDelete(sheetName, id) {
  const sheet = getOrCreateSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return jsonOutput({ status: 'success', message: 'Data berhasil dihapus' });
    }
  }
  return jsonOutput({ status: 'error', message: 'Data tidak ditemukan' });
}

function handleGetList(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  return jsonOutput({ status: 'success', data: sheetToObjects(sheet) });
}

// ================================================
// NILAI: INPUT DENGAN KALKULASI OTOMATIS
// ================================================
function hitungSkor(tugas, praktik, uts, uas, absen) {
  const skorMentah = (tugas * BOBOT.tugas) + (praktik * BOBOT.praktik) +
                      (uts * BOBOT.uts) + (uas * BOBOT.uas) + (absen * BOBOT.absen);
  const skorNormalisasi = Math.round((skorMentah / TOTAL_BOBOT) * 100) / 100;
  const konversi = konversiNilai(skorNormalisasi);
  return { skorMentah: Math.round(skorMentah * 100) / 100, skorNormalisasi, ...konversi };
}

function handleAddNilai(data) {
  const sheet = getOrCreateSheet(SHEET_NILAI);
  const tugas = Number(data.tugas) || 0, praktik = Number(data.praktik) || 0,
        uts = Number(data.uts) || 0, uas = Number(data.uas) || 0, absen = Number(data.absen) || 0;
  const hasil = hitungSkor(tugas, praktik, uts, uas, absen);
  const id = generateId('NL');

  const row = [id, data.nim || '', data.namaMahasiswa || '', data.kodeMk || '', data.namaMatkul || '',
               data.semester || '', tugas, praktik, uts, uas, absen,
               hasil.skorMentah, hasil.skorNormalisasi, hasil.huruf, hasil.bobot, new Date().toISOString()];
  sheet.appendRow(row);

  const newRowNum = sheet.getLastRow();
  const gradeColors = { 'A':'#D1FAE5','B+':'#DBEAFE','B':'#DBEAFE','C+':'#FEF3C7','C':'#FEF3C7','D':'#FED7AA','E':'#FEE2E2' };
  sheet.getRange(newRowNum, 1, 1, row.length).setBackground(gradeColors[hasil.huruf] || '#FFFFFF');

  return jsonOutput({ status: 'success', message: 'Nilai berhasil disimpan', hasil });
}

function handleEditNilai(data) {
  const sheet = getOrCreateSheet(SHEET_NILAI);
  const allData = sheet.getDataRange().getValues();
  const tugas = Number(data.tugas) || 0, praktik = Number(data.praktik) || 0,
        uts = Number(data.uts) || 0, uas = Number(data.uas) || 0, absen = Number(data.absen) || 0;
  const hasil = hitungSkor(tugas, praktik, uts, uas, absen);

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.id)) {
      const tanggalAsli = allData[i][15];
      const row = [data.id, data.nim || '', data.namaMahasiswa || '', data.kodeMk || '', data.namaMatkul || '',
                   data.semester || '', tugas, praktik, uts, uas, absen,
                   hasil.skorMentah, hasil.skorNormalisasi, hasil.huruf, hasil.bobot, tanggalAsli];
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      const gradeColors = { 'A':'#D1FAE5','B+':'#DBEAFE','B':'#DBEAFE','C+':'#FEF3C7','C':'#FEF3C7','D':'#FED7AA','E':'#FEE2E2' };
      sheet.getRange(i + 1, 1, 1, row.length).setBackground(gradeColors[hasil.huruf] || '#FFFFFF');
      return jsonOutput({ status: 'success', message: 'Nilai berhasil diupdate', hasil });
    }
  }
  return jsonOutput({ status: 'error', message: 'Data nilai tidak ditemukan' });
}

// ================================================
// RAPOR: IPS PER SEMESTER + IPK KUMULATIF
// ================================================
function handleGetRapor(nim) {
  const sheet = getOrCreateSheet(SHEET_NILAI);
  const semuaNilai = sheetToObjects(sheet).filter(n => String(n['NIM Mahasiswa']) === String(nim));

  if (semuaNilai.length === 0) {
    return jsonOutput({ status: 'success', data: { nim, perSemester: [], ipk: 0, totalMatkul: 0, statusKelulusan: 'Belum Ada Data' } });
  }

  // Kelompokkan per semester
  const bySemester = {};
  semuaNilai.forEach(n => {
    const sem = n['Semester'];
    if (!bySemester[sem]) bySemester[sem] = [];
    bySemester[sem].push(n);
  });

  const perSemester = Object.keys(bySemester).sort((a,b) => Number(a) - Number(b)).map(sem => {
    const matkuls = bySemester[sem];
    const totalBobot = matkuls.reduce((sum, m) => sum + Number(m['Bobot IP']), 0);
    const ips = Math.round((totalBobot / matkuls.length) * 100) / 100;
    return {
      semester: sem,
      jumlahMatkul: matkuls.length,
      ips,
      matkuls: matkuls.map(m => ({
        kode: m['Kode MK'], nama: m['Nama Mata Kuliah'],
        nilaiHuruf: m['Nilai Huruf'], skor: m['Skor Normalisasi'], bobotIp: m['Bobot IP']
      }))
    };
  });

  // IPK kumulatif = rata-rata seluruh bobot IP semua matkul semua semester
  const totalBobotKumulatif = semuaNilai.reduce((sum, m) => sum + Number(m['Bobot IP']), 0);
  const ipk = Math.round((totalBobotKumulatif / semuaNilai.length) * 100) / 100;

  // Status kelulusan keseluruhan (pendekatan tanpa SKS riil: jumlah matkul lulus + IPK minimum)
  const totalMatkul = semuaNilai.length;
  const matkulLulus = semuaNilai.filter(m => m['Nilai Huruf'] !== 'E').length;
  let statusKelulusan = 'Sedang Berjalan';
  let predikat = '-';

  if (ipk >= 3.5) predikat = 'Dengan Pujian (Cumlaude)';
  else if (ipk >= 3.0) predikat = 'Sangat Memuaskan';
  else if (ipk >= 2.5) predikat = 'Memuaskan';
  else if (ipk > 0) predikat = 'Cukup';

  if (ipk < 2.0 && totalMatkul > 0) statusKelulusan = 'Perlu Perbaikan (IPK < 2.00)';
  else if (ipk >= 2.0) statusKelulusan = 'Memenuhi Syarat Akademik';

  return jsonOutput({
    status: 'success',
    data: { nim, perSemester, ipk, totalMatkul, matkulLulus, statusKelulusan, predikat }
  });
}

// ================================================
// GET ALL: untuk dashboard analitik
// ================================================
function handleGetAll() {
  return jsonOutput({
    status: 'success',
    data: {
      mahasiswa: sheetToObjects(getOrCreateSheet(SHEET_MAHASISWA)),
      dosen: sheetToObjects(getOrCreateSheet(SHEET_DOSEN)),
      staf: sheetToObjects(getOrCreateSheet(SHEET_STAF)),
      mataKuliah: sheetToObjects(getOrCreateSheet(SHEET_MATAKULIAH)),
      nilai: sheetToObjects(getOrCreateSheet(SHEET_NILAI))
    }
  });
}
