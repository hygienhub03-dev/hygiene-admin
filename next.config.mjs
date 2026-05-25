import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      'tailwindcss': resolve(__dirname, 'node_modules/tailwindcss/index.css'),
      'tw-animate-css': resolve(__dirname, 'node_modules/tw-animate-css/dist/tw-animate.css'),
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live https://*.vercel.live",
              "script-src-elem 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live https://*.vercel.live",
              "connect-src 'self' https://gzghcomsyuiwxqcouyuo.supabase.co https://vercel.live https://*.vercel.live wss://vercel.live wss://*.vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.live https://*.vercel.live",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com https://vercel.live https://*.vercel.live",
              "frame-src 'self' https://vercel.live https://*.vercel.live",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
}

export default nextConfig
