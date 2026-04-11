function createCommandPalette(commands) {
  const items = commands || [];

  function search(query) {
    if (!query || !query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(function(item) {
      return item.label.toLowerCase().includes(q) ||
        (item.tags && item.tags.some(function(t) { return t.toLowerCase().includes(q); }));
    });
  }

  function execute(id) {
    const item = items.find(function(i) { return i.id === id; });
    if (item && item.action) { item.action(); return true; }
    return false;
  }

  function getById(id) {
    return items.find(function(i) { return i.id === id; }) || null;
  }

  return { search, execute, getById, items: items };
}
module.exports = { createCommandPalette };
