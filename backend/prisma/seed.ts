import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Test accounts for a local database (password: password123). It only adds
 * or updates these two - it never deletes anything, so running it by mistake
 * on a real database costs nothing.
 */
const prisma = new PrismaClient();

const ACCOUNTS = [
  { email: 'demo@widgetpop.local', name: 'Alex Demo', role: 'USER' },
  { email: 'admin@widgetpop.local', name: 'Admin', role: 'ADMIN' },
];

async function main() {
  const password = await bcrypt.hash('password123', 10);
  for (const account of ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: { ...account, password },
    });
  }
  console.log(`Test accounts ready: ${ACCOUNTS.map((a) => a.email).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
