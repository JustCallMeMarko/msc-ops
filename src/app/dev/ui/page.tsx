import { Suspense } from "react";
import { notFound } from "next/navigation";
import PatternGalleryPage from "@/components/dev/pattern-gallery";

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Suspense fallback={<main className="min-h-screen bg-background" />}><PatternGalleryPage /></Suspense>;
}
