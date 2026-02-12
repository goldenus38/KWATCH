import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 시드 데이터 생성 시작...');

  // ============================================
  // 1. 기본 사용자 생성
  // ============================================
  const adminPassword = await bcrypt.hash('admin1234', 12);
  const analystPassword = await bcrypt.hash('analyst1234', 12);
  const viewerPassword = await bcrypt.hash('viewer1234', 12);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      email: 'admin@kwatch.local',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const analyst = await prisma.user.upsert({
    where: { username: 'analyst' },
    update: {},
    create: {
      username: 'analyst',
      passwordHash: analystPassword,
      email: 'analyst@kwatch.local',
      role: 'ANALYST',
      isActive: true,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { username: 'viewer' },
    update: {},
    create: {
      username: 'viewer',
      passwordHash: viewerPassword,
      email: 'viewer@kwatch.local',
      role: 'VIEWER',
      isActive: true,
    },
  });

  console.log('✅ 사용자 생성 완료:', { admin: admin.username, analyst: analyst.username, viewer: viewer.username });

  // ============================================
  // 2. 카테고리 생성
  // ============================================
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: '중앙행정기관' },
      update: {},
      create: { name: '중앙행정기관', description: '중앙정부 부처 및 소속기관', sortOrder: 1 },
    }),
    prisma.category.upsert({
      where: { name: '지방자치단체' },
      update: {},
      create: { name: '지방자치단체', description: '시·도 및 시·군·구 지자체', sortOrder: 2 },
    }),
    prisma.category.upsert({
      where: { name: '공공기관' },
      update: {},
      create: { name: '공공기관', description: '공기업 및 준정부기관', sortOrder: 3 },
    }),
    prisma.category.upsert({
      where: { name: '교육기관' },
      update: {},
      create: { name: '교육기관', description: '대학교 및 교육관련 기관', sortOrder: 4 },
    }),
    prisma.category.upsert({
      where: { name: '의료기관' },
      update: {},
      create: { name: '의료기관', description: '공공의료기관 및 병원', sortOrder: 5 },
    }),
    prisma.category.upsert({
      where: { name: '기타' },
      update: {},
      create: { name: '기타', description: '기타 관제 대상', sortOrder: 99 },
    }),
  ]);

  console.log('✅ 카테고리 생성 완료:', categories.map(c => c.name));

  // ============================================
  // 3. 샘플 웹사이트 생성
  // ============================================
  const sampleWebsites = [
    // 중앙행정기관
    { url: 'https://www.mois.go.kr', name: '행정안전부', organizationName: '행정안전부', categoryId: categories[0].id },
    { url: 'https://www.msit.go.kr', name: '과학기술정보통신부', organizationName: '과학기술정보통신부', categoryId: categories[0].id },
    { url: 'https://www.mof.go.kr', name: '해양수산부', organizationName: '해양수산부', categoryId: categories[0].id },
    { url: 'https://www.me.go.kr', name: '환경부', organizationName: '환경부', categoryId: categories[0].id },
    { url: 'https://www.moef.go.kr', name: '기획재정부', organizationName: '기획재정부', categoryId: categories[0].id },
    // 지방자치단체
    { url: 'https://www.seoul.go.kr', name: '서울특별시', organizationName: '서울특별시', categoryId: categories[1].id },
    { url: 'https://www.busan.go.kr', name: '부산광역시', organizationName: '부산광역시', categoryId: categories[1].id },
    { url: 'https://www.daegu.go.kr', name: '대구광역시', organizationName: '대구광역시', categoryId: categories[1].id },
    { url: 'https://www.incheon.go.kr', name: '인천광역시', organizationName: '인천광역시', categoryId: categories[1].id },
    { url: 'https://www.gwangju.go.kr', name: '광주광역시', organizationName: '광주광역시', categoryId: categories[1].id },
    // 공공기관
    { url: 'https://www.kisa.or.kr', name: '한국인터넷진흥원', organizationName: 'KISA', categoryId: categories[2].id },
    { url: 'https://www.nia.or.kr', name: '한국지능정보사회진흥원', organizationName: 'NIA', categoryId: categories[2].id },
    { url: 'https://www.koroad.or.kr', name: '도로교통공단', organizationName: '도로교통공단', categoryId: categories[2].id },
    // 교육기관
    { url: 'https://www.snu.ac.kr', name: '서울대학교', organizationName: '서울대학교', categoryId: categories[3].id },
    { url: 'https://www.kaist.ac.kr', name: 'KAIST', organizationName: 'KAIST', categoryId: categories[3].id },
    // 의료기관
    { url: 'https://www.snuh.org', name: '서울대학교병원', organizationName: '서울대병원', categoryId: categories[4].id },
  ];

  for (const site of sampleWebsites) {
    await prisma.website.upsert({
      where: { url: site.url },
      update: {},
      create: {
        ...site,
        checkIntervalSeconds: 300,
        timeoutSeconds: 30,
        isActive: true,
      },
    });
  }

  console.log(`✅ 샘플 웹사이트 ${sampleWebsites.length}개 생성 완료`);

  // ============================================
  // 4. 알림 채널 기본 설정
  // ============================================
  await prisma.alertChannel.upsert({
    where: { id: 1 },
    update: {},
    create: {
      channelType: 'EMAIL',
      config: { smtpHost: '', smtpPort: 587, from: '', to: [] },
      isActive: false,
    },
  });

  await prisma.alertChannel.upsert({
    where: { id: 2 },
    update: {},
    create: {
      channelType: 'SLACK',
      config: { webhookUrl: '' },
      isActive: false,
    },
  });

  await prisma.alertChannel.upsert({
    where: { id: 3 },
    update: {},
    create: {
      channelType: 'TELEGRAM',
      config: { botToken: '', chatId: '' },
      isActive: false,
    },
  });

  console.log('✅ 알림 채널 기본 설정 완료');

  // ============================================
  // 완료
  // ============================================
  console.log('');
  console.log('🎉 시드 데이터 생성 완료!');
  console.log('');
  console.log('📌 로그인 계정:');
  console.log('  admin    / admin1234    (관리자)');
  console.log('  analyst  / analyst1234  (분석가)');
  console.log('  viewer   / viewer1234   (뷰어)');
}

main()
  .catch((e) => {
    console.error('❌ 시드 실행 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
