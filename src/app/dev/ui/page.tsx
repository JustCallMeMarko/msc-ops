import { Suspense } from "react";
import PatternGalleryPage from "@/components/dev/pattern-gallery";

export default function DevUiPage() {
  return <Suspense fallback={<main className="min-h-screen bg-background" />}><PatternGalleryPage /></Suspense>;
}
