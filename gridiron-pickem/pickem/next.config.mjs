/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.collegefootballdata.com' },
      { protocol: 'https', hostname: '**.espncdn.com' },
      { protocol: 'https', hostname: 'a.espncdn.com' },
    ],
  },
};

export default nextConfig;
