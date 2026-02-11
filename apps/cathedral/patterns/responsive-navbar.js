// Responsive-navbar — mobile-first nav with hamburger menu
// Includes escape-to-close and aria-expanded support

function createNavState() {
  let mobileOpen = false;

  function toggle() { mobileOpen = !mobileOpen; return mobileOpen; }
  function open() { mobileOpen = true; return mobileOpen; }
  function close() { mobileOpen = false; return mobileOpen; }
  function isOpen() { return mobileOpen; }

  function handleKeyDown(key) {
    if (key === 'Escape' && mobileOpen) {
      close();
      return true;
    }
    return false;
  }

  function getAriaLabel() {
    return mobileOpen ? 'Close menu' : 'Open menu';
  }

  return { toggle, open, close, isOpen, handleKeyDown, getAriaLabel };
}

function buildNavItems(items, activeId) {
  return items.map(item => ({
    ...item,
    ariaCurrent: item.id === activeId ? 'page' : undefined,
    active: item.id === activeId,
  }));
}

module.exports = { createNavState, buildNavItems };
