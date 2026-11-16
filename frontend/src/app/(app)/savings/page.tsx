import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { SavingsPage } from "@/features/savings/savings-page";

export const metadata: Metadata = { title: "Tabungan" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SavingsPage />
    </Suspense>
  );
}