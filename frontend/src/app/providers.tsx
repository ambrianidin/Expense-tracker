"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { ApiError, UNAUTHORIZED_EVENT } from "@/lib/api/client";

function notifyUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: notifyUnauthorized }),
        mutationCache: new MutationCache({ onError: notifyUnauthorized }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast:
              "!rounded-2xl !border !border-line !bg-surface !text-ink !shadow-lift !font-sans !text-sm",
            description: "!text-ink-soft",
          },
        }}
      />
    </QueryClientProvider>
  );
}
