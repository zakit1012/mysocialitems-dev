"use client";

import { Suspense } from "react";
import { Header } from "./Header";

export function SiteHeader() {
  return (
    <Suspense fallback={<div className="h-16" />}>
      <Header />
    </Suspense>
  );
}
