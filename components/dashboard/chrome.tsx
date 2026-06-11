"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

function ChromeInner({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const solo = useSearchParams().get("solo") === "1";
  if (solo) return <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>;
  return (
    <>
      {sidebar}
      <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
    </>
  );
}

// useSearchParams requiere Suspense en App Router.
export function Chrome({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={<main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>}>
      <ChromeInner sidebar={sidebar}>{children}</ChromeInner>
    </Suspense>
  );
}
