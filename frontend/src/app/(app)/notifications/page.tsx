import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/components/ui/misc";
import { NotificationsPage } from "@/features/notifications/notifications-page";

export const metadata: Metadata = { title: "Notifikasi" };

export default function Page() {
  return <Suspense fallback={<PageFallback />}><NotificationsPage /></Suspense>;
}
