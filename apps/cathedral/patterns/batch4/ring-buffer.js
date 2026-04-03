/**
 * Ring Buffer — fixed-size circular buffer
 * createRingBuffer(capacity) → { push, get, toArray, isFull, size }
 */
function createRingBuffer(capacity) {
  const buffer = new Array(capacity);
  let writeIndex = 0;
  let count = 0;

  function push(value) {
    buffer[writeIndex] = value;
    writeIndex = (writeIndex + 1) % capacity;
    if (count < capacity) count++;
  }

  function get(index) {
    if (index < 0 || index >= count) return undefined;
    if (count < capacity) {
      return buffer[index];
    }
    // When full, oldest element is at writeIndex
    const actualIndex = (writeIndex + index) % capacity;
    return buffer[actualIndex];
  }

  function toArray() {
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(get(i));
    }
    return result;
  }

  function isFull() {
    return count === capacity;
  }

  function size() {
    return count;
  }

  return { push, get, toArray, isFull, size };
}

module.exports = { createRingBuffer };
