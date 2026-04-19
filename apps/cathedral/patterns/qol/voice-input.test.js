const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createVoiceInput', function() {
  it('returns an object with the correct methods', function() {
    const vi = createVoiceInput();
    assert.equal(typeof vi.isSupported, 'function');
    assert.equal(typeof vi.start, 'function');
    assert.equal(typeof vi.stop, 'function');
    assert.equal(typeof vi.isListening, 'function');
  });

  it('isSupported returns a boolean', function() {
    const vi = createVoiceInput();
    const result = vi.isSupported();
    assert.equal(typeof result, 'boolean');
  });

  it('isListening starts as false', function() {
    const vi = createVoiceInput();
    assert.equal(vi.isListening(), false);
  });

  it('accepts options with lang property', function() {
    const vi = createVoiceInput({ lang: 'fr-FR' });
    assert.ok(vi);
    assert.equal(typeof vi.start, 'function');
  });

  it('stop sets listening to false', function() {
    const vi = createVoiceInput();
    vi.stop();
    assert.equal(vi.isListening(), false);
  });

  it('start returns false when not supported (no window)', function() {
    const vi = createVoiceInput();
    const result = vi.start(function() {}, function() {});
    assert.equal(result, false);
  });
});
