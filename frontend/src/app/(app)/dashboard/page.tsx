import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { Dashboard } from "@/features/dashboard/dashboard";

export const metadata: Metadata = { title: "Beranda" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Dashboard />
    </Suspense>
  );
}