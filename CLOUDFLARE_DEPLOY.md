# Panduan Hosting LayarMini di Cloudflare Pages

Aplikasi **LayarMini** dikonfigurasi untuk **Cloudflare Pages + Pages Functions** tanpa `wrangler.jsonc` agar seluruh **Environment Variables & Secrets** bisa dikelola langsung dari Cloudflare Pages Dashboard (tanpa terkunci atau tertimpa Wrangler).

- **Frontend SPA React + Vite (`dist`)** dengan fallback otomatis untuk rute `/admin` dan aset poster `/src/assets/images/*`.
- **Backend API Doodstream (`functions/api/[[path]].ts`)** yang otomatis dideteksi & dikompilasi Cloudflare Pages untuk seluruh rute `/api/doodstream/*`.
- **Header Cache Edge (`public/_headers`)** untuk performa pemuatan aset statis.

---

## Opsi 1: Deploy Otomatis via GitHub (Cloudflare Pages Dashboard)

1. Push repositori proyek ini ke **GitHub** (pastikan `wrangler.jsonc` sudah tidak ada di repo dan folder `functions/` ikut ter-push).
2. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git**.
3. Pilih repositori proyek Anda, lalu isi pengaturan build:
   - **Production branch**: `main`
   - **Framework preset**: `None` *(atau `Vite`)*
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: *(biarkan kosong)*
4. Klik **Save and Deploy**.

---

## Mengaktifkan Server Upload Doodstream (`DOODSTREAM_API_KEY`)

1. Buka proyek Pages Anda di Cloudflare Dashboard → tab **Settings** → **Variables and Secrets** (atau **Environment variables**).
2. Klik **Add** pada **Production** *(dan tambahkan juga di **Preview** jika Anda mengakses link preview branch)*:
   - **Type**: **Secret** *(atau Plaintext — keduanya kini didukung karena tidak ada `wrangler.jsonc` yang menimpa)*
   - **Variable name**: `DOODSTREAM_API_KEY` *(wajib huruf kapital persis)*
   - **Value**: API Key dari akun Doodstream Anda *(tanpa tanda kutip)*
3. Klik **Save**.
4. **Wajib Redeploy**: Buka tab **Deployments** → klik menu titik tiga (`...`) pada deployment terakhir → pilih **Retry deployment** *(Cloudflare Pages baru memuat variabel/secret baru pada deployment berikutnya)*.
5. Verifikasi dengan membuka:
   `https://<domain-anda>.pages.dev/api/doodstream/status`
   Jika berhasil, akan tampil:
   ```json
   {"configured":true,"provider":"Doodstream"}
   ```

---

## Uji Lokal dengan Runtime Cloudflare Pages

```bash
cp .dev.vars.example .dev.vars
# Isi DOODSTREAM_API_KEY di dalam .dev.vars
npm run cf:dev
```
