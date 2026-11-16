import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { TransactionsPage } from "@/features/transactions/transactions-page";

export const metadata: Metadata = { title: "Transaksi" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <TransactionsPage />
    </Suspense>
  );
}