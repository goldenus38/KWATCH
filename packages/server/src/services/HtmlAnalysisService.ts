import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { HtmlAnalysisResult } from '../types';
import { logger } from '../utils/logger';

/**
 * HTML 분석 서비스 (순수 계산, DB 접근 없음)
 * 웹페이지 HTML 구조 핑거프린팅 및 외부 도메인 감사를 수행합니다.
 */
export class HtmlAnalysisService {
  /**
   * HTML을 정규화합니다 (동적 영역 제거, 공백 정규화)
   */
  normalizeHtml(html: string, ignoreSelectors: string[] = []): string {
    const $ = cheerio.load(html);

    // 기본 동적 영역 제거
    const defaultRemoveSelectors = [
      // Google Analytics / Tag Manager
      'script[src*="google-analytics"]',
      'script[src*="googletagmanager"]',
      'script[src*="gtag"]',
      // 광고
      'ins.adsbygoogle',
      '[id*="ad-"]',
      '[class*="ad-banner"]',
      '[class*="advertisement"]',
      // CSRF 토큰
      'meta[name="csrf-token"]',
      'input[name="_token"]',
      'input[name="csrf"]',
      'input[name="_csrf"]',
      // 트래킹 픽셀
      'img[width="1"][height="1"]',
      'img[src*="pixel"]',
      'img[src*="beacon"]',
      // nonce 속성 제거
      'script[nonce]',
    ];

    // 기본 셀렉터 제거
    for (const selector of defaultRemoveSelectors) {
      $(selector).remove();
    }

    // 사이트별 커스텀 셀렉터 제거
    for (const selector of ignoreSelectors) {
      try {
        $(selector).remove();
      } catch {
        logger.warn(`Invalid CSS selector ignored: ${selector}`);
      }
    }

    // HTML 주석 제거
    $('*').contents().filter(function () {
      return this.type === 'comment';
    }).remove();

    // nonce, data-timestamp 등 동적 속성 제거
    $('[nonce]').removeAttr('nonce');
    $('[data-timestamp]').removeAttr('data-timestamp');
    $('[data-random]').removeAttr('data-random');

    // 공백 정규화
    return $.html().replace(/\s+/g, ' ').trim();
  }

  /**
   * HTML 구조 핑거프린트를 추출합니다 (태그명만 남긴 트리의 SHA-256)
   * 텍스트, 속성, 동적 콘텐츠가 변해도 구조가 같으면 동일한 해시
   */
  extractStructuralFingerprint(html: string): string {
    const $ = cheerio.load(html);

    const extractTagTree = (element: ReturnType<typeof $>): string => {
      const children = element.children().toArray();
      if (children.length === 0) {
        const tagName = element.prop('tagName') as string | undefined;
        return tagName ? `<${tagName.toLowerCase()}></${tagName.toLowerCase()}>` : '';
      }

      const tagName = element.prop('tagName') as string | undefined;
      if (!tagName) return '';

      const childTrees = children
        .map((child) => {
          const $child = $(child);
          if (child.type === 'tag') {
            return extractTagTree($child);
          }
          return '';
        })
        .filter(Boolean)
        .join('');

      return `<${tagName.toLowerCase()}>${childTrees}</${tagName.toLowerCase()}>`;
    };

    const $html = $('html');
    const tagTree = $html.length > 0 ? extractTagTree($html) : $.html() || '';

    return createHash('sha256').update(tagTree).digest('hex');
  }

  /**
   * HTML에서 외부 도메인 목록을 추출합니다
   * script src, iframe src, link href, form action, object data, embed src
   */
  extractCriticalDomains(html: string, siteUrl: string): string[] {
    const $ = cheerio.load(html);
    const domains = new Set<string>();

    let siteHostname: string;
    try {
      siteHostname = new URL(siteUrl).hostname;
    } catch {
      siteHostname = '';
    }

    const selectors = [
      { tag: 'script', attr: 'src' },
      { tag: 'iframe', attr: 'src' },
      { tag: 'link', attr: 'href' },
      { tag: 'form', attr: 'action' },
      { tag: 'object', attr: 'data' },
      { tag: 'embed', attr: 'src' },
    ];

    for (const { tag, attr } of selectors) {
      $(tag).each((_i, el) => {
        let value = $(el).attr(attr);
        if (!value) return;

        // 프로토콜 상대경로 처리
        if (value.startsWith('//')) {
          value = 'https:' + value;
        }

        // 상대경로는 자체 도메인이므로 무시
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return;
        }

        try {
          const url = new URL(value);
          const hostname = url.hostname;

          // 자체 도메인 제외
          if (hostname === siteHostname) return;

          // 빈 hostname 제외
          if (!hostname) return;

          domains.add(hostname);
        } catch {
          // 잘못된 URL 무시
        }
      });
    }

    return Array.from(domains).sort();
  }

  /**
   * 현재 HTML을 베이스라인과 비교합니다
   */
  compareWithBaseline(
    currentHtml: string,
    siteUrl: string,
    baseline: {
      structuralHash: string;
      domainWhitelist: string[];
    },
    ignoreSelectors: string[] = [],
  ): HtmlAnalysisResult {
    // 정규화
    const normalized = this.normalizeHtml(currentHtml, ignoreSelectors);

    // 구조 해시 비교
    const structuralHash = this.extractStructuralFingerprint(normalized);
    const structuralMatch = structuralHash === baseline.structuralHash;
    const structuralScore = structuralMatch ? 100 : 0;

    // 도메인 목록 비교
    const currentDomains = this.extractCriticalDomains(normalized, siteUrl);
    const baselineDomains = new Set(baseline.domainWhitelist);
    const currentDomainSet = new Set(currentDomains);

    const newDomains = currentDomains.filter((d) => !baselineDomains.has(d));
    const removedDomains = baseline.domainWhitelist.filter((d) => !currentDomainSet.has(d));

    // criticalElementsScore: 새 도메인당 -25점, 제거 도메인당 -5점
    let criticalElementsScore = 100;
    criticalElementsScore -= newDomains.length * 25;
    criticalElementsScore -= removedDomains.length * 5;
    criticalElementsScore = Math.max(0, Math.min(100, criticalElementsScore));

    return {
      structuralScore,
      criticalElementsScore,
      structuralHash,
      currentDomains,
      newDomains,
      removedDomains,
      structuralMatch,
    };
  }

  /**
   * 베이스라인 생성에 필요한 데이터를 추출합니다
   */
  createBaselineData(
    html: string,
    siteUrl: string,
    ignoreSelectors: string[] = [],
  ): {
    htmlHash: string;
    structuralHash: string;
    domainWhitelist: string[];
  } {
    const normalized = this.normalizeHtml(html, ignoreSelectors);
    const htmlHash = createHash('sha256').update(normalized).digest('hex');
    const structuralHash = this.extractStructuralFingerprint(normalized);
    const domainWhitelist = this.extractCriticalDomains(normalized, siteUrl);

    return { htmlHash, structuralHash, domainWhitelist };
  }
}

// 싱글턴 인스턴스 내보내기
export const htmlAnalysisService = new HtmlAnalysisService();
