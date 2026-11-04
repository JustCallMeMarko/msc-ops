export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-secondary ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="mt-8 h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
    </div>
  );
}
