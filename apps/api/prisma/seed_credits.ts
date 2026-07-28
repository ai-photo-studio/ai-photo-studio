import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  const updates = [
    { code: 'STARTER', creditsIncluded: 10, monthlyCreditLimit: 10, maxImages: 3 },
    { code: 'PRO', creditsIncluded: 25, monthlyCreditLimit: 25, maxImages: 10 },
    { code: 'BUSINESS', creditsIncluded: 60, monthlyCreditLimit: 60, maxImages: 25 },
    { code: 'DEALER', creditsIncluded: 100, monthlyCreditLimit: 100, maxImages: 50 },
  ];
  for (const u of updates) {
    await prisma.package.update({ where: { code: u.code }, data: u });
    console.log(`Updated ${u.code}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
