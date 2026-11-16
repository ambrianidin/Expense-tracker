import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { ReportsPage } from "@/features/reports/reports-page";

export const metadata: Metadata = { title: "Laporan" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ReportsPage />
    </Suspense>
  );
}