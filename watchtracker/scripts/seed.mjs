import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const file = path.join(__dirname, '..', 'data', 'models.json');
  const raw = fs.readFileSync(file, 'utf8');
  const list = JSON.parse(raw);
  for (const m of list) {
    const existing = await prisma.model.findFirst({ where: { brand: m.brand, ref: m.ref } });
    if (existing) {
      await prisma.model.update({ where: { id: existing.id }, data: { displayName: m.displayName, keywords: m.keywords } });
    } else {
      await prisma.model.create({ data: m });
    }
  }
  console.log(`Seeded ${list.length} models`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
