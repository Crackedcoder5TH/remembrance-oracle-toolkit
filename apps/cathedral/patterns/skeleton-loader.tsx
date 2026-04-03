// Skeleton loader — shimmer animation placeholder for loading states
// Composable line and card skeletons with aria-busy support

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <div className="h-3 rounded-md skeleton-shimmer" style={{ width }} />;
}

function SkeletonCard() {
  return (
    <div className="cathedral-surface p-4 sm:p-6 space-y-4 animate-pulse">
      <SkeletonLine width="40%" />
      <SkeletonLine />
      <SkeletonLine width="75%" />
      <div className="flex justify-between pt-2">
        <SkeletonLine width="30%" />
        <SkeletonLine width="20%" />
      </div>
    </div>
  );
}

function SkeletonWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">Loading...</span>
      {children}
    </div>
  );
}

export { SkeletonLine, SkeletonCard, SkeletonWrapper };
