import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { SettingsPage } from "@/features/settings/settings-page";

export const metadata: Metadata = { title: "Pengaturan" };



export default function Page() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SettingsPage />
    </Suspense>
  );
}