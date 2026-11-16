import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { Onboarding } from "@/features/accounts/onboarding";

export const metadata: Metadata = { title: "Mulai" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Onboarding />
    </Suspense>
  );
}