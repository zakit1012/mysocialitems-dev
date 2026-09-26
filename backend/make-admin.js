/**
 * Makes an existing account a super admin, or lists who is one.
 *
 *   node make-admin.js you@example.com   promote that account
 *   node make-admin.js --list            show every admin
 *
 * Sign up on the site first, then run this on the server from the backend
 * folder. No new login is needed: the next page load shows the Admin panel.
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const arg = (process.argv[2] || '').trim().toLowerCase();
  if (!arg) {
    console.log('Usage: node make-admin.js you@example.com | --list');
    process.exitCode = 1;
    return;
  }

  if (arg === '--list') {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!admins.length) console.log('No admins yet.');
    for (const a of admins) console.log(`${a.email}  (${a.name})`);
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: arg } });
  if (!user) {
    console.log(`No account for ${arg}. Sign up on the site with that email first.`);
    process.exitCode = 1;
    return;
  }
  if (user.role === 'ADMIN') {
    console.log(`${arg} is already an admin.`);
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  console.log(`${arg} is now an admin. Reload the dashboard to see the Admin panel.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
