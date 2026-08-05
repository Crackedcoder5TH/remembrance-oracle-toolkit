// @oracle-infrastructure — experiment/example/app scaffolding, not substrate periodic-table elements
// Shape-fallback pattern: when bridging legacy + new field names, return
// `legacy || new || {}` so callers expecting either shape both work.
// Example: analyzer migrated `dimensions` → `breakdown`, bridge maps back.
return {
  score: coherency.total,
  dimensions: coherency.dimensions || coherency.breakdown || {},
};
