/**
 * Native Python Seed Patterns — idiomatic Python, not transpiled JS.
 *
 * Each pattern uses Python conventions: list comprehensions, generators,
 * decorators, context managers, type hints, dataclasses.
 */

const PYTHON_SEEDS = [
  // ─── Data Structures ───
  {
    name: 'lru-cache-py',
    code: `from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key):
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)`,
    testCode: `cache = LRUCache(2)
cache.put(1, 1)
cache.put(2, 2)
assert cache.get(1) == 1
cache.put(3, 3)
assert cache.get(2) == -1
assert cache.get(3) == 3`,
    language: 'python',
    description: 'LRU cache using OrderedDict — O(1) get/put',
    tags: ['cache', 'data-structure', 'lru', 'python-native'],
    patternType: 'data-structure',
  },
  {
    name: 'defaultdict-counter-py',
    code: `from collections import defaultdict

def word_frequency(text: str) -> dict:
    freq = defaultdict(int)
    for word in text.lower().split():
        freq[word] += 1
    return dict(sorted(freq.items(), key=lambda x: -x[1]))`,
    testCode: `result = word_frequency("the cat sat on the mat")
assert result["the"] == 2
assert result["cat"] == 1
assert list(result.keys())[0] == "the"`,
    language: 'python',
    description: 'Word frequency counter using defaultdict',
    tags: ['string', 'counter', 'frequency', 'python-native'],
    patternType: 'utility',
  },
  // ─── Algorithms ───
  {
    name: 'binary-search-py',
    code: `from bisect import bisect_left

def binary_search(arr: list, target) -> int:
    i = bisect_left(arr, target)
    if i != len(arr) and arr[i] == target:
        return i
    return -1`,
    testCode: `assert binary_search([1, 2, 3, 4, 5], 3) == 2
assert binary_search([1, 2, 3, 4, 5], 1) == 0
assert binary_search([1, 2, 3, 4, 5], 6) == -1
assert binary_search([], 1) == -1`,
    language: 'python',
    description: 'Binary search using bisect — idiomatic Python',
    tags: ['search', 'algorithm', 'bisect', 'python-native'],
    patternType: 'algorithm',
  },
  {
    name: 'merge-sort-py',
    code: `def merge_sort(arr: list) -> list:
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return _merge(left, right)

def _merge(left: list, right: list) -> list:
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result`,
    testCode: `assert merge_sort([3, 1, 4, 1, 5]) == [1, 1, 3, 4, 5]
assert merge_sort([]) == []
assert merge_sort([1]) == [1]
assert merge_sort([5, 4, 3, 2, 1]) == [1, 2, 3, 4, 5]`,
    language: 'python',
    description: 'Merge sort — stable O(n log n)',
    tags: ['sort', 'algorithm', 'merge-sort', 'python-native'],
    patternType: 'algorithm',
  },
  // ─── Utilities ───
  {
    name: 'flatten-py',
    code: `def flatten(lst, depth=-1):
    result = []
    for item in lst:
        if isinstance(item, list) and depth != 0:
            result.extend(flatten(item, depth - 1))
        else:
            result.append(item)
    return result`,
    testCode: `assert flatten([1, [2, [3, [4]]]]) == [1, 2, 3, 4]
assert flatten([1, [2, [3]]], depth=1) == [1, 2, [3]]
assert flatten([]) == []
assert flatten([[1], [2], [3]]) == [1, 2, 3]`,
    language: 'python',
    description: 'Flatten nested lists with optional depth limit',
    tags: ['list', 'flatten', 'utility', 'python-native'],
    patternType: 'utility',
  },
  {
    name: 'retry-decorator-py',
    code: `import time
import functools

def retry(max_attempts=3, delay=1.0, backoff=2.0, exceptions=(Exception,)):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            current_delay = delay
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        time.sleep(current_delay)
                        current_delay *= backoff
            raise last_exception
        return wrapper
    return decorator`,
    testCode: `call_count = 0
@retry(max_attempts=3, delay=0.01)
def flaky():
    global call_count
    call_count += 1
    if call_count < 3:
        raise ValueError("not yet")
    return "ok"
assert flaky() == "ok"
assert call_count == 3`,
    language: 'python',
    description: 'Retry decorator with exponential backoff',
    tags: ['decorator', 'retry', 'resilience', 'python-native'],
    patternType: 'utility',
  },
  {
    name: 'dataclass-builder-py',
    code: `from dataclasses import dataclass, field, asdict
from typing import List, Optional

@dataclass
class Config:
    host: str = "localhost"
    port: int = 8080
    debug: bool = False
    tags: List[str] = field(default_factory=list)
    secret: Optional[str] = None

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict):
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})`,
    testCode: `c = Config(host="0.0.0.0", port=3000, tags=["api"])
assert c.host == "0.0.0.0"
assert c.port == 3000
d = c.to_dict()
assert d["host"] == "0.0.0.0"
c2 = Config.from_dict({"host": "prod", "port": 443, "extra": "ignored"})
assert c2.host == "prod"
assert c2.debug == False`,
    language: 'python',
    description: 'Dataclass with serialization and builder pattern',
    tags: ['dataclass', 'config', 'builder', 'python-native'],
    patternType: 'design-pattern',
  },
  {
    name: 'context-manager-py',
    code: `from contextlib import contextmanager
import time

@contextmanager
def timer(label="elapsed"):
    start = time.perf_counter()
    yield lambda: time.perf_counter() - start
    elapsed = time.perf_counter() - start
    print(f"{label}: {elapsed:.4f}s")`,
    testCode: `with timer("test") as get_elapsed:
    total = sum(range(1000))
    assert get_elapsed() >= 0
assert total == 499500`,
    language: 'python',
    description: 'Context manager timer using contextlib',
    tags: ['context-manager', 'timer', 'utility', 'python-native'],
    patternType: 'utility',
  },
  {
    name: 'generator-pipeline-py',
    code: `def chunked(iterable, size):
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk

def batched_map(iterable, fn, batch_size=100):
    for batch in chunked(iterable, batch_size):
        yield from (fn(item) for item in batch)`,
    testCode: `assert list(chunked([1,2,3,4,5], 2)) == [[1,2], [3,4], [5]]
assert list(chunked([], 3)) == []
assert list(batched_map([1,2,3], lambda x: x*2, 2)) == [2, 4, 6]`,
    language: 'python',
    description: 'Generator-based chunking and batch processing pipeline',
    tags: ['generator', 'pipeline', 'batch', 'python-native'],
    patternType: 'utility',
  },
  {
    name: 'type-guard-py',
    code: `from typing import TypeGuard, Any, Union

def is_str_list(val: Any) -> TypeGuard[list[str]]:
    return isinstance(val, list) and all(isinstance(x, str) for x in val)

def is_int(val: Any) -> TypeGuard[int]:
    return isinstance(val, int) and not isinstance(val, bool)

def safe_cast(val: Any, target_type: type, default=None):
    try:
        return target_type(val)
    except (ValueError, TypeError):
        return default`,
    testCode: `assert is_str_list(["a", "b"]) == True
assert is_str_list([1, 2]) == False
assert is_str_list("not a list") == False
assert is_int(42) == True
assert is_int(True) == False
assert safe_cast("123", int) == 123
assert safe_cast("abc", int, 0) == 0`,
    language: 'python',
    description: 'Type guards and safe casting utilities',
    tags: ['typing', 'guard', 'validation', 'python-native'],
    patternType: 'validation',
  },
];

module.exports = { PYTHON_SEEDS };
