/**
 * Delete every Social Deal user, widget, deal, and login code.
 *
 * Run this on the server from the backend folder, after the app is stopped:
 *
 *     node reset-data.js RESET
 *
 * Billing plans and PayPal settings in the database stay.
 * The .env file stays.
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function deletePattern(redis, pattern) {
  let deleted = 0;
  const stream = redis.scanStream({ match: pattern, count: 100 });
  for await (const keys of stream) {
    if (keys.length) deleted += await redis.del(...keys);
  }
  return deleted;
}

async function main() {
  if (process.argv[2] !== 'RESET') {
    console.log('Nothing deleted. Run: node reset-data.js RESET');
    process.exit(1);
  }

  const env = { ...loadEnv(path.join(__dirname, '.env')), ...process.env };
  if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;

  const prisma = new PrismaClient();
  const before = {
    users: await prisma.user.count(),
    widgets: await prisma.widget.count(),
    deals: await prisma.deal.count(),
    sources: await prisma.source.count(),
  };

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "BillingEvent",
      "Usage",
      "Subscription",
      "Source",
      "Widget",
      "Review",
      "Voucher",
      "Favorite",
      "Deal",
      "Category",
      "User"
    RESTART IDENTITY CASCADE
  `);
  await prisma.$disconnect();

  let redisDeleted = 0;
  if (env.REDIS_URL) {
    const redis = new Redis(env.REDIS_URL);
    redisDeleted += await deletePattern(redis, 'signup:*');
    redisDeleted += await deletePattern(redis, 'login-code:*');
    redis.disconnect();
  }

  console.log(
    `Postgres cleared: ${before.users} users, ${before.widgets} widgets, ` +
      `${before.deals} deals, ${before.sources} sources.`,
  );
  console.log(`Redis cleared: ${redisDeleted} login codes.`);
  console.log('Plans and PayPal settings were left in place.');
  console.log('Done. Start the app again and sign up from scratch.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
