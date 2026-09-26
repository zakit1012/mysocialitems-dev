import type { PreviewData } from "@/components/widget/WidgetPreview";

/**
 * A made-up business and made-up reviews for the home page demo and the
 * marketing screenshots. Never real people's reviews.
 */
export const DEMO_DATA: PreviewData = {
  placeId: "demo",
  placeName: "Bella Vista Café",
  business: { name: "Bella Vista Café", overall_rating: 4.9, total_reviews: 312 },
  link: "https://www.google.com/maps",
  reviews: [
    {
      review_id: "d1",
      author: "Maya Thompson",
      rating: 5,
      published_at_text: "a week ago",
      text: "The best brunch spot in town. The avocado toast is perfect, the coffee is strong and the staff remember your order after one visit.",
    },
    {
      review_id: "d2",
      author: "Arjun Mehta",
      rating: 5,
      published_at_text: "2 weeks ago",
      text: "Booked a table for my parents' anniversary and the team made it special with a little dessert and a candle. Lovely people.",
    },
    {
      review_id: "d3",
      author: "Sofia Alvarez",
      rating: 5,
      published_at_text: "3 weeks ago",
      text: "Cosy, bright and never too loud. Great for working a few hours with a latte. Wifi is fast too!",
    },
    {
      review_id: "d4",
      author: "Daniel Okafor",
      rating: 5,
      published_at_text: "a month ago",
      text: "Freshly baked croissants every morning and you can taste it. Friendly service even on a busy Sunday.",
    },
    {
      review_id: "d5",
      author: "Hannah Weber",
      rating: 5,
      published_at_text: "a month ago",
      text: "Came for the pastries, stayed for the carrot cake. Easily five stars.",
    },
    {
      review_id: "d6",
      author: "Rohan Kapoor",
      rating: 5,
      published_at_text: "2 months ago",
      text: "Quick service, fair prices and a menu with real vegan options. Our office orders lunch from here every Friday.",
    },
  ].map((r) => ({ ...r, author_photo: null, images: [] })),
};
