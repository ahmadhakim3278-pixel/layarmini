# Panduan Hosting LayarMini di Cloudflare Pages

Aplikasi **LayarMini** dikonfigurasi untuk **Cloudflare Pages + Pages Functions**, mencakup:

- **Frontend SPA React + Vite (`dist`)** dengan fallback otomatis untuk rute `/admin` dan aset poster `/src/assets/images/*`.
- **Backend API Doodstream (`functions/api/[[path]].ts`)** yang otomatis aktif untuk semua rute `/api/doodstream/*`.
- **Header Cache Edge (`public/_headers`)** untuk performa pemuatan aset statis.

---

## Opsi 1: Deploy Otomatis via GitHub (Cloudflare Pages Dashboard — Disarankan)

1. Push repositori proyek ini ke **GitHub** (atau GitLab).
2. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git**.
3. Pilih repositori proyek Anda, lalu isi pengaturan build berikut:
   - **Production branch**: `main`
   - **Framework preset**: `None` *(atau `Vite`)*
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: *(biarkan kosong / default)*
4. *(Opsional — bisa diisi sekarang atau setelah deploy)* Buka bagian **Environment variables** → tambahkan:
   - **Variable name**: `DOODSTREAM_API_KEY`
   - **Value**: API Key dari akun Doodstream Anda *(centang/pilih Encrypt/Secret)*
5. Klik **Save and Deploy**. Cloudflare otomatis mem-build Vite ke `dist` dan mengompilasi Pages Functions di folder `functions/`.

> Jika Anda baru menambahkan `DOODSTREAM_API_KEY` **setelah** deploy pertama (lewat **Settings → Variables and Secrets**), lakukan **Retry deployment** pada deployment terakhir (atau push commit baru) agar secret aktif di produksi Pages.

---

## Opsi 2: Deploy Langsung via Terminal (Wrangler CLI)

```bash
# 1. Pasang dependensi
npm install

# 2. Login ke akun Cloudflare Anda
npx wrangler login

# 3. Build Vite + deploy situs & Pages Functions ke Cloudflare Pages
npm run cf:deploy

# 4. (Opsional) Simpan API key Doodstream sebagai secret produksi
npx wrangler pages secret put DOODSTREAM_API_KEY --project-name=layarmini
```

Setelah selesai, situs Anda aktif di:
`https://layarmini.pages.dev` (panel admin di `https://layarmini.pages.dev/admin`).

---

## Uji Lokal dengan Runtime Cloudflare Pages

```bash
cp .dev.vars.example .dev.vars
# Isi DOODSTREAM_API_KEY di dalam .dev.vars jika ingin menguji upload Doodstream
npm run cf:dev
```

---

## Menambahkan Custom Domain

1. Di Cloudflare Dashboard, buka proyek Pages **layarmini**.
2. Masuk ke tab **Custom domains** → klik **Set up a custom domain**.
3. Masukkan domain/subdomain Anda (misalnya `nonton.domainanda.com`) → ikuti konfirmasi DNS. SSL HTTPS aktif otomatis.

---

## Catatan Teknis Cloudflare Pages

- **Batas Upload Langsung (Free Plan)**: Cloudflare membatasi ukuran body HTTP hingga 100 MB. Handler Pages Functions membatasi unggah berkas langsung di **95 MB**; untuk video lebih besar gunakan tab **Remote Upload (URL)** atau **Link Embed Doodstream** di halaman `/admin`.
- **Normalisasi Link Doodstream**: Link mirror lama yang sudah tidak aktif (seperti `dsvplay.com`) otomatis dinormalisasi ke `https://dood.to/e/<filecode>` agar selalu mengarah ke player aktif Doodstream.
