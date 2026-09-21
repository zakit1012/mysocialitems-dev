import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.review.deleteMany();
  await prisma.voucher.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('password123', 10);

  const demo = await prisma.user.create({
    data: {
      email: 'demo@socialdeal.local',
      password,
      name: 'Alex Demo',
      role: 'USER',
      city: 'Amsterdam',
    },
  });

  const merchant = await prisma.user.create({
    data: {
      email: 'merchant@socialdeal.local',
      password,
      name: 'SocialDeal Partner',
      role: 'MERCHANT',
      city: 'Amsterdam',
    },
  });

  await prisma.user.create({
    data: {
      email: 'admin@socialdeal.local',
      password,
      name: 'SocialDeal Admin',
      role: 'ADMIN',
      city: 'Amsterdam',
    },
  });

  const categories = await prisma.$transaction([
    prisma.category.create({ data: { slug: 'restaurants', name: 'Restaurants' } }),
    prisma.category.create({ data: { slug: 'hotels', name: 'Hotels' } }),
    prisma.category.create({ data: { slug: 'wellness', name: 'Wellness' } }),
    prisma.category.create({ data: { slug: 'attractions', name: 'Attractions' } }),
    prisma.category.create({ data: { slug: 'activities', name: 'Activities' } }),
    prisma.category.create({ data: { slug: 'beauty', name: 'Beauty' } }),
  ]);

  const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + 3);

  const deals = [
    {
      title: '3-course dinner at Canal House Bistro',
      slug: 'canal-house-bistro-amsterdam',
      description:
        'Discover one of Amsterdam’s hidden canal-side dining rooms. This SocialDeal includes a welcome drink, a chef’s 3-course menu, and coffee. Perfect for a weeknight treat or a date night without the usual price tag.',
      highlights: [
        'Welcome drink included',
        'Chef’s seasonal 3-course menu',
        'Valid Sunday to Thursday',
        'Show your voucher at the table',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 79,
      dealPrice: 39.5,
      city: 'Amsterdam',
      location: 'Keizersgracht 212, Amsterdam',
      stock: 80,
      soldCount: 124,
      featured: true,
      categoryId: bySlug.restaurants,
    },
    {
      title: 'All-you-can-eat sushi for two',
      slug: 'sushi-for-two-rotterdam',
      description:
        'Share a generous all-you-can-eat sushi experience in Rotterdam. The deal covers two people, unlimited maki and nigiri for 90 minutes, and miso soup to start.',
      highlights: [
        'Valid for 2 people',
        '90 minutes unlimited sushi',
        'Miso soup included',
        'Book your timeslot after purchase',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1579871494447-9811cf80d66d?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 90,
      dealPrice: 49,
      city: 'Rotterdam',
      location: 'Witte de Withstraat 18, Rotterdam',
      stock: 60,
      soldCount: 89,
      featured: true,
      categoryId: bySlug.restaurants,
    },
    {
      title: 'Overnight stay with breakfast in Utrecht',
      slug: 'boutique-hotel-utrecht',
      description:
        'Spend a night in a boutique canal hotel in the heart of Utrecht. Wake up to breakfast for two and late checkout on Sundays. A compact city break at a SocialDeal price.',
      highlights: [
        '1 night in a deluxe double room',
        'Breakfast for 2',
        'Late checkout on Sundays',
        'Free cancellation up to 48h',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 189,
      dealPrice: 99,
      city: 'Utrecht',
      location: 'Oudegracht 99, Utrecht',
      stock: 24,
      soldCount: 41,
      featured: true,
      categoryId: bySlug.hotels,
    },
    {
      title: '90-minute spa ritual for two',
      slug: 'spa-ritual-antwerp',
      description:
        'Unwind with a shared hammam, sauna access, and a 90-minute couples ritual. Robes, tea, and a quiet lounge are included. Bring a friend and split the outing.',
      highlights: [
        'Hammam + sauna access',
        '90-minute ritual for two',
        'Tea lounge included',
        'Weekday and weekend slots',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 160,
      dealPrice: 79,
      city: 'Antwerp',
      location: 'Nationalestraat 40, Antwerp',
      stock: 40,
      soldCount: 67,
      featured: true,
      categoryId: bySlug.wellness,
    },
    {
      title: 'Skip-the-line day at Adventure Park',
      slug: 'adventure-park-tickets',
      description:
        'Get a full-day ticket including skip-the-line entry, a meal voucher, and access to seasonal shows. Ideal for families looking for a last-minute day out.',
      highlights: [
        'Full-day park ticket',
        'Skip-the-line entry',
        'Meal voucher included',
        'Kids under 4 go free',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1505731110654-99d7a7cc6c39?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 54,
      dealPrice: 29,
      city: 'Amsterdam',
      location: 'Adventure Park, Amsterdam Area',
      stock: 200,
      soldCount: 310,
      featured: false,
      categoryId: bySlug.attractions,
    },
    {
      title: 'Sunset sailing on the IJ',
      slug: 'sunset-sailing-amsterdam',
      description:
        'Board a classic sailboat for a 2-hour sunset cruise. Drinks and bites are served on deck while you watch the city light up from the water.',
      highlights: [
        '2-hour guided sailing',
        'Welcome drink and bites',
        'Small group of max 12',
        'Weather backup date included',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 65,
      dealPrice: 32.5,
      city: 'Amsterdam',
      location: 'NDSM Pier, Amsterdam',
      stock: 36,
      soldCount: 58,
      featured: true,
      categoryId: bySlug.activities,
    },
    {
      title: 'Haircut, color, and blow-dry',
      slug: 'salon-makeover-brussels',
      description:
        'A complete salon makeover with consultation, cut, color, and styling. Use it yourself or gift the voucher — valid for 3 months.',
      highlights: [
        'Consultation included',
        'Cut + color + blow-dry',
        'Valid 3 months',
        'Tue–Sat appointments',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 120,
      dealPrice: 59,
      city: 'Brussels',
      location: 'Rue Dansaert 12, Brussels',
      stock: 30,
      soldCount: 22,
      featured: false,
      categoryId: bySlug.beauty,
    },
    {
      title: 'Belgian tasting menu with wine pairing',
      slug: 'tasting-menu-ghent',
      description:
        'Five courses of modern Belgian cooking with an optional wine pairing. The kitchen uses local farms and changes the menu every two weeks.',
      highlights: [
        '5-course tasting menu',
        'Optional wine pairing',
        'Vegetarian option available',
        'Reserve after purchase',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 110,
      dealPrice: 59,
      city: 'Ghent',
      location: 'Graslei 8, Ghent',
      stock: 45,
      soldCount: 33,
      featured: false,
      categoryId: bySlug.restaurants,
    },
    {
      title: 'City spa day with lunch',
      slug: 'city-spa-rotterdam',
      description:
        'Unlimited pool, sauna, and steam for a full day, plus a healthy lunch plate. Bring a swimsuit — towels and slippers are waiting for you.',
      highlights: [
        'Full-day spa access',
        'Lunch included',
        'Towel and slippers provided',
        'Open 7 days a week',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 85,
      dealPrice: 42,
      city: 'Rotterdam',
      location: 'Coolsingel 5, Rotterdam',
      stock: 70,
      soldCount: 91,
      featured: false,
      categoryId: bySlug.wellness,
    },
    {
      title: 'Private pottery workshop',
      slug: 'pottery-workshop-utrecht',
      description:
        'Learn the wheel in a 2.5-hour private-ish workshop (max 8 people). Clay, firing, and a glazed piece to take home are all included.',
      highlights: [
        '2.5-hour workshop',
        'All materials included',
        'Take your piece home',
        'Beginner friendly',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 75,
      dealPrice: 39,
      city: 'Utrecht',
      location: 'Voorstraat 64, Utrecht',
      stock: 18,
      soldCount: 14,
      featured: false,
      categoryId: bySlug.activities,
    },
    {
      title: 'Weekend loft with canal view',
      slug: 'canal-loft-amsterdam',
      description:
        'Two nights in a bright canal loft for two, with coffee, bikes, and a local breakfast basket on arrival. A compact Amsterdam hideaway.',
      highlights: [
        '2 nights for 2 guests',
        'Breakfast basket',
        'City bikes included',
        'Self check-in',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 420,
      dealPrice: 219,
      city: 'Amsterdam',
      location: 'Prinsengracht 88, Amsterdam',
      stock: 8,
      soldCount: 11,
      featured: true,
      categoryId: bySlug.hotels,
    },
    {
      title: 'Indoor climbing session + gear',
      slug: 'climbing-session-antwerp',
      description:
        'A 2-hour indoor climbing session including shoes, harness, and an intro with a coach. Great for first-timers and returning climbers.',
      highlights: [
        '2-hour session',
        'Gear included',
        'Coach intro',
        'No experience needed',
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80',
      originalPrice: 40,
      dealPrice: 19.5,
      city: 'Antwerp',
      location: 'Sint-Jansplein 3, Antwerp',
      stock: 50,
      soldCount: 27,
      featured: false,
      categoryId: bySlug.activities,
    },
  ];

  for (const deal of deals) {
    await prisma.deal.create({
      data: {
        ...deal,
        highlights: JSON.stringify(deal.highlights),
        validUntil,
        merchantId: merchant.id,
      },
    });
  }

  const featured = await prisma.deal.findFirst({
    where: { slug: 'canal-house-bistro-amsterdam' },
  });
  if (featured) {
    await prisma.favorite.create({
      data: { userId: demo.id, dealId: featured.id },
    });
    await prisma.review.create({
      data: {
        userId: demo.id,
        dealId: featured.id,
        rating: 5,
        comment: 'Booked this last Thursday — food was excellent and the canal terrace is a gem.',
      },
    });
  }

  console.log('Seeded SocialDeal demo data.');
  console.log('Login as user:     demo@socialdeal.local / password123');
  console.log('Login as merchant: merchant@socialdeal.local / password123');
  console.log('Login as admin:    admin@socialdeal.local / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
