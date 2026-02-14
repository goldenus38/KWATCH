import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { HtmlAnalysisResult } from '../types';
import { logger } from '../utils/logger';

/**
 * 신뢰할 수 있는 외부 도메인 목록
 * 이 도메인(및 서브도메인)은 새로 감지되어도 위변조 경고를 발생시키지 않습니다.
 * 공공기관 사이트에서 자주 사용되는 CDN, 분석, 소셜미디어 등의 공식 서비스.
 * 환경변수 TRUSTED_DOMAINS로 추가 도메인을 쉼표 구분으로 설정 가능.
 */
const TRUSTED_DOMAIN_SUFFIXES: string[] = [
  // 검색/포털
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'doubleclick.net',
  'naver.com',
  'naver.net',
  'navercorp.com',
  'pstatic.net',
  'daum.net',
  'daumcdn.net',
  'kakao.com',
  'kakaocdn.net',

  // 소셜미디어
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'facebook.com',
  'fbcdn.net',
  'instagram.com',
  'twitter.com',
  'x.com',
  'twimg.com',

  // CDN
  'cloudflare.com',
  'cdnjs.cloudflare.com',
  'jsdelivr.net',
  'unpkg.com',
  'bootstrapcdn.com',
  'jquery.com',
  'akamaized.net',
  'akamai.net',
  'fastly.net',
  'cloudfront.net',

  // 한국 공공/정부
  'go.kr',
  'or.kr',
  'ne.kr',

  // 분석/마케팅
  'hotjar.com',
  'clarity.ms',
  'microsoft.com',
  'msecnd.net',
  'bing.com',
  'adobe.com',
  'typekit.net',
  'fontawesome.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',

  // 기타 인프라
  'amazonaws.com',
  'azurewebsites.net',
  'github.io',
  'gitlab.io',
  'wp.com',
  'wordpress.com',
  'gravatar.com',
  'recaptcha.net',
];

/**
 * 도메인이 신뢰 목록에 포함되는지 확인합니다.
 * 정확히 일치하거나 서브도메인인 경우 true 반환.
 * 예: "cdn.naver.com"은 "naver.com" 신뢰 도메인에 매치
 */
function isTrustedDomain(hostname: string, trustedSuffixes: string[]): boolean {
  const lower = hostname.toLowerCase();
  for (const suffix of trustedSuffixes) {
    if (lower === suffix || lower.endsWith('.' + suffix)) {
      return true;
    }
  }
  return false;
}

/**
 * HTML 분석 서비스 (순수 계산, DB 접근 없음)
 * 웹페이지 HTML 구조 핑거프린팅 및 외부 도메인 감사를 수행합니다.
 */
export class HtmlAnalysisService {
  private trustedDomains: string[];

  constructor() {
    // 환경변수로 추가 신뢰 도메인 설정 가능
    const envDomains = process.env.TRUSTED_DOMAINS
      ? process.env.TRUSTED_DOMAINS.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
      : [];
    this.trustedDomains = [...TRUSTED_DOMAIN_SUFFIXES, ...envDomains];
  }
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
      // 동적 DOM 요소 (매 로드마다 구조가 달라짐)
      'table',
      'svg',
      'canvas',
      '[role="grid"]',
      '[role="table"]',
      '[class*="chart"]',
      '[class*="graph"]',
      '[class*="slider"]',
      '[class*="carousel"]',
      '[class*="swiper"]',
      '[class*="ticker"]',
      '[class*="marquee"]',
      'ul.pagination',
      'nav.pagination',
      '[class*="paging"]',
      '[class*="tab-content"]',
      '[class*="tabpanel"]',
      'select',
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
   * DOM을 순회하여 루트→리프 태그 경로 배열을 추출합니다
   * 예: ["html>body>div>h1", "html>body>div>p", ...]
   */
  extractTagPaths(html: string): string[] {
    const $ = cheerio.load(html);
    const paths: string[] = [];

    const traverse = (element: ReturnType<typeof $>, parentPath: string) => {
      const children = element.children().toArray();
      const tagChildren = children.filter((child) => child.type === 'tag');

      if (tagChildren.length === 0) {
        // 리프 노드: 경로 추가
        if (parentPath) {
          paths.push(parentPath);
        }
        return;
      }

      for (const child of tagChildren) {
        const $child = $(child);
        const tagName = (child as any).tagName?.toLowerCase() as string | undefined;
        if (!tagName) continue;
        const childPath = parentPath ? `${parentPath}>${tagName}` : tagName;
        traverse($child, childPath);
      }
    };

    const $html = $('html');
    if ($html.length > 0) {
      traverse($html, 'html');
    }

    return paths;
  }

  /**
   * 멀티셋 Jaccard 유사도를 계산합니다
   * |intersection| / |union| × 100
   */
  computeStructuralSimilarity(currentPaths: string[], baselinePaths: string[]): number {
    if (currentPaths.length === 0 && baselinePaths.length === 0) return 100;
    if (currentPaths.length === 0 || baselinePaths.length === 0) return 0;

    // 멀티셋 카운트
    const countMap = (arr: string[]): Map<string, number> => {
      const map = new Map<string, number>();
      for (const item of arr) {
        map.set(item, (map.get(item) || 0) + 1);
      }
      return map;
    };

    const currentCounts = countMap(currentPaths);
    const baselineCounts = countMap(baselinePaths);

    // 모든 고유 키
    const allKeys = new Set([...currentCounts.keys(), ...baselineCounts.keys()]);

    let intersectionSize = 0;
    let unionSize = 0;

    for (const key of allKeys) {
      const cCount = currentCounts.get(key) || 0;
      const bCount = baselineCounts.get(key) || 0;
      intersectionSize += Math.min(cCount, bCount);
      unionSize += Math.max(cCount, bCount);
    }

    if (unionSize === 0) return 100;
    return (intersectionSize / unionSize) * 100;
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
      structuralPaths?: string[] | null;
    },
    ignoreSelectors: string[] = [],
  ): HtmlAnalysisResult {
    // 정규화
    const normalized = this.normalizeHtml(currentHtml, ignoreSelectors);

    // 구조 해시 비교
    const structuralHash = this.extractStructuralFingerprint(normalized);
    const structuralMatch = structuralHash === baseline.structuralHash;

    // 점진적 구조 점수: structuralPaths가 있으면 Jaccard 유사도, 없으면 바이너리
    let structuralScore: number;
    if (structuralMatch) {
      structuralScore = 100;
    } else if (baseline.structuralPaths && baseline.structuralPaths.length > 0) {
      const currentPaths = this.extractTagPaths(normalized);
      structuralScore = this.computeStructuralSimilarity(currentPaths, baseline.structuralPaths);
    } else {
      structuralScore = 0;
    }

    // 도메인 목록 비교
    const currentDomains = this.extractCriticalDomains(normalized, siteUrl);
    const baselineDomains = new Set(baseline.domainWhitelist);
    const currentDomainSet = new Set(currentDomains);

    // 신뢰 도메인은 새 도메인 경고에서 제외 (naver.com, youtube.com 등)
    const newDomains = currentDomains.filter(
      (d) => !baselineDomains.has(d) && !isTrustedDomain(d, this.trustedDomains),
    );
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
    structuralPaths: string[];
    domainWhitelist: string[];
  } {
    const normalized = this.normalizeHtml(html, ignoreSelectors);
    const htmlHash = createHash('sha256').update(normalized).digest('hex');
    const structuralHash = this.extractStructuralFingerprint(normalized);
    const structuralPaths = this.extractTagPaths(normalized);
    const domainWhitelist = this.extractCriticalDomains(normalized, siteUrl);

    return { htmlHash, structuralHash, structuralPaths, domainWhitelist };
  }
}

// 싱글턴 인스턴스 내보내기
export const htmlAnalysisService = new HtmlAnalysisService();
