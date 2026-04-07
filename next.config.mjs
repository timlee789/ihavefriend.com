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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com cdn.jsdelivr.net",
              "media-src 'self' blob:",
              "img-src 'self' data: blob:",
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
