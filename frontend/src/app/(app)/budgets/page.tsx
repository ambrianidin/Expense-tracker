import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { BudgetsPage } from "@/features/budgets/budgets-page";

export const metadata: Metadata = { title: "Budget" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <BudgetsPage />
    </Suspense>
  );
}