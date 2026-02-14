'use client';

import { useEffect, useRef } from 'react';

type LogoSize = 'sm' | 'md' | 'lg';

interface KwatchLogoProps {
  size?: LogoSize;
}

const sizeConfig = {
  sm: {
    symbol: 24,
    gap: 'gap-[7px]',
    title: 'text-[17px] tracking-[1.5px]',
    subtitle: 'text-[10.5px]',
    containerGap: 'gap-[3px]',
  },
  md: {
    symbol: 34,
    gap: 'gap-[10px]',
    title: 'text-[24px] tracking-[2px]',
    subtitle: 'text-[14px]',
    containerGap: 'gap-[5px]',
  },
  lg: {
    symbol: 44,
    gap: 'gap-[12px]',
    title: 'text-[30px] tracking-[3px]',
    subtitle: 'text-[17px]',
    containerGap: 'gap-[5px]',
  },
};

export function KwatchLogo({ size = 'md' }: KwatchLogoProps) {
  const row1Ref = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const cfg = sizeConfig[size];

  useEffect(() => {
    const alignRows = () => {
      const row1 = row1Ref.current;
      const sub = subtitleRef.current;
      if (!row1 || !sub) return;

      sub.style.letterSpacing = '0px';
      const row1W = row1.getBoundingClientRect().width;
      const subW0 = sub.getBoundingClientRect().width;
      const text = sub.textContent || '';
      const chars = text.length;

      if (chars > 1 && subW0 < row1W) {
        const extra = (row1W - subW0) / (chars - 1);
        sub.style.letterSpacing = `${extra.toFixed(2)}px`;
      }
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(alignRows);
    } else {
      alignRows();
    }

    window.addEventListener('resize', alignRows);
    return () => window.removeEventListener('resize', alignRows);
  }, []);

  return (
    <div className={`inline-flex flex-col ${cfg.containerGap} select-none`}>
      <div ref={row1Ref} className={`flex items-center ${cfg.gap}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/kdn-symbol.png"
          alt="KDN"
          className="object-contain flex-shrink-0"
          style={{ height: cfg.symbol, width: 'auto' }}
        />
        <div className={`font-orbitron font-[800] ${cfg.title} leading-none whitespace-nowrap`}>
          <span className="text-[#e63946]">K</span>
          <span className="text-[#f4a261]">-</span>
          <span className="text-white">WATCH</span>
        </div>
      </div>
      <div
        ref={subtitleRef}
        className={`font-sans ${cfg.subtitle} font-medium text-[#5a6a80] leading-none whitespace-nowrap text-center`}
        style={{ letterSpacing: '4px' }}
      >
        대국민 웹서비스 통합관제 시스템
      </div>
    </div>
  );
}
