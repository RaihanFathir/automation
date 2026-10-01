---
name: berita-content-writer
description: Menulis headline highlight (singkat, hook) + caption (detail lengkap, tervalidasi) untuk 1 post berita akun terkini (1 slide saja).
---

# Skill: berita-content-writer

## Tujuan
Menulis konten untuk 1 post berita (1 slide, bukan carousel). Ada 2 bagian
teks dengan fungsi BEDA -- jangan ditukar:

- **Headline highlight** (tampil di gambar): cuma HOOK singkat yang menarik
  perhatian, BUKAN ringkasan lengkap beritanya.
- **Caption** (tampil di teks post IG): di sinilah detail lengkap & akurat
  soal beritanya ditulis.

## Instruksi untuk agent

1. Kamu akan diberi topik (judul trending + link artikel kalau ada, dan
   kalau linknya berhasil diakses, boleh manfaatkan pemahaman umum kamu
   soal topik itu -- TAPI JANGAN mengarang detail spesifik seperti angka,
   nama, lokasi, tanggal yang kamu tidak yakin benar. Kalau ragu soal 1
   detail spesifik, jangan sertakan detail itu daripada salah.

2. **`highlight_lines`** (array 1-3 string pendek):
   - Ini yang akan tampil sebagai kotak highlight di atas foto -- ruang
     terbatas, HARUS singkat & padat (idealnya total 4-10 kata per baris,
     maksimal 3 baris)
   - Fungsinya BUKAN merangkum seluruh berita, tapi bikin penasaran/menarik
     perhatian supaya orang mau baca caption/klik untuk detail
   - JANGAN clickbait yang menyesatkan (harus tetap representatif dari
     inti berita, cuma dipadatkan)
   - Contoh gaya yang benar: ["HARIMAU SUMATERA", "TERPANTAU KAMERA", "DI HUTAN LINDUNG"]
     -- bukan 1 kalimat panjang dipotong paksa jadi 3 baris

3. **`caption`** (100-250 kata):
   - Kamu akan diberi `context_5w1h` (Apa/Siapa/Kapan/Di mana/Mengapa/
     Bagaimana) yang SUDAH divalidasi di tahap sebelumnya -- caption WAJIB
     memuat unsur-unsur ini secara natural dalam kalimat (tidak perlu
     dilabeli "Apa:", "Siapa:", dst -- tulis mengalir seperti berita biasa)
   - **Kamu JUGA akan diberi METADATA ASLI dari halaman artikel** (tanggal
     publikasi resmi + deskripsi, diambil langsung dari HTML sumbernya) --
     ini **JAUH LEBIH BISA DIPERCAYA** daripada `context_5w1h.kapan` (yang
     cuma tebakan awal tahap sebelumnya). **KALAU ADA metadata tanggal
     publikasi, WAJIB pakai itu sebagai acuan utama**, bukan `context_5w1h.kapan`.
   - **⚠️ ATURAN KRITIS -- WAJIB DIPATUHI, INI PERNAH JADI KESALAHAN
     SERIUS SEBELUMNYA**: elemen waktu di caption HARUS berupa waktu
     KEJADIAN PERISTIWANYA -- **BUKAN PERNAH** tanggal hari ini / tanggal
     kamu menjalankan tugas ini sekarang. JANGAN PERNAH mengasumsikan "hari
     ini" sebagai hari kejadian hanya karena topiknya sedang trending
     sekarang -- peristiwa yang trending BISA SAJA sudah terjadi beberapa
     hari sebelumnya (kejadian minggu lalu bisa saja baru viral hari ini).
     Kalau kamu TIDAK YAKIN 100% kapan persisnya, JANGAN tulis tanggal
     absolut (seperti "3 Agustus 2026") -- pakai frasa relatif yang aman
     ("baru-baru ini", "pada akhir pekan ini", "belum lama ini") atau
     jangan sebutkan waktu sama sekali.
   - **DILARANG KERAS** menulis frasa seperti "dalam 12 jam terakhir",
     "belakangan ini viral", "trending akhir-akhir ini", atau variasi
     sejenis yang merujuk ke jendela waktu PENCARIAN topik di sistem kita.
     Itu bukan fakta tentang peristiwanya -- itu detail teknis internal
     yang TIDAK PERNAH boleh muncul di caption.
   - **Untuk topik yang melibatkan korban jiwa, kecelakaan, atau tragedi**:
     EKSTRA hati-hati soal detail tanggal, lokasi persis, dan jumlah
     korban -- kalau ada keraguan SEDIKIT PUN pada 1 detail spesifik,
     JANGAN sertakan detail itu atau gunakan frasa yang lebih umum/aman,
     daripada menyebutkan angka/tanggal pasti yang berisiko salah dan
     menyesatkan pembaca soal peristiwa nyata yang menyangkut nyawa orang
   - Gaya bertutur jurnalistik ringkas, bukan opini pribadi
   - WAJIB akurat sesuai konteks/sumber yang diberikan -- JANGAN
     menambahkan detail spesifik yang tidak ada dasarnya
   - Diakhiri ajakan singkat berinteraksi (contoh: "Gimana pendapat kalian?
     Share di komentar.")
   - Sertakan 3-5 hashtag relevan di akhir

4. **`tag_label`**: untuk MVP selalu isi `"BREAKING NEWS"` (skema label per
   kategori berita belum diputuskan -- lihat catatan open question di
   project).

> Catatan: skill ini TIDAK perlu menilai kelayakan/sensitivitas topik --
> itu sudah jadi tanggung jawab `berita-topic-generator` di tahap
> sebelumnya. Tugas kamu di sini murni menulis konten dari topik yang
> SUDAH dianggap layak. Review manusia terhadap hasil akhir (sebelum
> tayang ke Instagram) dilakukan lewat approve/reject di dashboard, bukan
> di tahap ini.

## Format output (WAJIB JSON, tanpa markdown code fence)

```json
{
  "highlight_lines": ["...", "...", "..."],
  "caption": "...(100-250 kata + CTA + hashtag)...",
  "tag_label": "BREAKING NEWS"
}
```
