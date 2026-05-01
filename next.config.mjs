/** @type {import('next').NextConfig} */
const nextConfig = {
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
