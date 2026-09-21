export type User = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "MERCHANT" | "ADMIN" | string;
  city?: string | null;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  _count?: { deals: number };
};

export type Deal = {
  id: string;
  title: string;
  slug: string;
  description: string;
  highlights: string[];
  imageUrl: string;
  originalPrice: number;
  dealPrice: number;
  discountPercent: number;
  city: string;
  location: string;
  stock: number;
  soldCount: number;
  validUntil: string;
  featured: boolean;
  category: Category;
  merchant: { id: string; name: string; city?: string | null };
  avgRating: number;
  reviewCount: number;
  favorited?: boolean;
  reviews?: Array<{
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    user: { id: string; name: string };
  }>;
};

export type Voucher = {
  id: string;
  code: string;
  status: string;
  quantity: number;
  totalPaid: number;
  purchasedAt: string;
  redeemedAt?: string | null;
  deal: {
    id: string;
    title: string;
    imageUrl: string;
    city: string;
    location?: string;
    validUntil?: string;
  };
  user?: { id: string; name: string; email: string };
};
