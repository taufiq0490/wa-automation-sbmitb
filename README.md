# MBA ITB Jakarta - WhatsApp Lecture Reminder Automation

Aplikasi otomasi pengingat jadwal perkuliahan dan ujian mingguan dosen MBA ITB Kampus Jakarta berbasis integrasi langsung Google Sheets.

---

## 🌟 Fitur Utama

1. **Sinkronisasi Realtime Google Sheets:**
   - Membaca sheet `MCP MBAJ`, `Data Base Dosen`, dan `Team Teaching MBAJ`.
   - Mengambil data terbaru secara langsung tanpa perlu export manual.

2. **Aturan Konsolidasi 1 Dosen = 1 Pesan (Deduplikasi):**
   - Jika dalam rentang 1 minggu seorang dosen mengampu lebih dari satu mata kuliah/kelas, seluruh jadwal digabungkan ke dalam **satu pesan WhatsApp terstruktur** dalam Bahasa Inggris profesional.

3. **Jadwal Pengiriman Sesuai SOP:**
   - **Tombol Cepat "Kelas Weekend"**: Untuk jadwal hari **Sabtu - Minggu** (dikirim hari **Rabu**).
   - **Tombol Cepat "Kelas Weekday"**: Untuk jadwal hari **Senin - Jumat** (dikirim hari **Kamis**).
   - **Pilihan Minggu Perkuliahan**: Dropdown Week 1 s/d Week 16.

4. **Human-in-the-Loop & Customizer:**
   - Input catatan **Guest Lecturer** pada sesi terkait (langsung ter-update di draf pesan secara realtime).
   - Pilihan format pelaksanaan **Exam / Ujian**:
     - *Offline (On-Campus SBM ITB Jakarta)*
     - *Online via Zoom / LMS*
     - *Take-Home Exam*
     - *Konfirmasi ke Dosen* (otomatis menanyakan format ujian ke dosen yang bersangkutan).

5. **Aksi 1-Klik:**
   - **Kirim via WhatsApp Web**: Langsung membuka chat WhatsApp dengan nomor dosen tujuan dan draf pesan terisi otomatis.
   - **Salin Pesan**: Menyalin draf teks ke clipboard.
   - **Tandai Terkirim**: Melacak progres pengiriman reminder per minggu.

---

## 🚀 Cara Menjalankan Aplikasi

1. Cukup klik ganda (double-click) file **`run_app.bat`**.
2. Browser akan otomatis terbuka dan menampilkan dashboard di alamat: `http://127.0.0.1:5000`.

---

## 📁 Struktur File

- **`app.py`**: Server aplikasi utama & pengelola API.
- **`data_sync.py`**: Modul integrasi & sinkronisasi Google Sheets.
- **`message_builder.py`**: Mesin penyusun draf pesan WhatsApp berbahasa Inggris.
- **`templates/index.html`**: Antarmuka dashboard web.
- **`static/style.css`**: Styling dashboard bergaya khas SBM ITB.
- **`static/app.js`**: Logika interaktif frontend.
- **`run_app.bat`**: Script peluncur instan 1-klik untuk Windows.
