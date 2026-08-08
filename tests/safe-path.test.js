const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { safePath, safeFilename } = require('../src/core/safe-path');

describe('safePath', () => {
  const baseDir = '/home/user/project/.remembrance';

  it('allows a simple relative path within baseDir', () => {
    const result = safePath('oracle.db', baseDir);
    assert.equal(result, path.join(baseDir, 'oracle.db'));
  });

  it('allows a nested relative path within baseDir', () => {
    const result = safePath('sub/dir/file.json', baseDir);
    assert.equal(result, path.join(baseDir, 'sub', 'dir', 'file.json'));
  });

  it('allows the baseDir itself', () => {
    const result = safePath('.', baseDir);
    assert.equal(result, path.resolve(baseDir));
  });

  it('allows an empty string (resolves to baseDir)', () => {
    const result = safePath('', baseDir);
    assert.equal(result, path.resolve(baseDir));
  });

  it('blocks ../  traversal escaping the base directory', () => {
    assert.throws(
      () => safePath('../../../etc/passwd', baseDir),
      (err) => {
        assert(err.message.includes('Path traversal detected'));
        return true;
      }
    );
  });

  it('blocks ../ traversal one level up', () => {
    assert.throws(
      () => safePath('../secret.txt', baseDir),
      (err) => {
        assert(err.message.includes('Path traversal detected'));
        return true;
      }
    );
  });

  it('blocks an absolute path outside the base directory', () => {
    assert.throws(
      () => safePath('/etc/passwd', baseDir),
      (err) => {
        assert(err.message.includes('Path traversal detected'));
        return true;
      }
    );
  });

  it('blocks a path that starts with baseDir as a prefix but is a sibling', () => {
    // e.g. baseDir = /home/user/project/.remembrance
    // attack: /home/user/project/.remembrance-evil/file
    assert.throws(
      () => safePath('../.remembrance-evil/file', baseDir),
      (err) => {
        assert(err.message.includes('Path traversal detected'));
        return true;
      }
    );
  });

  it('allows a path that traverses internally but stays within base', () => {
    // sub/../file.json resolves to /baseDir/file.json — still inside
    const result = safePath('sub/../file.json', baseDir);
    assert.equal(result, path.join(baseDir, 'file.json'));
  });

  it('blocks a deeply nested traversal that escapes', () => {
    assert.throws(
      () => safePath('a/b/c/../../../../etc/shadow', baseDir),
      (err) => {
        assert(err.message.includes('Path traversal detected'));
        return true;
      }
    );
  });
});

describe('safeFilename', () => {
  it('returns the basename of a simple filename', () => {
    assert.equal(safeFilename('file.txt'), 'file.txt');
  });

  it('strips directory components', () => {
    assert.equal(safeFilename('/etc/passwd'), 'passwd');
  });

  it('strips relative directory components', () => {
    assert.equal(safeFilename('../../secret.txt'), 'secret.txt');
  });

  it('strips ../ sequences before taking basename', () => {
    // '../' removed first leaves '..file' which becomes 'file' after .. removal,
    // then basename('file') = 'file'
    assert.equal(safeFilename('../..file'), 'file');
  });

  it('handles double-dot injection in filename', () => {
    // '../' is removed first, then basename is taken
    const result = safeFilename('....//etc/passwd');
    assert.equal(result, 'passwd');
  });

  it('returns empty string for null input', () => {
    assert.equal(safeFilename(null), '');
  });

  it('returns empty string for empty string input', () => {
    assert.equal(safeFilename(''), '');
  });

  it('returns empty string for undefined input', () => {
    assert.equal(safeFilename(undefined), '');
  });

  it('handles numeric input by converting to string', () => {
    assert.equal(safeFilename(12345), '12345');
  });

  it('strips path separators on Windows-style paths', () => {
    // path.basename handles both / and \ on the current platform
    const result = safeFilename('dir/subdir/file.js');
    assert.equal(result, 'file.js');
  });
});
