import type { PreviewData, PreviewReview } from "@/components/widget/WidgetPreview";

/**
 * A made-up business and made-up reviews for the home page demo. Never real
 * people's reviews. Lengths vary on purpose - a line, a few lines, a long
 * story - and some carry photos, so Grid, Masonry, Showcase and the rest
 * each look the way they do with real reviews.
 */
const REVIEWS: (Omit<PreviewReview, "images"> & { photos?: string[] })[] = [
  {
    review_id: "d1",
    author: "Maya Thompson",
    rating: 5,
    published_at_text: "a week ago",
    text: "The best brunch spot in town. The avocado toast is perfect, the coffee is strong and the staff remember your order after one visit. We came on a rainy Sunday with two kids and they found us a corner table, brought crayons without asking and still got everything out hot. Already planning our next visit.",
    photos: ["avocado", "latte"],
  },
  {
    review_id: "d2",
    author: "Arjun Mehta",
    rating: 5,
    published_at_text: "2 weeks ago",
    text: "Booked a table for my parents' anniversary and the team made it special with a little dessert and a candle. Lovely people.",
    photos: ["cake", "table"],
    owner_response: {
      text: "Thank you, Arjun! It was a joy to be part of your parents' day. Please pass on our wishes, and come back for the next one.",
    },
  },
  {
    review_id: "d3",
    author: "Liam O'Connor",
    rating: 5,
    published_at_text: "3 weeks ago",
    text: "Best flat white in the city. Full stop.",
  },
  {
    review_id: "d4",
    author: "Sofia Alvarez",
    rating: 5,
    published_at_text: "3 weeks ago",
    text: "Cosy, bright and never too loud. Great for working a few hours with a latte. Wifi is fast too!",
  },
  {
    review_id: "d5",
    author: "Aisha Khan",
    rating: 5,
    published_at_text: "a month ago",
    text: "I have coeliac disease and eating out is usually stressful. Here the staff knew exactly which dishes were safe, the kitchen changed gloves without being asked and the gluten-free pancakes were honestly better than the normal ones I remember. Thank you for making it easy.",
    photos: ["pancakes", "salad", "latte"],
    owner_response: {
      text: "Aisha, this means a lot to our kitchen team. We take gluten-free seriously and we're so glad you could relax and enjoy your meal. See you soon!",
    },
  },
  {
    review_id: "d6",
    author: "Daniel Okafor",
    rating: 5,
    published_at_text: "a month ago",
    text: "Freshly baked croissants every morning and you can taste it. Friendly service even on a busy Sunday.",
    photos: ["croissant"],
  },
  {
    review_id: "d7",
    author: "Hannah Weber",
    rating: 5,
    published_at_text: "a month ago",
    text: "Came for the pastries, stayed for the carrot cake. Easily five stars.",
  },
  {
    review_id: "d8",
    author: "Rohan Kapoor",
    rating: 5,
    published_at_text: "2 months ago",
    text: "Quick service, fair prices and a menu with real vegan options. Our office orders lunch from here every Friday and nobody has complained once - that says a lot.",
  },
  {
    review_id: "d9",
    author: "Chen Wei",
    rating: 5,
    published_at_text: "3 months ago",
    text: "Small place, big flavours. The cardamom bun is worth the trip on its own.",
  },
];

/**
 * The demo business. Photos live in /public/demo; the widget only draws
 * http(s) images, so they are given the page's own origin.
 */
export function demoData(origin: string): PreviewData {
  return {
    placeId: "demo",
    placeName: "Bella Vista Café",
    business: { name: "Bella Vista Café", overall_rating: 4.9, total_reviews: 312 },
    link: "https://www.google.com/maps",
    reviews: REVIEWS.map(({ photos = [], ...r }) => ({
      ...r,
      author_photo: null,
      images: origin ? photos.map((p) => `${origin}/demo/${p}.svg`) : [],
    })),
  };
}

export const DEMO_REVIEW_COUNT = REVIEWS.length;
