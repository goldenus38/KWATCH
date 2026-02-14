import path from 'path';
import fs from 'fs/promises';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import sharp from 'sharp';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ScreenshotResult } from '../types';

/**
 * 스크린샷 품질 판정 최소 파일 크기 (bytes)
 * 1920x1080 뷰포트에서 빈 흰 페이지 ~8-15KB, 정상 페이지 50KB+
 */
const MIN_VALID_SCREENSHOT_BYTES = 30_000;

/**
 * 재시도 전략 (순서대로 시도)
 * 1차: 추가 대기 후 재촬영 (SPA 렌더링 미완료 대응)
 * 2차: networkidle 모드로 페이지 리로드 (느린 SPA 대응)
 */
const RETRY_STRATEGIES = [
  { label: 'extra-wait', extraWaitMs: 3000 },
  { label: 'networkidle-reload', waitUntil: 'networkidle' as const, extraWaitMs: 2000 },
] as const;

/**
 * Playwright를 이용한 웹사이트 스크린샷 캡처 서비스
 * 1920x1080 해상도로 메인페이지 스크린샷을 캡처하고 썸네일을 생성합니다.
 */
export class ScreenshotService {
  private prisma = getDbClient();
  private browser: Browser | null = null;
  private readonly screenshotDir = config.screenshot.dir;
  private readonly currentDir = path.join(this.screenshotDir, 'current');
  private readonly thumbnailDir = path.join(this.screenshotDir, 'thumbnails');
  private readonly baselineDir = path.join(this.screenshotDir, 'baselines');

  constructor() {
    // TODO: 스크린샷 디렉토리 초기화
  }

  /**
   * Playwright 브라우저 인스턴스를 초기화합니다 (lazy initialization)
   */
  private async initBrowser(): Promise<Browser> {
    // TODO: 이미 초기화되었으면 기존 브라우저 반환
    // TODO: Chromium 브라우저 실행
    // TODO: 메모리 누수 방지를 위한 이벤트 리스너 설정
    // TODO: 연결 끊김 시 자동 재연결 로직 구현

    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--disable-dev-shm-usage', // Shared memory 사용 비활성화 (메모리 절약)
          '--no-sandbox', // Docker 환경 대응
          '--disable-gpu',
        ],
      });
      logger.info('Playwright browser initialized');
    }

    return this.browser;
  }

  /**
   * 단일 웹사이트의 스크린샷을 캡처합니다
   * @param websiteId 웹사이트 ID
   * @param url 웹사이트 URL
   * @returns ScreenshotResult {filePath, fileSize}
   */
  async captureScreenshot(websiteId: number, url: string): Promise<ScreenshotResult> {
    // TODO: URL 유효성 검증
    // TODO: 디렉토리 존재 확인 및 생성
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // TODO: 타임아웃 설정 (30초 기본)
      browser = await this.initBrowser();

      // TODO: 스크린샷 디렉토리 생성
      await fs.mkdir(this.currentDir, { recursive: true });

      // TODO: 새 페이지 컨텍스트 생성 (SSL 인증서 오류 무시)
      context = await browser.newContext({ ignoreHTTPSErrors: true });
      page = await context.newPage();

      // JS alert/confirm/prompt 자동 dismiss (페이지 로드 전에 등록)
      page.on('dialog', async (dialog) => {
        logger.debug(`Auto-dismissed ${dialog.type()} dialog for website ${websiteId}: ${dialog.message().slice(0, 100)}`);
        await dialog.dismiss();
      });

      // TODO: 뷰포트 설정 (1920x1080)
      await page.setViewportSize({
        width: config.screenshot.viewportWidth,
        height: config.screenshot.viewportHeight,
      });

      // TODO: 타임아웃 설정
      page.setDefaultTimeout(config.screenshot.timeout);

      // window.open 팝업 차단 (네비게이션 전에 주입)
      await page.addInitScript('window.open = () => null;');

      // 1차 시도: load 이벤트 대기 + 1초 렌더링 대기
      await page.goto(url, { waitUntil: 'load', timeout: config.screenshot.timeout });
      await page.waitForTimeout(1000);
      await this.dismissPopups(page, websiteId);

      let buffer = await page.screenshot({ fullPage: false });

      // 품질 검사 → 불량이면 재시도
      for (const strategy of RETRY_STRATEGIES) {
        if (buffer.length >= MIN_VALID_SCREENSHOT_BYTES) break;

        logger.warn(
          `[ScreenshotRetry] Website ${websiteId}: ${buffer.length} bytes < ${MIN_VALID_SCREENSHOT_BYTES} bytes, ` +
            `retrying with strategy "${strategy.label}"`,
        );

        try {
          if ('waitUntil' in strategy) {
            // 페이지 리로드 (다른 waitUntil 전략)
            await page.reload({ waitUntil: strategy.waitUntil, timeout: config.screenshot.timeout });
          }

          await page.waitForTimeout(strategy.extraWaitMs);
          await this.dismissPopups(page, websiteId);
          const retryBuffer = await page.screenshot({ fullPage: false });

          // 재시도 결과가 더 좋으면 채택
          if (retryBuffer.length > buffer.length) {
            buffer = retryBuffer;
            logger.info(
              `[ScreenshotRetry] Website ${websiteId}: strategy "${strategy.label}" improved to ${retryBuffer.length} bytes`,
            );
          }
        } catch (retryError) {
          logger.warn(`[ScreenshotRetry] Website ${websiteId}: strategy "${strategy.label}" failed:`, retryError);
        }
      }

      const timestamp = Date.now();
      const filename = `${websiteId}_${timestamp}.png`;
      const filepath = path.join(this.currentDir, filename);

      // HTML 콘텐츠 캡처
      let htmlContent: string | undefined;
      try {
        htmlContent = await page.content();
      } catch (e) {
        logger.warn(`HTML capture failed for website ${websiteId}`);
      }

      // 최종 품질 검사: 재시도 후에도 불량이면 저장하지 않고 에러
      if (buffer.length < MIN_VALID_SCREENSHOT_BYTES) {
        logger.warn(
          `[ScreenshotQuality] Website ${websiteId}: final screenshot ${buffer.length} bytes ` +
            `< ${MIN_VALID_SCREENSHOT_BYTES} bytes after all retries, discarding`,
        );
        throw new Error(
          `Screenshot quality too low for website ${websiteId}: ${buffer.length} bytes (blank page or SPA not rendered)`,
        );
      }

      await fs.writeFile(filepath, buffer);

      // 썸네일 생성 (200x112, 16:9 비율)
      await this.generateThumbnail(filepath, websiteId, timestamp);

      // 데이터베이스에 Screenshot 레코드 저장
      const dbRecord = await this.prisma.screenshot.create({
        data: {
          websiteId,
          filePath: filepath,
          fileSize: buffer.length,
        },
      });

      logger.info(`Screenshot captured for website ${websiteId}: ${filepath} (${buffer.length} bytes)`);

      return {
        filePath: filepath,
        fileSize: buffer.length,
        htmlContent,
      };
    } catch (error) {
      logger.error(`captureScreenshot failed for website ${websiteId}:`, error);
      throw error;
    } finally {
      // TODO: 페이지/컨텍스트 닫기 (메모리 누수 방지)
      if (page) {
        await page.close();
      }
      if (context) {
        await context.close();
      }
      // TODO: 브라우저는 유지 (여러 웹사이트 체크에 재사용)
    }
  }

  /**
   * 한국 공공기관 사이트의 레이어 팝업을 제거합니다
   * - 고정 위치 오버레이 (position: fixed + 높은 z-index)
   * - "오늘 하루 안 보기", "닫기" 버튼 자동 클릭
   * - 팝업 딤(dim) 배경 레이어 제거
   */
  private async dismissPopups(page: Page, websiteId: number): Promise<void> {
    try {
      /* eslint-disable no-eval */
      // page.evaluate 내부는 브라우저 컨텍스트에서 실행됨 (DOM API 사용)
      // 문자열로 전달하여 Node.js TS 컴파일러의 DOM 타입 오류 방지
      const removedCount = await page.evaluate(`(() => {
        let removed = 0;

        // 1단계: CSS 셀렉터로 닫기 버튼 클릭 (텍스트 없는 아이콘 버튼 대응)
        const closeSelectors = [
          '.pop-close', '.popup-close', '.pop_close',
          '.btn-close', '.btn_close', '.btnClose',
          '.close-btn', '.close_btn', '.closeBtn',
          '.modal-close', '.modal_close', '.modalClose',
          '.layer-close', '.layer_close', '.layerClose',
          '.pop-today-close', '.popup-today-close',
          '[class*="pop"][class*="close"]',
          '[class*="layer"][class*="close"]',
          '[class*="modal"][class*="close"]',
        ];
        for (const selector of closeSelectors) {
          try {
            const els = document.querySelectorAll(selector);
            for (const el of els) {
              el.click(); removed++;
            }
          } catch(e) {}
        }

        // 2단계: 텍스트 패턴으로 팝업 닫기 버튼 클릭
        const closePatterns = [
          '오늘 하루 안 보기',
          '오늘 하루 보지 않기',
          '오늘하루보지않기',
          '오늘 하루 보지않기',
          '오늘 하루 열지 않기',
          '오늘하루열지않기',
          '하루동안 보지 않기',
          '하루 동안 보지 않기',
          '하루동안 열지 않기',
          '오늘 그만 보기',
          '다시 보지 않기',
          '7일간 보지 않기',
          '일주일간 보지 않기',
          '팝업 닫기',
          '팝업닫기',
          '창 닫기',
          '창닫기',
          '닫기',
          'CLOSE',
          'Close',
          'close',
          // SNS/글로벌 사이트 로그인 팝업 패턴
          'Not now',
          'Not Now',
          'No thanks',
          'No Thanks',
          'Maybe later',
          'Maybe Later',
          'Dismiss',
          'dismiss',
          'Skip',
          'Accept All',
          'Accept all',
          'Accept Cookies',
          'Accept cookies',
          'Allow All',
          'Allow all',
          'Decline',
          'Reject All',
          'Reject all',
          'Got it',
          'I agree',
          'Continue browsing',
        ];

        const allClickables = document.querySelectorAll('a, button, input[type="button"], input[type="submit"], span, div, label');
        for (const el of allClickables) {
          const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
          const value = el.value || '';
          const matchText = text + ' ' + value;

          for (const pattern of closePatterns) {
            if (matchText.includes(pattern)) {
              try { el.click(); removed++; } catch(e) {}
              break;
            }
          }
        }

        // 3단계: jQuery .show 클래스 기반 팝업 숨기기
        const showPopupSelectors = [
          '.top-layer-pop.show', '.layer-pop.show', '.popup-layer.show',
          '.pop-wrap.show', '.popup-wrap.show', '.layer-wrap.show',
          '.modal-popup.show', '.event-popup.show',
          '[class*="pop"][class*="layer"].show',
          '[class*="layer"][class*="pop"].show',
          '[class*="popup"].show',
        ];
        for (const selector of showPopupSelectors) {
          try {
            const els = document.querySelectorAll(selector);
            for (const el of els) {
              el.classList.remove('show');
              el.style.display = 'none';
              removed++;
            }
          } catch(e) {}
        }

        // 4단계: SNS 사이트 로그인 월/모달 제거 (Instagram, Facebook 등)
        const snsModalSelectors = [
          // Instagram 로그인 모달
          '[role="dialog"]',
          '[role="presentation"]',
          // Facebook 로그인 레이어
          '[data-testid="cookie-policy-manage-dialog"]',
          '[data-testid="cookie-policy-dialog"]',
          '#login_popup',
          // YouTube 쿠키/로그인 팝업
          'ytd-consent-bump-v2-lightbox',
          'tp-yt-paper-dialog',
          // 공통 쿠키 동의 배너
          '#cookie-banner', '#cookie-consent', '#cookieConsent',
          '.cookie-banner', '.cookie-consent', '.cookieConsent',
          '#onetrust-banner-sdk', '#onetrust-consent-sdk',
          '.cc-banner', '.cc-window',
          '#gdpr-banner', '.gdpr-banner',
        ];
        for (const selector of snsModalSelectors) {
          try {
            const els = document.querySelectorAll(selector);
            for (const el of els) {
              try {
                if (!el.parentNode) continue;
                const style = window.getComputedStyle(el);
                if (!style) continue;
                const zIndex = parseInt(style.zIndex) || 0;
                const tag = el.tagName.toLowerCase();
                // dialog/modal 역할의 오버레이만 제거 (본문 컨텐츠 제외)
                if (zIndex >= 1 || style.position === 'fixed' || style.position === 'absolute') {
                  if (!['body','html','header','nav','main','footer','section','article'].includes(tag)) {
                    el.remove(); removed++;
                  }
                }
              } catch(e2) {}
            }
          } catch(e) {}
        }

        // 6단계: 고정 위치 오버레이 요소 제거
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          try {
            if (!el.parentNode) continue;
            const style = window.getComputedStyle(el);
            if (!style) continue;
            const position = style.position;
            const zIndex = parseInt(style.zIndex) || 0;
            const rect = el.getBoundingClientRect();

            const isOverlay = (position === 'fixed' || position === 'absolute') && zIndex >= 900;
            const coversScreen = rect.width > window.innerWidth * 0.3 && rect.height > window.innerHeight * 0.3;
            const isDim = (style.backgroundColor.includes('rgba') && parseFloat(style.opacity || '1') < 1) ||
              (style.backgroundColor.includes('rgb(0, 0, 0)') && parseFloat(style.opacity || '1') < 0.8);

            // 딤(dim) 배경 레이어 제거
            if (isOverlay && coversScreen && isDim) {
              el.remove(); removed++; continue;
            }

            // 팝업 레이어 제거
            if (isOverlay && coversScreen) {
              const tag = el.tagName.toLowerCase();
              if (['body','html','header','nav','main','footer'].includes(tag)) continue;

              const idClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
              const popupKeywords = ['popup','pop-up','pop_up','layer','modal','notice','banner',
                'overlay','dim','mask','lightbox','alert-box','float-','floating','tpop'];
              if (popupKeywords.some(kw => idClass.includes(kw))) {
                el.remove(); removed++;
              }
            }
          } catch(e) {}
        }

        // 7단계: body 스크롤 잠금 해제 (inline style + CSS 클래스)
        document.body.style.overflow = '';
        document.body.style.overflowY = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.overflowY = '';
        const scrollLockClasses = ['fixed','no-scroll','no_scroll','noScroll',
          'overflow-hidden','overflow_hidden','scroll-lock','scroll_lock','modal-open','popup-open'];
        for (const cls of scrollLockClasses) {
          document.body.classList.remove(cls);
          document.documentElement.classList.remove(cls);
        }

        return removed;
      })()`) as number;

      if (removedCount > 0) {
        logger.info(`[PopupDismiss] Removed ${removedCount} popup elements for website ${websiteId}`);
      }
    } catch (error) {
      // 팝업 제거 실패는 경고만 — 스크린샷 캡처를 중단하지 않음
      logger.warn(`[PopupDismiss] Failed for website ${websiteId}:`, error);
    }
  }

  /**
   * 스크린샷에서 썸네일을 생성합니다 (200x112, 16:9 비율)
   * @param imagePath 원본 이미지 경로
   * @param websiteId 웹사이트 ID
   * @param timestamp 타임스탬프
   */
  private async generateThumbnail(imagePath: string, websiteId: number, timestamp: number): Promise<void> {
    // TODO: 썸네일 디렉토리 생성
    // TODO: sharp를 이용한 이미지 리사이징 (200x112)
    // TODO: 썸네일 파일명: {websiteId}_{timestamp}_thumb.png
    // TODO: 썸네일 저장

    try {
      await fs.mkdir(this.thumbnailDir, { recursive: true });

      const thumbFilename = `${websiteId}_${timestamp}_thumb.jpg`;
      const thumbPath = path.join(this.thumbnailDir, thumbFilename);

      await sharp(imagePath)
        .resize(400, 225, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);

      logger.debug(`Thumbnail generated for website ${websiteId}: ${thumbPath}`);
    } catch (error) {
      logger.warn(`Thumbnail generation failed for website ${websiteId}:`, error);
      // 썸네일 생성 실패는 경고만 하고 진행
    }
  }

  /**
   * 특정 웹사이트의 최신 스크린샷을 조회합니다
   * @param websiteId 웹사이트 ID
   * @returns 스크린샷 정보
   */
  async getLatestScreenshot(websiteId: number): Promise<any | null> {
    // TODO: 가장 최신 Screenshot 레코드 조회
    // TODO: 파일이 존재하는지 확인
    // TODO: 존재하면 스크린샷 정보 반환, 없으면 null 반환

    try {
      const screenshot = await this.prisma.screenshot.findFirst({
        where: { websiteId },
        orderBy: { capturedAt: 'desc' },
      });

      if (!screenshot) {
        return null;
      }

      // TODO: 파일 존재 확인
      const fileExists = await fs
        .access(screenshot.filePath)
        .then(() => true)
        .catch(() => false);

      if (!fileExists) {
        logger.warn(`Screenshot file not found: ${screenshot.filePath}`);
        return null;
      }

      return screenshot;
    } catch (error) {
      logger.error(`getLatestScreenshot failed for website ${websiteId}:`, error);
      throw error;
    }
  }

  /**
   * 오래된 스크린샷을 정리합니다 (기본 7일 이상 된 스크린샷)
   * @param daysToKeep 보관할 일 수
   * @returns 삭제된 스크린샷 수
   */
  async cleanupOldScreenshots(daysToKeep: number = 7): Promise<number> {
    // TODO: daysToKeep 이전의 모든 스크린샷 조회
    // TODO: 각 스크린샷 파일 삭제
    // TODO: 각 썸네일 파일 삭제
    // TODO: 데이터베이스 레코드 삭제 (cascade 설정 확인)
    // TODO: 삭제된 스크린샷 수 반환
    // TODO: 베이스라인 스크린샷은 삭제하지 않기

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // TODO: 베이스라인에 사용되지 않는 오래된 스크린샷만 조회
      const oldScreenshots = await this.prisma.screenshot.findMany({
        where: {
          capturedAt: { lt: cutoffDate },
          defacementBaselines: {
            none: {},
          },
        },
      });

      let deletedCount = 0;

      // TODO: 각 스크린샷 파일 및 썸네일 삭제
      for (const screenshot of oldScreenshots) {
        try {
          await fs.unlink(screenshot.filePath);
          const basename = path.basename(screenshot.filePath, '.png');
          // JPG/PNG 썸네일 모두 정리
          await fs.unlink(path.join(this.thumbnailDir, `${basename}_thumb.jpg`)).catch(() => {});
          await fs.unlink(path.join(this.thumbnailDir, `${basename}_thumb.png`)).catch(() => {});
          deletedCount++;
        } catch (error) {
          logger.warn(`Failed to delete screenshot file: ${screenshot.filePath}`, error);
        }
      }

      // TODO: 데이터베이스 레코드 삭제
      if (deletedCount > 0) {
        await this.prisma.screenshot.deleteMany({
          where: {
            id: { in: oldScreenshots.map((s) => s.id) },
          },
        });
      }

      logger.info(`Cleaned up ${deletedCount} old screenshots`);
      return deletedCount;
    } catch (error) {
      logger.error('cleanupOldScreenshots failed:', error);
      throw error;
    }
  }

  /**
   * 스크린샷의 썸네일 Buffer를 반환합니다
   * 기존 썸네일 파일(JPG/PNG)이 있으면 반환, 없으면 원본에서 실시간 생성
   * @param screenshotId 스크린샷 ID
   * @returns { buffer, contentType }
   */
  async getThumbnailBuffer(screenshotId: bigint): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const screenshot = await this.prisma.screenshot.findUnique({
        where: { id: screenshotId },
      });

      if (!screenshot) {
        throw new Error(`Screenshot not found: ${screenshotId}`);
      }

      // 썸네일 파일명 추출 (원본: {id}_{ts}.png → 썸네일: {id}_{ts}_thumb.jpg)
      const basename = path.basename(screenshot.filePath, '.png');
      const jpgThumbPath = path.join(this.thumbnailDir, `${basename}_thumb.jpg`);
      const pngThumbPath = path.join(this.thumbnailDir, `${basename}_thumb.png`);

      // JPG 썸네일 우선, 없으면 PNG fallback
      for (const thumbPath of [jpgThumbPath, pngThumbPath]) {
        try {
          const buffer = await fs.readFile(thumbPath);
          const contentType = thumbPath.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
          return { buffer, contentType };
        } catch {
          // 파일 없음 — 다음 시도
        }
      }

      // 썸네일 파일 없음 — 원본에서 실시간 생성
      const originalBuffer = await fs.readFile(screenshot.filePath);
      const thumbBuffer = await sharp(originalBuffer)
        .resize(400, 225, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toBuffer();

      // 비동기로 파일 저장 (다음 요청에서 캐시 활용)
      await fs.mkdir(this.thumbnailDir, { recursive: true });
      fs.writeFile(jpgThumbPath, thumbBuffer).catch((err) => {
        logger.warn(`Failed to cache thumbnail: ${jpgThumbPath}`, err);
      });

      return { buffer: thumbBuffer, contentType: 'image/jpeg' };
    } catch (error) {
      logger.error(`getThumbnailBuffer failed for screenshot ${screenshotId}:`, error);
      throw error;
    }
  }

  /**
   * 브라우저를 종료합니다
   */
  async closeBrowser(): Promise<void> {
    // TODO: 브라우저가 열려있으면 종료
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Playwright browser closed');
    }
  }

  /**
   * 스크린샷 파일을 읽어 Buffer로 반환합니다
   * @param screenshotId 스크린샷 ID
   * @returns 이미지 Buffer
   */
  async getScreenshotBuffer(screenshotId: bigint): Promise<Buffer> {
    // TODO: screenshotId로 Screenshot 레코드 조회
    // TODO: filePath에서 파일 읽기
    // TODO: Buffer 반환
    // TODO: 파일이 없으면 에러 발생

    try {
      const screenshot = await this.prisma.screenshot.findUnique({
        where: { id: screenshotId },
      });

      if (!screenshot) {
        throw new Error(`Screenshot not found: ${screenshotId}`);
      }

      const buffer = await fs.readFile(screenshot.filePath);
      return buffer;
    } catch (error) {
      logger.error(`getScreenshotBuffer failed for screenshot ${screenshotId}:`, error);
      throw error;
    }
  }
}

// 싱글턴 인스턴스 내보내기
export const screenshotService = new ScreenshotService();
