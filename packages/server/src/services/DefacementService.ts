import path from 'path';
import fs from 'fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { getDbClient } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DefacementResult, HybridDefacementResult } from '../types';
import { htmlAnalysisService } from './HtmlAnalysisService';

/**
 * 위변조(Defacement) 탐지 서비스
 * 픽셀 단위 이미지 비교를 통해 웹사이트 메인페이지의 위변조 여부를 감지합니다.
 */
export class DefacementService {
  private prisma = getDbClient();
  private readonly screenshotDir = config.screenshot.dir;
  private readonly currentDir = path.join(this.screenshotDir, 'current');
  private readonly baselineDir = path.join(this.screenshotDir, 'baselines');
  private readonly diffDir = path.join(this.screenshotDir, 'diffs');

  constructor() {
    // TODO: 위변조 디렉토리 초기화
  }

  /**
   * 현재 스크린샷을 베이스라인과 비교합니다 (하이브리드 탐지)
   * @param websiteId 웹사이트 ID
   * @param screenshotId 현재 스크린샷 ID
   * @param htmlContent 현재 페이지의 HTML (선택)
   * @returns HybridDefacementResult
   */
  async compareWithBaseline(
    websiteId: number,
    screenshotId: number | bigint,
    htmlContent?: string,
  ): Promise<HybridDefacementResult> {
    try {
      // 활성 베이스라인 조회
      const baseline = await this.prisma.defacementBaseline.findFirst({
        where: {
          websiteId,
          isActive: true,
        },
        include: {
          screenshot: true,
        },
      });

      if (!baseline) {
        logger.warn(`No active baseline found for website ${websiteId}`);
        throw new Error(`No baseline available for website ${websiteId}`);
      }

      // 현재 스크린샷 조회
      const currentScreenshot = await this.prisma.screenshot.findUnique({
        where: { id: screenshotId },
      });

      if (!currentScreenshot) {
        throw new Error(`Screenshot not found: ${screenshotId}`);
      }

      // 이미지 파일 읽기 & 픽셀 비교
      const baselineBuffer = await fs.readFile(baseline.screenshot.filePath);
      const currentBuffer = await fs.readFile(currentScreenshot.filePath);
      const normalized = await this.normalizeImages(baselineBuffer, currentBuffer);

      const { similarityScore: pixelScore, diffImagePath } = await this.comparePixels(
        normalized.baselineBuffer,
        normalized.currentBuffer,
        0,
        0,
        websiteId,
      );

      // 사이트별 설정 조회 (defacementMode, ignoreSelectors)
      const website = await this.prisma.website.findUnique({
        where: { id: websiteId },
        select: { url: true, ignoreSelectors: true, defacementMode: true },
      });
      const forcePixelOnly = website?.defacementMode === 'pixel_only';

      // HTML 분석 (베이스라인에 HTML 데이터가 있고, htmlContent가 있을 때만)
      const hasHtmlBaseline = baseline.structuralHash && baseline.domainWhitelist;
      const canDoHybrid = hasHtmlBaseline && htmlContent && config.monitoring.htmlAnalysisEnabled && !forcePixelOnly;

      let structuralScore = 100;
      let criticalElementsScore = 100;
      let hybridScore: number;
      let detectionMethod: 'pixel_only' | 'hybrid' = 'pixel_only';
      let newDomains: string[] = [];
      let removedDomains: string[] = [];
      let structuralMatch = true;

      if (canDoHybrid) {
        try {
          const ignoreSelectors = (website?.ignoreSelectors as string[] | null) || [];

          const htmlResult = htmlAnalysisService.compareWithBaseline(
            htmlContent,
            website?.url || '',
            {
              structuralHash: baseline.structuralHash!,
              domainWhitelist: (baseline.domainWhitelist as string[]) || [],
              structuralPaths: (baseline.structuralData as string[] | null) ?? null,
            },
            ignoreSelectors,
          );

          structuralScore = htmlResult.structuralScore;
          criticalElementsScore = htmlResult.criticalElementsScore;
          newDomains = htmlResult.newDomains;
          removedDomains = htmlResult.removedDomains;
          structuralMatch = htmlResult.structuralMatch;
          detectionMethod = 'hybrid';
        } catch (e) {
          logger.warn(`HTML analysis failed for website ${websiteId}, falling back to pixel_only:`, e);
        }
      }

      // 하이브리드 점수 계산
      const weights = config.monitoring.hybridWeights;
      if (detectionMethod === 'hybrid') {
        hybridScore = pixelScore * weights.pixel + structuralScore * weights.structural + criticalElementsScore * weights.critical;
      } else {
        hybridScore = pixelScore;
      }

      // 위변조 여부 판정
      const isDefaced = hybridScore < config.monitoring.defacementThreshold;

      const detectionDetails = {
        pixelScore,
        structuralScore,
        criticalElementsScore,
        hybridScore,
        newDomains,
        removedDomains,
        structuralMatch,
        weights,
      };

      // DefacementCheck 레코드 저장
      await this.prisma.defacementCheck.create({
        data: {
          websiteId,
          baselineId: baseline.id,
          currentScreenshotId: screenshotId,
          similarityScore: pixelScore,
          ...(detectionMethod === 'hybrid' && {
            structuralScore,
            criticalElementsScore,
            htmlSimilarityScore: hybridScore,
            detectionDetails: detectionDetails as any,
          }),
          isDefaced,
          diffImagePath,
        },
      });

      logger.info(
        `Defacement check completed for website ${websiteId} [${detectionMethod}]: ` +
          `${isDefaced ? 'DEFACED' : 'NORMAL'} ` +
          `(pixel=${pixelScore.toFixed(1)}%` +
          (detectionMethod === 'hybrid' ? `, structural=${structuralScore}%, critical=${criticalElementsScore}%, hybrid=${hybridScore.toFixed(1)}%` : '') +
          ')',
      );

      return {
        similarityScore: pixelScore,
        isDefaced,
        diffImagePath,
        structuralScore,
        criticalElementsScore,
        hybridScore,
        detectionDetails,
        detectionMethod,
      };
    } catch (error) {
      logger.error(`compareWithBaseline failed for website ${websiteId}:`, error);
      throw error;
    }
  }

  /**
   * 두 이미지를 같은 크기로 정규화합니다
   * @param baselineBuffer 베이스라인 이미지 Buffer
   * @param currentBuffer 현재 이미지 Buffer
   * @returns 정규화된 이미지 Buffers
   */
  private async normalizeImages(
    baselineBuffer: Buffer,
    currentBuffer: Buffer,
  ): Promise<{ baselineBuffer: Buffer; currentBuffer: Buffer }> {
    // TODO: 두 이미지의 메타데이터 조회 (너비, 높이)
    // TODO: 다른 크기면 현재 이미지를 베이스라인 크기로 리사이즈
    // TODO: sharp를 이용한 리사이징

    try {
      const baselineMetadata = await sharp(baselineBuffer).metadata();
      const currentMetadata = await sharp(currentBuffer).metadata();

      if (
        baselineMetadata.width === currentMetadata.width &&
        baselineMetadata.height === currentMetadata.height
      ) {
        // 이미 같은 크기
        return { baselineBuffer, currentBuffer };
      }

      const targetWidth = baselineMetadata.width || config.screenshot.viewportWidth;
      const targetHeight = baselineMetadata.height || config.screenshot.viewportHeight;

      const resizedCurrentBuffer = await sharp(currentBuffer)
        .resize(targetWidth, targetHeight, { fit: 'fill' })
        .png()
        .toBuffer();

      const normalizedBaselineBuffer = await sharp(baselineBuffer)
        .png()
        .toBuffer();

      return {
        baselineBuffer: normalizedBaselineBuffer,
        currentBuffer: resizedCurrentBuffer,
      };
    } catch (error) {
      logger.error('normalizeImages failed:', error);
      throw error;
    }
  }

  /**
   * pixelmatch를 이용하여 두 이미지를 픽셀 단위로 비교합니다
   * @param baselineBuffer 베이스라인 이미지 Buffer
   * @param currentBuffer 현재 이미지 Buffer
   * @param width 이미지 너비
   * @param height 이미지 높이
   * @param websiteId 웹사이트 ID (diff 이미지 경로 생성용)
   * @returns 유사도 점수와 diff 이미지 경로
   */
  private async comparePixels(
    baselineBuffer: Buffer,
    currentBuffer: Buffer,
    width: number,
    height: number,
    websiteId: number,
  ): Promise<{ similarityScore: number; diffImagePath: string | null }> {
    // TODO: PNG 객체로 변환
    // TODO: pixelmatch 옵션 설정
    //   - threshold: 0.1 (색상 차이 민감도)
    //   - includeAA: false (안티앨리어싱 무시)
    //   - alpha: 0.1 (투명도 차이 민감도)
    // TODO: 비교 수행
    // TODO: 유사도 점수 계산
    // TODO: 차이 있으면 diff 이미지 생성 및 저장
    // TODO: diff 이미지 경로 반환

    try {
      const baselinePng = PNG.sync.read(baselineBuffer);
      const currentPng = PNG.sync.read(currentBuffer);

      const imgWidth = baselinePng.width;
      const imgHeight = baselinePng.height;

      const diffPng = new PNG({ width: imgWidth, height: imgHeight });
      const numDiffPixels = pixelmatch(
        baselinePng.data as unknown as Uint8Array,
        currentPng.data as unknown as Uint8Array,
        diffPng.data as unknown as Uint8Array,
        imgWidth,
        imgHeight,
        { threshold: 0.3, includeAA: false, alpha: 0.1 },
      );

      const totalPixels = imgWidth * imgHeight;
      const similarityScore = ((totalPixels - numDiffPixels) / totalPixels) * 100;

      let diffImagePath: string | null = null;
      if (numDiffPixels > 0) {
        await fs.mkdir(this.diffDir, { recursive: true });
        const diffFilename = `${websiteId}_${Date.now()}_diff.png`;
        diffImagePath = path.join(this.diffDir, diffFilename);

        // 현재 스크린샷 위에 변경 영역을 빨간 반투명 오버레이로 합성
        const overlayPng = new PNG({ width: imgWidth, height: imgHeight });
        const diffData = diffPng.data;
        const currentData = currentPng.data;
        const overlayData = overlayPng.data;

        for (let i = 0; i < totalPixels; i++) {
          const idx = i * 4;
          // pixelmatch diff에서 빨간 픽셀(변경됨)인지 확인
          const isChanged = diffData[idx] > 200 && diffData[idx + 1] < 100 && diffData[idx + 2] < 100;

          if (isChanged) {
            // 변경된 픽셀: 현재 스크린샷 + 빨간 오버레이 블렌딩 (60%)
            const alpha = 0.6;
            overlayData[idx] = Math.round(currentData[idx] * (1 - alpha) + 255 * alpha);     // R
            overlayData[idx + 1] = Math.round(currentData[idx + 1] * (1 - alpha) + 0 * alpha); // G
            overlayData[idx + 2] = Math.round(currentData[idx + 2] * (1 - alpha) + 0 * alpha); // B
            overlayData[idx + 3] = 255; // A
          } else {
            // 변경되지 않은 픽셀: 현재 스크린샷을 어둡게 (50%)
            overlayData[idx] = Math.round(currentData[idx] * 0.5);     // R
            overlayData[idx + 1] = Math.round(currentData[idx + 1] * 0.5); // G
            overlayData[idx + 2] = Math.round(currentData[idx + 2] * 0.5); // B
            overlayData[idx + 3] = 255; // A
          }
        }

        const overlayBuffer = PNG.sync.write(overlayPng);
        await fs.writeFile(diffImagePath, overlayBuffer);
      }

      return { similarityScore, diffImagePath };
    } catch (error) {
      logger.error('comparePixels failed:', error);
      throw error;
    }
  }

  /**
   * 베이스라인을 갱신합니다
   * @param websiteId 웹사이트 ID
   * @param screenshotId 새 베이스라인으로 사용할 스크린샷 ID
   * @param userId 갱신 요청자 ID
   */
  async updateBaseline(
    websiteId: number,
    screenshotId: bigint,
    userId: number,
    htmlContent?: string,
  ): Promise<void> {
    try {
      const screenshot = await this.prisma.screenshot.findUnique({
        where: { id: screenshotId },
      });

      if (!screenshot || screenshot.websiteId !== websiteId) {
        throw new Error(`Invalid screenshot: ${screenshotId}`);
      }

      // 기존 활성 베이스라인 비활성화
      const existingBaseline = await this.prisma.defacementBaseline.findFirst({
        where: { websiteId, isActive: true },
      });

      if (existingBaseline) {
        await this.prisma.defacementBaseline.update({
          where: { id: existingBaseline.id },
          data: { isActive: false },
        });
      }

      // HTML 베이스라인 데이터 생성 (htmlContent가 있을 때)
      let htmlBaselineData: { htmlHash: string; structuralHash: string; structuralPaths: string[]; domainWhitelist: string[] } | null = null;
      if (htmlContent && config.monitoring.htmlAnalysisEnabled) {
        try {
          const website = await this.prisma.website.findUnique({
            where: { id: websiteId },
            select: { url: true, ignoreSelectors: true },
          });
          const ignoreSelectors = (website?.ignoreSelectors as string[] | null) || [];
          htmlBaselineData = htmlAnalysisService.createBaselineData(
            htmlContent,
            website?.url || '',
            ignoreSelectors,
          );
        } catch (e) {
          logger.warn(`HTML baseline data extraction failed for website ${websiteId}:`, e);
        }
      }

      // 새 베이스라인 생성
      await this.prisma.defacementBaseline.create({
        data: {
          websiteId,
          screenshotId,
          createdBy: userId,
          isActive: true,
          hash: null,
          ...(htmlBaselineData && {
            htmlHash: htmlBaselineData.htmlHash,
            structuralHash: htmlBaselineData.structuralHash,
            structuralData: htmlBaselineData.structuralPaths,
            domainWhitelist: htmlBaselineData.domainWhitelist,
          }),
        },
      });

      logger.info(
        `Baseline updated for website ${websiteId} by user ${userId}: screenshot ${screenshotId}` +
          (htmlBaselineData ? ` (htmlHash: ${htmlBaselineData.htmlHash.slice(0, 8)}...)` : ''),
      );
    } catch (error) {
      logger.error(
        `updateBaseline failed for website ${websiteId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 특정 웹사이트의 최신 위변조 체크 결과를 조회합니다
   * @param websiteId 웹사이트 ID
   * @returns 최신 DefacementCheck 정보
   */
  async getLatestCheck(websiteId: number): Promise<any | null> {
    // TODO: 최신 DefacementCheck 레코드 조회
    // TODO: defacementBaseline, currentScreenshot 포함
    // TODO: 없으면 null 반환

    try {
      const latestCheck = await this.prisma.defacementCheck.findFirst({
        where: { websiteId },
        orderBy: { checkedAt: 'desc' },
        include: {
          baseline: true,
          currentScreenshot: true,
        },
      });

      return latestCheck || null;
    } catch (error) {
      logger.error(`getLatestCheck failed for website ${websiteId}:`, error);
      throw error;
    }
  }

  /**
   * 특정 웹사이트의 위변조 체크 이력을 조회합니다
   * @param websiteId 웹사이트 ID
   * @param limit 최대 개수
   * @param offset 오프셋
   * @returns DefacementCheck 배열
   */
  async getHistory(
    websiteId: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<any[]> {
    // TODO: 특정 웹사이트의 DefacementCheck를 시간순으로 조회
    // TODO: limit, offset을 이용한 페이지네이션
    // TODO: 최신 순서로 반환

    try {
      const checks = await this.prisma.defacementCheck.findMany({
        where: { websiteId },
        orderBy: { checkedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          baseline: true,
        },
      });

      return checks;
    } catch (error) {
      logger.error(`getHistory failed for website ${websiteId}:`, error);
      throw error;
    }
  }

  /**
   * 위변조 임계값을 조회합니다
   * @returns 기본 임계값 (%)
   */
  getDefacementThreshold(): number {
    return config.monitoring.defacementThreshold;
  }

  /**
   * 차이 이미지를 읽어 Buffer로 반환합니다
   * @param checkId DefacementCheck ID
   * @returns 이미지 Buffer
   */
  async getDiffImageBuffer(checkId: bigint): Promise<Buffer> {
    // TODO: checkId로 DefacementCheck 레코드 조회
    // TODO: diffImagePath에서 파일 읽기
    // TODO: Buffer 반환
    // TODO: 파일이 없으면 에러 발생

    try {
      const check = await this.prisma.defacementCheck.findUnique({
        where: { id: checkId },
      });

      if (!check || !check.diffImagePath) {
        throw new Error(`Diff image not found: ${checkId}`);
      }

      const buffer = await fs.readFile(check.diffImagePath);
      return buffer;
    } catch (error) {
      logger.error(`getDiffImageBuffer failed for check ${checkId}:`, error);
      throw error;
    }
  }
}

// 싱글턴 인스턴스 내보내기
export const defacementService = new DefacementService();
