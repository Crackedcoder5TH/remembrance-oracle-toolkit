// Breadcrumb-nav — semantic breadcrumb navigation with aria support
// Generates breadcrumb trail data from section hierarchy

function buildBreadcrumbs(section, labels) {
  const trail = [{ id: 'home', label: 'Home', current: false }];
  if (section && section !== 'home') {
    trail.push({
      id: section,
      label: (labels && labels[section]) || section,
      current: true,
    });
  } else {
    trail[0].current = true;
  }
  return trail;
}

function getBreadcrumbAriaLabel() {
  return 'Breadcrumb';
}

module.exports = { buildBreadcrumbs, getBreadcrumbAriaLabel };
