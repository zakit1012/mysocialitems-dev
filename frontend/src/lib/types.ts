export type User = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "MERCHANT" | "ADMIN" | string;
  city?: string | null;
};
