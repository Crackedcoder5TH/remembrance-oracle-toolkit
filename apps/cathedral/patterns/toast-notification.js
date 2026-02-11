// Toast notification system — hook + container
// Non-intrusive success/error/info toasts with auto-dismiss and stacking

const MAX_TOASTS = 5;
const TOAST_DURATION = 2500;
const EXIT_DURATION = 250;

function createToastManager() {
  let toasts = [];
  let listeners = [];

  function subscribe(fn) { listeners.push(fn); return () => { listeners = listeners.filter(l => l !== fn); }; }
  function notify() { listeners.forEach(fn => fn([...toasts])); }

  function addToast(message, type = 'info') {
    const id = Math.random().toString(36).slice(2);
    toasts = [...toasts.slice(-(MAX_TOASTS - 1)), { id, message, type, exiting: false }];
    notify();
    setTimeout(() => {
      toasts = toasts.map(t => t.id === id ? { ...t, exiting: true } : t);
      notify();
    }, TOAST_DURATION);
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      notify();
    }, TOAST_DURATION + EXIT_DURATION);
  }

  return { addToast, subscribe, getToasts: () => [...toasts] };
}

module.exports = { createToastManager, MAX_TOASTS, TOAST_DURATION, EXIT_DURATION };
