---
name: berita-topic-generator
description: Memilih 1 topik berita dari daftar trending Google Trends (Indonesia, maksimal 12 jam terakhir) untuk akun terkini.
---

# Skill: berita-topic-generator

## Tujuan
Memilih 1 topik dari daftar kandidat trending yang diberikan (hasil dari
`trend-fetcher`, sudah difilter usianya maksimal 12 jam), untuk dibahas di
1 post hari ini.

## Instruksi untuk agent

1. Kamu akan diberi **daftar kandidat topik trending** (judul + link artikel
   kalau ada) di dalam prompt. JANGAN mengarang topik di luar daftar ini --
   pilih SALAH SATU dari daftar yang diberikan.
2. JANGAN pilih topik yang ada di daftar "SUDAH PERNAH DIBAHAS" (diberikan
   di prompt kalau ada histori).
3. **Filter kelayakan** -- lewati kandidat kalau:
   - **Judulnya cuma 1 kata generik/fragmen tanpa konteks** (contoh nyata
     yang HARUS ditolak: "korban", "kecelakaan", "gempa" -- kata tunggal
     ini bisa merujuk ke ratusan peristiwa berbeda, TIDAK cukup spesifik
     untuk ditulis jadi 1 berita yang akurat). Topik yang layak harus
     minimal menyebutkan SIAPA/APA/DI MANA secara spesifik (contoh yang
     BENAR: "Gempa Cianjur", "Korban Kecelakaan Tol Cipularang").
   - Judulnya tidak jelas/ambigu dengan cara lain sampai tidak bisa
     dipahami sebagai 1 topik berita yang konkret
   - Topiknya murni hiburan selebriti tanpa nilai berita (gosip receh),
     KECUALI memang benar-benar sedang jadi perbincangan luas
   - Topik sensitif ekstrem (kekerasan grafis, konten dewasa, SARA yang
     provokatif) -- LEWATI kandidat ini, jangan dipilih sama sekali
   - Topik yang kemungkinan besar clickbait/tidak akurat dan sulit
     diverifikasi validitasnya dari judul + konteks yang ada
4. **WAJIB -- Validasi 5W+1H** sebelum memutuskan pilih 1 kandidat. Untuk
   tiap kandidat yang lolos filter di atas, cek apakah kamu -- berdasarkan
   judul, link artikel (kalau ada), atau pengetahuan umum kamu kalau
   memang mengenali peristiwa itu -- bisa menjawab pertanyaan berikut
   dengan SPESIFIK (bukan tebakan generik/asumsi):
   - **Apa** yang terjadi?
   - **Siapa** yang terlibat?
   - **Kapan** terjadinya? -- ini WAJIB waktu KEJADIAN PERISTIWANYA (misal
     "Sabtu pagi", "kemarin", "hari ini", atau tanggal spesifik kalau
     diketahui dari judul/artikel). **JANGAN PERNAH** isi elemen ini dengan
     "12 jam terakhir" atau variasi sejenis -- itu jendela waktu PENCARIAN
     topik trending di sistem kita (detail teknis internal), BUKAN fakta
     tentang kapan peristiwanya sungguhan terjadi. **JANGAN JUGA** asal isi
     dengan tanggal hari ini hanya karena topiknya lagi trending SEKARANG
     -- topik yang baru viral hari ini bisa saja menceritakan kejadian dari
     beberapa hari sebelumnya. Kalau waktu pastinya memang tidak diketahui
     dari judul/link, isi "tidak diketahui" -- JANGAN mengarang atau
     menebak tanggal spesifik apa pun kalau tidak yakin.
   - **Di mana** lokasinya?
   - **Mengapa** ini terjadi / kenapa ini penting-relevan?
   - **Bagaimana** kejadiannya berlangsung?

   Kalau kamu cuma bisa menjawab **3 atau kurang dari 6** pertanyaan itu
   dengan yakin, kandidat tersebut **TIDAK LAYAK** dipilih -- coba kandidat
   lain di daftar. Ini gate WAJIB, bukan opsional -- jangan pilih topik
   yang "kelihatannya menarik" tapi kamu sendiri tidak bisa isi minimal 4
   dari 6 elemen di atas, karena nanti caption yang ditulis di tahap
   berikutnya (skill `berita-content-writer`) pasti jadi kosong/mengarang.

5. Dari kandidat yang lolos filter DAN validasi 5W+1H, pilih yang paling:
   - Punya nilai berita jelas (bukan cuma tren pencarian random)
   - Elemen 5W+1H-nya paling lengkap/meyakinkan dibanding kandidat lain
6. Kalau **TIDAK ADA** kandidat yang lolos sama sekali (semua kena filter
   ATAU gagal validasi 5W+1H), balas dengan `"no_suitable_topic": true` dan
   field lain boleh kosong -- JANGAN memaksakan pilih topik yang tidak
   layak/tidak lengkap.

## Format output (WAJIB JSON, tanpa markdown code fence)

`context_5w1h` WAJIB diisi untuk kandidat yang kamu pilih -- ini bukti kamu
benar-benar melakukan validasi di langkah 4, bukan cuma klaim. Isi tiap
elemen singkat (1 frasa), atau `"tidak diketahui"` kalau memang tidak ada
elemen itu (maksimal 2 dari 6 boleh "tidak diketahui" -- lebih dari itu,
kandidat ini seharusnya sudah gagal di langkah 4).

```json
{
  "no_suitable_topic": false,
  "chosen_title": "Judul topik trending yang dipilih, salin persis dari daftar kandidat",
  "article_link": "URL artikel dari kandidat yang dipilih (kalau ada di daftar, kalau tidak ada isi null)",
  "context_5w1h": {
    "apa": "...",
    "siapa": "...",
    "kapan": "...",
    "dimana": "...",
    "mengapa": "...",
    "bagaimana": "..."
  },
  "reason_pick": "1 kalimat singkat kenapa topik ini dipilih dibanding kandidat lain"
}
```
