// fetch-og-image.js
// Ambil gambar resolusi tinggi untuk 1 topik berita:
//   1. Coba buka halaman artikel asli (articleLink), scrape meta og:image
//      (teknik standar semua situs berita buat kasih foto tajam ke preview
//      Facebook/Twitter/WhatsApp -- makanya resolusinya jauh lebih baik
//      daripada thumbnail RSS yang kecil & di-cache Google).
//   2. Kalau gagal (halaman gak bisa diakses, gak ada og:image, dst),
//      fallback ke thumbnailUrl dari RSS (biasanya encrypted-tbn...
//      gstatic.com -- resolusi rendah tapi mendingan daripada tidak ada).
//
// Requirement: Node.js >= 18 (pakai global fetch)

const fs = require('fs');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Cari <meta property="og:image" content="..."> (atau name="og:image",
// beberapa situs pakai variasi urutan attribute / og:image:secure_url).
function extractOgImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      try {
        // Resolve relative URL kalau ada (jarang, tapi jaga-jaga)
        return new URL(m[1], pageUrl).toString();
      } catch {
        return m[1];
      }
    }
  }
  return null;
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// PENTING: ini yang memperbaiki bug "AI salah tanggal kejadian". Kita
// SUDAH punya HTML halaman artikel di tangan (buat cari og:image) --
// daripada dibuang, kita ekstrak juga tanggal publikasi resmi (metadata
// standar `article:published_time`, dipasang situs berita sendiri) dan
// deskripsi singkat artikelnya. Data ini JAUH lebih bisa dipercaya
// daripada AI menebak dari judul doang -- soalnya ini fakta langsung dari
// halaman sumbernya, bukan hasil reka-reka model.
function extractArticleMeta(html) {
  const publishedTimePatterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+name=["']publish-date["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
  ];
  const descriptionPatterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ];

  let publishedTime = null;
  for (const re of publishedTimePatterns) {
    const m = html.match(re);
    if (m && m[1]) { publishedTime = m[1]; break; }
  }

  let description = null;
  for (const re of descriptionPatterns) {
    const m = html.match(re);
    if (m && m[1]) { description = decodeHtmlEntities(m[1]); break; }
  }

  return { publishedTime, description };
}

async function downloadImage(url, outputPath, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} waktu download gambar`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`URL bukan gambar (content-type: ${contentType})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {Object} params
 * @param {string|null} params.articleLink - link artikel asli (dari topic-generator)
 * @param {string|null} params.fallbackThumbnailUrl - thumbnail RSS sebagai cadangan
 * @param {string} params.outputPath
 * @returns {Promise<{outputPath: string, source: 'og:image'|'rss-thumbnail', articleMeta: {publishedTime: string|null, description: string|null}}>}
 */
async function fetchNewsImage({ articleLink, fallbackThumbnailUrl, outputPath }) {
  if (articleLink) {
    try {
      const html = await fetchText(articleLink);
      const articleMeta = extractArticleMeta(html);
      const ogImageUrl = extractOgImage(html, articleLink);
      if (ogImageUrl) {
        await downloadImage(ogImageUrl, outputPath);
        return { outputPath, source: 'og:image', articleMeta };
      }
      // og:image tidak ketemu, tapi articleMeta mungkin tetap ketemu --
      // lanjut ke fallback gambar TAPI tetap bawa articleMeta yang sudah didapat.
      if (fallbackThumbnailUrl) {
        await downloadImage(fallbackThumbnailUrl, outputPath);
        return { outputPath, source: 'rss-thumbnail', articleMeta };
      }
    } catch (err) {
      // Sengaja tidak throw di sini -- lanjut ke fallback thumbnail RSS.
      // Tetap catat pesan errornya biar kelihatan di log pemanggil.
      console.warn('[fetch-og-image] Gagal ambil og:image/metadata dari artikel:', err.message);
    }
  }

  if (fallbackThumbnailUrl) {
    await downloadImage(fallbackThumbnailUrl, outputPath);
    return { outputPath, source: 'rss-thumbnail', articleMeta: { publishedTime: null, description: null } };
  }

  throw new Error('Tidak ada og:image maupun thumbnail RSS yang bisa dipakai untuk topik ini.');
}

module.exports = { fetchNewsImage };
