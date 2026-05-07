/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🔥 R1 (2026-05-07) — keep `pdfkit` external on the server so its
  // bundled Helvetica.afm fixture is loaded from real node_modules
  // instead of Turbopack's `/ROOT/node_modules/...` virtual path
  // (which fails with ENOENT). Same for `qrcode` for consistency.
  // bookPdf.js relies on the same package; this fixes both renderers.
  serverExternalPackages: ['pdfkit', 'qrcode'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com cdn.jsdelivr.net registry.npmjs.org unpkg.com https://unpkg.com https://*.public.blob.vercel-storage.com",
              "media-src 'self' blob:",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
              "font-src 'self' data:",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
