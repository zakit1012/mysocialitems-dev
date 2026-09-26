/**
 * FAQ answers that do not depend on the plans. The home page shows them
 * (with the plan-based ones in between) and also sends them to search
 * engines as FAQPage data, so both always say the same thing.
 */
export const FAQ = {
  access: {
    q: "Do I need to log in to Google or give you access?",
    a: "No. Search for your business by name or paste its Google Maps link, and we find its public reviews. You only add businesses you own or are allowed to represent.",
  },
  websites: {
    q: "Which websites does it work on?",
    a: "Any website where you can paste a small piece of HTML: WordPress, Shopify, Wix, Webflow, Squarespace, Framer or a site you coded yourself.",
  },
  fiveStar: {
    q: "Why only 5-star reviews?",
    a: "Your widget highlights your happiest customers. It still shows your overall Google rating, your total number of reviews and a button to read every review on Google.",
  },
  speed: {
    q: "Will it slow down my website?",
    a: "No. The widget is one small script that loads in the background, after your page, and only draws where you place it.",
  },
  cancel: {
    q: "Can I cancel any time?",
    a: "Yes, from the Billing page. You keep your paid plan until the end of the month or year you paid for. Your first payment can be refunded within 7 days.",
  },
};
