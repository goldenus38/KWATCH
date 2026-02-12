/** @type {import('next').NextConfig} */
const nextConfig = {
  // API 프록시 설정
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },

  // 이미지 최적화 설정
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/api/screenshots/**',
      },
    ],
  },

  // 실험적 기능
  experimental: {
    // 서버 액션 활성화
  },
};

module.exports = nextConfig;
