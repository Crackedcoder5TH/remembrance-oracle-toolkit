/**
 * Linked List — singly linked list data structure
 * createLinkedList() → { append, prepend, toArray, size, find, remove }
 */
function createLinkedList() {
  let head = null;
  let length = 0;

  function append(value) {
    const node = { value, next: null };
    if (!head) {
      head = node;
    } else {
      let current = head;
      while (current.next) {
        current = current.next;
      }
      current.next = node;
    }
    length++;
  }

  function prepend(value) {
    const node = { value, next: head };
    head = node;
    length++;
  }

  function toArray() {
    const result = [];
    let current = head;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }

  function size() {
    return length;
  }

  function find(predicate) {
    let current = head;
    while (current) {
      if (predicate(current.value)) {
        return current.value;
      }
      current = current.next;
    }
    return undefined;
  }

  function remove(value) {
    if (!head) return false;
    if (head.value === value) {
      head = head.next;
      length--;
      return true;
    }
    let current = head;
    while (current.next) {
      if (current.next.value === value) {
        current.next = current.next.next;
        length--;
        return true;
      }
      current = current.next;
    }
    return false;
  }

  return { append, prepend, toArray, size, find, remove };
}

module.exports = { createLinkedList };
