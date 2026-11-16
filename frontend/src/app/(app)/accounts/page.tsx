import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { AccountsPage } from "@/features/accounts/accounts-page";

export const metadata: Metadata = { title: "Akun" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AccountsPage />
    </Suspense>
  );
}