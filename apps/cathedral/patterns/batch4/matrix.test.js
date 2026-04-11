const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('matrix operations', () => {
  it('should multiply two matrices', () => {
    const a = [[1, 2], [3, 4]];
    const b = [[5, 6], [7, 8]];
    assert.deepStrictEqual(matrixMultiply(a, b), [[19, 22], [43, 50]]);
  });

  it('should multiply non-square matrices', () => {
    const a = [[1, 2, 3]];
    const b = [[4], [5], [6]];
    assert.deepStrictEqual(matrixMultiply(a, b), [[32]]);
  });

  it('should transpose a matrix', () => {
    const m = [[1, 2, 3], [4, 5, 6]];
    assert.deepStrictEqual(matrixTranspose(m), [[1, 4], [2, 5], [3, 6]]);
  });

  it('should add two matrices', () => {
    const a = [[1, 2], [3, 4]];
    const b = [[5, 6], [7, 8]];
    assert.deepStrictEqual(matrixAdd(a, b), [[6, 8], [10, 12]]);
  });

  it('should throw on incompatible dimensions for multiply', () => {
    const a = [[1, 2]];
    const b = [[1, 2]];
    assert.throws(() => matrixMultiply(a, b), { message: /Incompatible/ });
  });

  it('should throw on incompatible dimensions for add', () => {
    const a = [[1, 2]];
    const b = [[1], [2]];
    assert.throws(() => matrixAdd(a, b), { message: /same dimensions/ });
  });
});
