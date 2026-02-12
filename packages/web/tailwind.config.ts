import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // KWATCH Dark Theme 색상 체계
        kwatch: {
          // 배경
          'bg-primary': '#0F172A',
          'bg-secondary': '#1E293B',
          'bg-tertiary': '#334155',

          // 텍스트
          'text-primary': '#F1F5F9',
          'text-secondary': '#94A3B8',
          'text-muted': '#64748B',

          // 상태 색상
          'status-normal': '#00C853',
          'status-warning': '#FFB300',
          'status-critical': '#FF1744',
          'status-checking': '#42A5F5',
          'status-unknown': '#78909C',

          // 강조
          'accent': '#3B82F6',
          'accent-hover': '#2563EB',
        },
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // 전광판 가독성을 위한 최소 폰트 사이즈
        'dashboard-sm': ['14px', { lineHeight: '20px' }],
        'dashboard-base': ['16px', { lineHeight: '24px' }],
        'dashboard-lg': ['20px', { lineHeight: '28px' }],
        'dashboard-xl': ['24px', { lineHeight: '32px' }],
        'dashboard-2xl': ['32px', { lineHeight: '40px' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(255, 23, 68, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(255, 23, 68, 0.8)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      boxShadow: {
        'status-warning': '0 0 10px rgba(255, 179, 0, 0.3)',
        'status-critical': '0 0 15px rgba(255, 23, 68, 0.4)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
};

export default config;
