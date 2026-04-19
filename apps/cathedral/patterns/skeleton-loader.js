// Skeleton loader — shimmer animation config for loading states
// Composable line and card skeletons with aria-busy support

const SKELETON_CONFIG = {
  lineHeight: '0.75rem',
  borderRadius: '0.375rem',
  animationClass: 'skeleton-shimmer',
  pulseClass: 'animate-pulse',
  ariaBusy: 'true',
  role: 'status',
  srOnlyText: 'Loading...',
};

function getSkeletonLineStyle(width = '100%') {
  return { width, height: SKELETON_CONFIG.lineHeight, borderRadius: SKELETON_CONFIG.borderRadius };
}

function getSkeletonCardLines() {
  return [
    { width: '40%' },
    { width: '100%' },
    { width: '75%' },
    { width: '30%' },
    { width: '20%' },
  ];
}

module.exports = { SKELETON_CONFIG, getSkeletonLineStyle, getSkeletonCardLines };
