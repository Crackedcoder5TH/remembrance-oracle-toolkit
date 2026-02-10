// Test for quickSort (validator concatenates code + test, so quickSort is already in scope)
const _assert = (cond, msg) => { if (!cond) throw new Error(msg); };

_assert(JSON.stringify(quickSort([3,1,2])) === '[1,2,3]', 'basic sort failed');
_assert(JSON.stringify(quickSort([])) === '[]', 'empty array failed');
_assert(JSON.stringify(quickSort([1])) === '[1]', 'single element failed');
_assert(JSON.stringify(quickSort([5,3,8,1,9,2])) === '[1,2,3,5,8,9]', 'larger array failed');
_assert(JSON.stringify(quickSort([1,1,1])) === '[1,1,1]', 'duplicates failed');
console.log('All quickSort tests passed!');
