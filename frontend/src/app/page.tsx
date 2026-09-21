import { Suspense } from "react";
import HomePage from "./home-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 py-20 text-center">Loading deals...</div>}>
      <HomePage />
    </Suspense>
  );
}
