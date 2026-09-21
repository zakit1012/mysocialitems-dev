"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Category, Deal } from "@/lib/types";
import { Button } from "./Button";
import { TextField, fieldClass } from "./TextField";

type Props = {
  deal?: Deal;
};

export function DealForm({ deal }: Props) {
  const { token } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: deal?.title ?? "",
    description: deal?.description ?? "",
    highlights: deal?.highlights?.join("\n") ?? "",
    imageUrl: deal?.imageUrl ?? "",
    originalPrice: deal?.originalPrice?.toString() ?? "",
    dealPrice: deal?.dealPrice?.toString() ?? "",
    city: deal?.city ?? "",
    location: deal?.location ?? "",
    stock: deal?.stock?.toString() ?? "20",
    validUntil: deal
      ? deal.validUntil.slice(0, 10)
      : new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10),
    categoryId: deal?.category?.id ?? "",
    featured: deal?.featured ?? false,
  });

  useEffect(() => {
    api<Category[]>("/categories").then((items) => {
      setCategories(items);
      setForm((current) => ({
        ...current,
        categoryId: current.categoryId || items[0]?.id || "",
      }));
    });
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const original = Number(form.originalPrice);
  const price = Number(form.dealPrice);
  const discount =
    original > 0 && price > 0 && price < original
      ? Math.round(((original - price) / original) * 100)
      : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      ...form,
      originalPrice: Number(form.originalPrice),
      dealPrice: Number(form.dealPrice),
      stock: Number(form.stock),
    };
    try {
      if (deal) {
        await api(`/deals/${deal.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(payload),
        });
      } else {
        await api("/deals", {
          method: "POST",
          token,
          body: JSON.stringify(payload),
        });
      }
      router.push("/merchant");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save deal");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <Section title="The offer" hint="What guests are buying.">
        <TextField
          label="Deal title"
          required
          minLength={3}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Weekend loft with canal view"
        />
        <Field label="Description" hint="What they get, when they can come, any fine print.">
          <textarea
            required
            minLength={20}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className={`${fieldClass} h-32 border-line`}
            placeholder="Two nights in a bright canal loft for two, with coffee, bikes and a local breakfast basket on arrival."
          />
        </Field>
        <Field label="Highlights" hint="One per line — these show as ticks on the deal page.">
          <textarea
            value={form.highlights}
            onChange={(e) => set("highlights", e.target.value)}
            className={`${fieldClass} h-24 border-line`}
            placeholder={"2 nights for 2 guests\nBreakfast basket\nCity bikes included"}
          />
        </Field>
        <TextField
          label="Image URL"
          required
          type="url"
          value={form.imageUrl}
          onChange={(e) => set("imageUrl", e.target.value)}
          placeholder="https://images.unsplash.com/..."
        />
      </Section>

      <Section title="Price and stock" hint="The discount is worked out for you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Original price"
            required
            type="number"
            min={0}
            step="0.01"
            value={form.originalPrice}
            onChange={(e) => set("originalPrice", e.target.value)}
            placeholder="420.00"
          />
          <TextField
            label="My Social Items price"
            required
            type="number"
            min={0}
            step="0.01"
            value={form.dealPrice}
            onChange={(e) => set("dealPrice", e.target.value)}
            placeholder="219.00"
          />
        </div>

        {discount !== null && (
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3.5 py-1.5 text-sm font-semibold text-brand-dark">
            Guests save {discount}%
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Vouchers in stock"
            required
            type="number"
            min={1}
            value={form.stock}
            onChange={(e) => set("stock", e.target.value)}
          />
          <TextField
            label="Valid until"
            required
            type="date"
            value={form.validUntil}
            onChange={(e) => set("validUntil", e.target.value)}
          />
        </div>
      </Section>

      <Section title="Where and what" hint="Helps guests find you in search and filters.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="City"
            required
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Amsterdam"
          />
          <TextField
            label="Address / venue"
            required
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Prinsengracht 88, Amsterdam"
          />
        </div>

        <Field label="Category">
          <select
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className={`${fieldClass} border-line`}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-start gap-3 rounded-2xl border border-line bg-sand px-4 py-3.5">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => set("featured", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Feature this deal on the homepage
            </span>
            <span className="block text-sm text-muted">
              Featured deals appear in “Today’s picks”.
            </span>
          </span>
        </label>
      </Section>

      {error && (
        <p className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>
      )}

      <Button type="submit" loading={saving} className="sm:w-auto sm:px-8">
        {deal ? "Save changes" : "Publish deal"}
      </Button>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-4xl border border-line/60 bg-card p-6 shadow-card">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      {children}
    </label>
  );
}
