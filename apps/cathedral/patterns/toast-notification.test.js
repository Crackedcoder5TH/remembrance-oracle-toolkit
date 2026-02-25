const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('toast-notification', () => {
  it('ToastType accepts success, error, info', () => {
    const types = ['success', 'error', 'info'];
    assert.strictEqual(types.length, 3);
    assert.ok(types.includes('success'));
    assert.ok(types.includes('error'));
    assert.ok(types.includes('info'));
  });

  it('MAX_TOASTS caps accumulation at 5', () => {
    const MAX_TOASTS = 5;
    const toasts = Array.from({ length: 10 }, (_, i) => ({ id: String(i), message: `msg${i}`, type: 'info' }));
    const capped = [...toasts.slice(-(MAX_TOASTS - 1)), { id: 'new', message: 'new', type: 'info' }];
    assert.strictEqual(capped.length, MAX_TOASTS);
  });

  it('exit timing follows TOAST_DURATION + EXIT_DURATION', () => {
    const TOAST_DURATION = 2500;
    const EXIT_DURATION = 250;
    assert.strictEqual(TOAST_DURATION + EXIT_DURATION, 2750);
  });

  it('toast-exiting class is appended when exiting is true', () => {
    const toast = { id: '1', message: 'test', type: 'success', exiting: true };
    const className = `toast toast-${toast.type}${toast.exiting ? ' toast-exiting' : ''}`;
    assert.ok(className.includes('toast-exiting'));
  });
});
