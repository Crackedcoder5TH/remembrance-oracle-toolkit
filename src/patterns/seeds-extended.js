/**
 * Extended Seed Patterns — bulk patterns from common utility libraries.
 */
const EXTENDED_SEEDS = [
  // ═══ JavaScript: String Utilities ═══
  { name: 'capitalize', language: 'javascript', patternType: 'utility',
    description: 'Capitalize first letter of string', tags: ['string', 'utility'],
    code: `function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}`,
    testCode: `if (capitalize('hello') !== 'Hello') throw new Error('basic');
if (capitalize('') !== '') throw new Error('empty');
if (capitalize('A') !== 'A') throw new Error('already');` },

  { name: 'camel-case', language: 'javascript', patternType: 'utility',
    description: 'Convert string to camelCase', tags: ['string', 'utility', 'case'],
    code: `function camelCase(str) {
  return str.replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
            .replace(/^[A-Z]/, c => c.toLowerCase());
}`,
    testCode: `if (camelCase('hello-world') !== 'helloWorld') throw new Error('kebab');
if (camelCase('foo_bar') !== 'fooBar') throw new Error('snake');
if (camelCase('Hello World') !== 'helloWorld') throw new Error('space');` },

  { name: 'snake-case', language: 'javascript', patternType: 'utility',
    description: 'Convert string to snake_case', tags: ['string', 'utility', 'case'],
    code: `function snakeCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/[-\\s]+/g, '_').toLowerCase();
}`,
    testCode: `if (snakeCase('helloWorld') !== 'hello_world') throw new Error('camel');
if (snakeCase('hello-world') !== 'hello_world') throw new Error('kebab');
if (snakeCase('Hello World') !== 'hello_world') throw new Error('space');` },

  { name: 'kebab-case', language: 'javascript', patternType: 'utility',
    description: 'Convert string to kebab-case', tags: ['string', 'utility', 'case'],
    code: `function kebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[_\\s]+/g, '-').toLowerCase();
}`,
    testCode: `if (kebabCase('helloWorld') !== 'hello-world') throw new Error('camel');
if (kebabCase('hello_world') !== 'hello-world') throw new Error('snake');
if (kebabCase('Hello World') !== 'hello-world') throw new Error('space');` },

  { name: 'truncate', language: 'javascript', patternType: 'utility',
    description: 'Truncate string to max length with suffix', tags: ['string', 'utility'],
    code: `function truncate(str, maxLen, suffix) {
  suffix = suffix || '...';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - suffix.length) + suffix;
}`,
    testCode: `if (truncate('hello world', 8) !== 'hello...') throw new Error('basic');
if (truncate('hi', 10) !== 'hi') throw new Error('short');
if (truncate('abcdef', 5, '..') !== 'abc..') throw new Error('custom');` },

  { name: 'slugify', language: 'javascript', patternType: 'utility',
    description: 'Convert string to URL-friendly slug', tags: ['string', 'utility', 'url'],
    code: `function slugify(str) {
  return str.toLowerCase().trim()
    .replace(/[^a-z0-9\\s-]/g, '')
    .replace(/[\\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}`,
    testCode: `if (slugify('Hello World!') !== 'hello-world') throw new Error('basic');
if (slugify('  foo  bar  ') !== 'foo-bar') throw new Error('spaces');
if (slugify('a--b') !== 'a-b') throw new Error('dashes');` },

  { name: 'escape-html', language: 'javascript', patternType: 'utility',
    description: 'Escape HTML special characters', tags: ['string', 'security', 'html'],
    code: `function escapeHTML(str) {
  var map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return str.replace(/[&<>"']/g, function(c) { return map[c]; });
}`,
    testCode: `if (escapeHTML('<b>hi</b>') !== '&lt;b&gt;hi&lt;/b&gt;') throw new Error('tags');
if (escapeHTML('a&b') !== 'a&amp;b') throw new Error('amp');
if (escapeHTML('hello') !== 'hello') throw new Error('noop');` },

  { name: 'unescape-html', language: 'javascript', patternType: 'utility',
    description: 'Unescape HTML entities back to characters', tags: ['string', 'html'],
    code: `function unescapeHTML(str) {
  var map = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
  return str.replace(/&(?:amp|lt|gt|quot|#39);/g, function(m) { return map[m]; });
}`,
    testCode: `if (unescapeHTML('&lt;b&gt;') !== '<b>') throw new Error('tags');
if (unescapeHTML('a&amp;b') !== 'a&b') throw new Error('amp');
if (unescapeHTML('hello') !== 'hello') throw new Error('noop');` },

  { name: 'reverse-string', language: 'javascript', patternType: 'utility',
    description: 'Reverse a string', tags: ['string', 'utility'],
    code: `function reverseString(str) {
  return str.split('').reverse().join('');
}`,
    testCode: `if (reverseString('hello') !== 'olleh') throw new Error('basic');
if (reverseString('') !== '') throw new Error('empty');
if (reverseString('a') !== 'a') throw new Error('single');` },

  { name: 'word-count', language: 'javascript', patternType: 'utility',
    description: 'Count words in a string', tags: ['string', 'utility'],
    code: `function wordCount(str) {
  var trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\\s+/).length;
}`,
    testCode: `if (wordCount('hello world') !== 2) throw new Error('two');
if (wordCount('  one  ') !== 1) throw new Error('padded');
if (wordCount('') !== 0) throw new Error('empty');
if (wordCount('a b c d') !== 4) throw new Error('four');` },

  { name: 'title-case', language: 'javascript', patternType: 'utility',
    description: 'Convert string to Title Case', tags: ['string', 'utility', 'case'],
    code: `function titleCase(str) {
  return str.replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
}`,
    testCode: `if (titleCase('hello world') !== 'Hello World') throw new Error('basic');
if (titleCase('foo bar baz') !== 'Foo Bar Baz') throw new Error('three');` },

  { name: 'repeat-string', language: 'javascript', patternType: 'utility',
    description: 'Repeat a string n times', tags: ['string', 'utility'],
    code: `function repeatString(str, n) {
  var result = '';
  for (var i = 0; i < n; i++) result += str;
  return result;
}`,
    testCode: `if (repeatString('ab', 3) !== 'ababab') throw new Error('basic');
if (repeatString('x', 0) !== '') throw new Error('zero');
if (repeatString('', 5) !== '') throw new Error('empty');` },

  { name: 'is-palindrome', language: 'javascript', patternType: 'utility',
    description: 'Check if string is a palindrome', tags: ['string', 'utility', 'validation'],
    code: `function isPalindrome(str) {
  var clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === clean.split('').reverse().join('');
}`,
    testCode: `if (!isPalindrome('racecar')) throw new Error('basic');
if (!isPalindrome('A man a plan a canal Panama')) throw new Error('sentence');
if (isPalindrome('hello')) throw new Error('not palindrome');
if (!isPalindrome('')) throw new Error('empty');` },

  { name: 'count-occurrences', language: 'javascript', patternType: 'utility',
    description: 'Count occurrences of substring in string', tags: ['string', 'utility'],
    code: `function countOccurrences(str, sub) {
  if (!sub.length) return 0;
  var count = 0, pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
  return count;
}`,
    testCode: `if (countOccurrences('abcabc', 'abc') !== 2) throw new Error('two');
if (countOccurrences('hello', 'x') !== 0) throw new Error('none');
if (countOccurrences('aaa', 'a') !== 3) throw new Error('single');` },

  { name: 'pad-string', language: 'javascript', patternType: 'utility',
    description: 'Pad string to target length', tags: ['string', 'utility'],
    code: `function padString(str, len, ch, right) {
  ch = ch || ' ';
  while (str.length < len) {
    str = right ? str + ch : ch + str;
  }
  return str;
}`,
    testCode: `if (padString('5', 3, '0') !== '005') throw new Error('left');
if (padString('5', 3, '0', true) !== '500') throw new Error('right');
if (padString('hello', 3) !== 'hello') throw new Error('longer');` },

  // ═══ JavaScript: Array Utilities ═══
  { name: 'chunk', language: 'javascript', patternType: 'utility',
    description: 'Split array into chunks of given size', tags: ['array', 'utility'],
    code: `function chunk(arr, size) {
  var result = [];
  for (var i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}`,
    testCode: `if (JSON.stringify(chunk([1,2,3,4,5], 2)) !== '[[1,2],[3,4],[5]]') throw new Error('basic');
if (JSON.stringify(chunk([], 3)) !== '[]') throw new Error('empty');
if (JSON.stringify(chunk([1], 5)) !== '[[1]]') throw new Error('small');` },

  { name: 'compact', language: 'javascript', patternType: 'utility',
    description: 'Remove falsy values from array', tags: ['array', 'utility', 'filter'],
    code: `function compact(arr) {
  return arr.filter(Boolean);
}`,
    testCode: `var r = compact([0, 1, false, 2, '', 3, null, undefined]);
if (JSON.stringify(r) !== '[1,2,3]') throw new Error('basic: ' + JSON.stringify(r));
if (compact([]).length !== 0) throw new Error('empty');` },

  { name: 'difference', language: 'javascript', patternType: 'utility',
    description: 'Get items in first array not in second', tags: ['array', 'utility', 'set'],
    code: `function difference(a, b) {
  var set = new Set(b);
  return a.filter(function(x) { return !set.has(x); });
}`,
    testCode: `if (JSON.stringify(difference([1,2,3], [2,3,4])) !== '[1]') throw new Error('basic');
if (difference([1,2], [1,2]).length !== 0) throw new Error('same');
if (JSON.stringify(difference([1,2,3], [])) !== '[1,2,3]') throw new Error('empty b');` },

  { name: 'intersection', language: 'javascript', patternType: 'utility',
    description: 'Get items present in both arrays', tags: ['array', 'utility', 'set'],
    code: `function intersection(a, b) {
  var set = new Set(b);
  return a.filter(function(x) { return set.has(x); });
}`,
    testCode: `if (JSON.stringify(intersection([1,2,3], [2,3,4])) !== '[2,3]') throw new Error('basic');
if (intersection([1,2], [3,4]).length !== 0) throw new Error('none');` },

  { name: 'union', language: 'javascript', patternType: 'utility',
    description: 'Get unique items from both arrays', tags: ['array', 'utility', 'set'],
    code: `function union(a, b) {
  return Array.from(new Set(a.concat(b)));
}`,
    testCode: `var r = union([1,2,3], [2,3,4]);
if (JSON.stringify(r.sort()) !== '[1,2,3,4]') throw new Error('basic');
if (union([], []).length !== 0) throw new Error('empty');` },

  { name: 'zip', language: 'javascript', patternType: 'utility',
    description: 'Zip multiple arrays into array of tuples', tags: ['array', 'utility'],
    code: `function zip() {
  var arrays = Array.prototype.slice.call(arguments);
  var len = Math.min.apply(null, arrays.map(function(a) { return a.length; }));
  var result = [];
  for (var i = 0; i < len; i++) result.push(arrays.map(function(a) { return a[i]; }));
  return result;
}`,
    testCode: `var r = zip([1,2,3], ['a','b','c']);
if (JSON.stringify(r) !== '[[1,"a"],[2,"b"],[3,"c"]]') throw new Error('basic');
if (zip([1], [2,3]).length !== 1) throw new Error('unequal');` },

  { name: 'unzip', language: 'javascript', patternType: 'utility',
    description: 'Unzip array of tuples into separate arrays', tags: ['array', 'utility'],
    code: `function unzip(pairs) {
  if (!pairs.length) return [];
  return pairs[0].map(function(_, i) {
    return pairs.map(function(p) { return p[i]; });
  });
}`,
    testCode: `var r = unzip([[1,'a'],[2,'b'],[3,'c']]);
if (JSON.stringify(r) !== '[[1,2,3],["a","b","c"]]') throw new Error('basic');
if (unzip([]).length !== 0) throw new Error('empty');` },

  { name: 'range', language: 'javascript', patternType: 'utility',
    description: 'Generate array of numbers in range', tags: ['array', 'utility', 'generator'],
    code: `function range(start, end, step) {
  step = step || 1;
  var result = [];
  if (step > 0) { for (var i = start; i < end; i += step) result.push(i); }
  else { for (var i = start; i > end; i += step) result.push(i); }
  return result;
}`,
    testCode: `if (JSON.stringify(range(0, 5)) !== '[0,1,2,3,4]') throw new Error('basic');
if (JSON.stringify(range(0, 10, 2)) !== '[0,2,4,6,8]') throw new Error('step');
if (JSON.stringify(range(5, 0, -1)) !== '[5,4,3,2,1]') throw new Error('neg');` },

  { name: 'unique', language: 'javascript', patternType: 'utility',
    description: 'Get unique values from array', tags: ['array', 'utility', 'set'],
    code: `function unique(arr) {
  return Array.from(new Set(arr));
}`,
    testCode: `if (JSON.stringify(unique([1,2,2,3,3,3])) !== '[1,2,3]') throw new Error('basic');
if (unique([]).length !== 0) throw new Error('empty');
if (unique([1]).length !== 1) throw new Error('single');` },

  { name: 'partition', language: 'javascript', patternType: 'utility',
    description: 'Split array into two based on predicate', tags: ['array', 'utility'],
    code: `function partition(arr, fn) {
  var pass = [], fail = [];
  for (var i = 0; i < arr.length; i++) {
    (fn(arr[i]) ? pass : fail).push(arr[i]);
  }
  return [pass, fail];
}`,
    testCode: `var r = partition([1,2,3,4,5], function(n) { return n % 2 === 0; });
if (JSON.stringify(r[0]) !== '[2,4]') throw new Error('evens');
if (JSON.stringify(r[1]) !== '[1,3,5]') throw new Error('odds');` },

  { name: 'take', language: 'javascript', patternType: 'utility',
    description: 'Take first n elements from array', tags: ['array', 'utility'],
    code: `function take(arr, n) {
  return arr.slice(0, n);
}`,
    testCode: `if (JSON.stringify(take([1,2,3,4], 2)) !== '[1,2]') throw new Error('basic');
if (take([], 5).length !== 0) throw new Error('empty');
if (JSON.stringify(take([1,2], 5)) !== '[1,2]') throw new Error('over');` },

  { name: 'drop', language: 'javascript', patternType: 'utility',
    description: 'Drop first n elements from array', tags: ['array', 'utility'],
    code: `function drop(arr, n) {
  return arr.slice(n);
}`,
    testCode: `if (JSON.stringify(drop([1,2,3,4], 2)) !== '[3,4]') throw new Error('basic');
if (drop([], 5).length !== 0) throw new Error('empty');` },

  { name: 'last', language: 'javascript', patternType: 'utility',
    description: 'Get last element of array', tags: ['array', 'utility'],
    code: `function last(arr) {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}`,
    testCode: `if (last([1,2,3]) !== 3) throw new Error('basic');
if (last([]) !== undefined) throw new Error('empty');
if (last([42]) !== 42) throw new Error('single');` },

  { name: 'without', language: 'javascript', patternType: 'utility',
    description: 'Remove specified values from array', tags: ['array', 'utility', 'filter'],
    code: `function without(arr) {
  var values = Array.prototype.slice.call(arguments, 1);
  var set = new Set(values);
  return arr.filter(function(x) { return !set.has(x); });
}`,
    testCode: `if (JSON.stringify(without([1,2,3,4], 2, 4)) !== '[1,3]') throw new Error('basic');
if (without([1,1,1], 1).length !== 0) throw new Error('all');` },

  { name: 'sample-array', language: 'javascript', patternType: 'utility',
    description: 'Get random sample of n items from array', tags: ['array', 'utility', 'random'],
    code: `function sampleArray(arr, n) {
  var shuffled = arr.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }
  return shuffled.slice(0, n || 1);
}`,
    testCode: `var s = sampleArray([1,2,3,4,5], 3);
if (s.length !== 3) throw new Error('length');
if (!s.every(function(x) { return [1,2,3,4,5].indexOf(x) >= 0; })) throw new Error('items');
if (sampleArray([], 3).length !== 0) throw new Error('empty');` },


  // ═══ JavaScript: Object Utilities ═══
  { name: 'pick', language: 'javascript', patternType: 'utility',
    description: 'Pick specified keys from object', tags: ['object', 'utility'],
    code: `function pick(obj, keys) {
  var result = {};
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] in obj) result[keys[i]] = obj[keys[i]];
  }
  return result;
}`,
    testCode: `var r = pick({a:1,b:2,c:3}, ['a','c']);
if (r.a !== 1 || r.c !== 3) throw new Error('picked');
if ('b' in r) throw new Error('excluded');` },

  { name: 'omit', language: 'javascript', patternType: 'utility',
    description: 'Omit specified keys from object', tags: ['object', 'utility'],
    code: `function omit(obj, keys) {
  var set = new Set(keys);
  var result = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k) && !set.has(k)) result[k] = obj[k];
  }
  return result;
}`,
    testCode: `var r = omit({a:1,b:2,c:3}, ['b']);
if (r.a !== 1 || r.c !== 3) throw new Error('kept');
if ('b' in r) throw new Error('omitted');` },

  { name: 'deep-merge', language: 'javascript', patternType: 'utility',
    description: 'Deep merge multiple objects', tags: ['object', 'utility', 'merge'],
    code: `function deepMerge(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    for (var key in source) {
      if (!source.hasOwnProperty(key)) continue;
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
}`,
    testCode: `var r = deepMerge({a:1, b:{c:2, d:3}}, {b:{c:9, e:4}});
if (r.a !== 1) throw new Error('a');
if (r.b.c !== 9) throw new Error('override');
if (r.b.d !== 3) throw new Error('keep');
if (r.b.e !== 4) throw new Error('add');` },

  { name: 'map-values', language: 'javascript', patternType: 'utility',
    description: 'Map over object values', tags: ['object', 'utility', 'transform'],
    code: `function mapValues(obj, fn) {
  var result = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    result[keys[i]] = fn(obj[keys[i]], keys[i]);
  }
  return result;
}`,
    testCode: `var r = mapValues({a:1,b:2}, function(v) { return v * 2; });
if (r.a !== 2 || r.b !== 4) throw new Error('doubled');` },

  { name: 'map-keys', language: 'javascript', patternType: 'utility',
    description: 'Map over object keys', tags: ['object', 'utility', 'transform'],
    code: `function mapKeys(obj, fn) {
  var result = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    result[fn(keys[i], obj[keys[i]])] = obj[keys[i]];
  }
  return result;
}`,
    testCode: `var r = mapKeys({a:1,b:2}, function(k) { return k.toUpperCase(); });
if (r.A !== 1 || r.B !== 2) throw new Error('mapped');
if ('a' in r) throw new Error('old key');` },

  { name: 'invert', language: 'javascript', patternType: 'utility',
    description: 'Swap keys and values in object', tags: ['object', 'utility'],
    code: `function invert(obj) {
  var result = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    result[obj[keys[i]]] = keys[i];
  }
  return result;
}`,
    testCode: `var r = invert({a:'x', b:'y'});
if (r.x !== 'a' || r.y !== 'b') throw new Error('inverted');` },

  { name: 'defaults', language: 'javascript', patternType: 'utility',
    description: 'Set default values without overriding existing', tags: ['object', 'utility'],
    code: `function defaults(obj) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    for (var key in source) {
      if (source.hasOwnProperty(key) && obj[key] === undefined) {
        obj[key] = source[key];
      }
    }
  }
  return obj;
}`,
    testCode: `var r = defaults({a:1}, {a:9, b:2}, {c:3});
if (r.a !== 1) throw new Error('no override');
if (r.b !== 2) throw new Error('added b');
if (r.c !== 3) throw new Error('added c');` },

  { name: 'freeze-deep', language: 'javascript', patternType: 'utility',
    description: 'Recursively freeze object', tags: ['object', 'utility', 'immutable'],
    code: `function freezeDeep(obj) {
  Object.freeze(obj);
  Object.keys(obj).forEach(function(key) {
    if (obj[key] && typeof obj[key] === 'object' && !Object.isFrozen(obj[key])) {
      freezeDeep(obj[key]);
    }
  });
  return obj;
}`,
    testCode: `var o = freezeDeep({a:1, b:{c:2}});
if (!Object.isFrozen(o)) throw new Error('frozen');
if (!Object.isFrozen(o.b)) throw new Error('deep frozen');` },

  { name: 'has-path', language: 'javascript', patternType: 'utility',
    description: 'Check if object has nested path', tags: ['object', 'utility', 'path'],
    code: `function hasPath(obj, path) {
  var keys = path.split('.');
  var current = obj;
  for (var i = 0; i < keys.length; i++) {
    if (current == null || !current.hasOwnProperty(keys[i])) return false;
    current = current[keys[i]];
  }
  return true;
}`,
    testCode: `if (!hasPath({a:{b:{c:1}}}, 'a.b.c')) throw new Error('deep');
if (hasPath({a:1}, 'a.b')) throw new Error('missing');
if (hasPath({}, 'x')) throw new Error('empty');` },

  { name: 'rename-keys', language: 'javascript', patternType: 'utility',
    description: 'Rename object keys via mapping', tags: ['object', 'utility', 'transform'],
    code: `function renameKeys(obj, keyMap) {
  var result = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var newKey = keyMap[keys[i]] || keys[i];
    result[newKey] = obj[keys[i]];
  }
  return result;
}`,
    testCode: `var r = renameKeys({a:1, b:2}, {a:'x'});
if (r.x !== 1) throw new Error('renamed');
if (r.b !== 2) throw new Error('kept');
if ('a' in r) throw new Error('old key');` },

  // ═══ JavaScript: Math/Number ═══
  { name: 'clamp', language: 'javascript', patternType: 'utility',
    description: 'Clamp number between min and max', tags: ['math', 'utility'],
    code: `function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}`,
    testCode: `if (clamp(5, 0, 10) !== 5) throw new Error('in range');
if (clamp(-5, 0, 10) !== 0) throw new Error('below');
if (clamp(15, 0, 10) !== 10) throw new Error('above');` },

  { name: 'lerp', language: 'javascript', patternType: 'utility',
    description: 'Linear interpolation between two values', tags: ['math', 'utility', 'animation'],
    code: `function lerp(a, b, t) {
  return a + (b - a) * t;
}`,
    testCode: `if (lerp(0, 10, 0.5) !== 5) throw new Error('mid');
if (lerp(0, 10, 0) !== 0) throw new Error('start');
if (lerp(0, 10, 1) !== 10) throw new Error('end');` },

  { name: 'fibonacci', language: 'javascript', patternType: 'algorithm',
    description: 'Get nth Fibonacci number iteratively', tags: ['math', 'algorithm'],
    code: `function fibonacci(n) {
  if (n <= 1) return n;
  var a = 0, b = 1;
  for (var i = 2; i <= n; i++) { var t = b; b = a + b; a = t; }
  return b;
}`,
    testCode: `if (fibonacci(0) !== 0) throw new Error('f0');
if (fibonacci(1) !== 1) throw new Error('f1');
if (fibonacci(10) !== 55) throw new Error('f10');
if (fibonacci(20) !== 6765) throw new Error('f20');` },

  { name: 'is-prime', language: 'javascript', patternType: 'algorithm',
    description: 'Check if number is prime', tags: ['math', 'algorithm', 'validation'],
    code: `function isPrime(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (var i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}`,
    testCode: `if (!isPrime(2)) throw new Error('2');
if (!isPrime(17)) throw new Error('17');
if (isPrime(1)) throw new Error('1');
if (isPrime(15)) throw new Error('15');` },

  { name: 'gcd', language: 'javascript', patternType: 'algorithm',
    description: 'Greatest common divisor using Euclidean algorithm', tags: ['math', 'algorithm'],
    code: `function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { var t = b; b = a % b; a = t; }
  return a;
}`,
    testCode: `if (gcd(12, 8) !== 4) throw new Error('12,8');
if (gcd(7, 13) !== 1) throw new Error('coprime');
if (gcd(0, 5) !== 5) throw new Error('zero');` },

  { name: 'factorial', language: 'javascript', patternType: 'algorithm',
    description: 'Compute factorial of n', tags: ['math', 'algorithm'],
    code: `function factorial(n) {
  if (n < 0) throw new Error('negative');
  var result = 1;
  for (var i = 2; i <= n; i++) result *= i;
  return result;
}`,
    testCode: `if (factorial(0) !== 1) throw new Error('0!');
if (factorial(5) !== 120) throw new Error('5!');
if (factorial(1) !== 1) throw new Error('1!');
try { factorial(-1); throw new Error('should throw'); } catch(e) { if (e.message === 'should throw') throw e; }` },

  { name: 'round-to', language: 'javascript', patternType: 'utility',
    description: 'Round number to specified decimal places', tags: ['math', 'utility'],
    code: `function roundTo(num, places) {
  var factor = Math.pow(10, places);
  return Math.round(num * factor) / factor;
}`,
    testCode: `if (roundTo(3.14159, 2) !== 3.14) throw new Error('2 places');
if (roundTo(1.005, 2) !== 1.01) throw new Error('rounding');
if (roundTo(5, 0) !== 5) throw new Error('integer');` },

  { name: 'random-int', language: 'javascript', patternType: 'utility',
    description: 'Random integer between min and max inclusive', tags: ['math', 'utility', 'random'],
    code: `function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}`,
    testCode: `for (var i = 0; i < 100; i++) {
  var r = randomInt(1, 10);
  if (r < 1 || r > 10) throw new Error('out of range: ' + r);
  if (!Number.isInteger(r)) throw new Error('not int');
}` },

  { name: 'sum', language: 'javascript', patternType: 'utility',
    description: 'Sum array of numbers', tags: ['math', 'utility', 'array'],
    code: `function sum(arr) {
  var total = 0;
  for (var i = 0; i < arr.length; i++) total += arr[i];
  return total;
}`,
    testCode: `if (sum([1,2,3,4]) !== 10) throw new Error('basic');
if (sum([]) !== 0) throw new Error('empty');
if (sum([-1, 1]) !== 0) throw new Error('negative');` },

  { name: 'median', language: 'javascript', patternType: 'utility',
    description: 'Calculate median of number array', tags: ['math', 'utility', 'statistics'],
    code: `function median(arr) {
  if (!arr.length) return undefined;
  var sorted = arr.slice().sort(function(a,b) { return a - b; });
  var mid = sorted.length >>> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
}`,
    testCode: `if (median([3,1,2]) !== 2) throw new Error('odd');
if (median([4,1,3,2]) !== 2.5) throw new Error('even');
if (median([5]) !== 5) throw new Error('single');
if (median([]) !== undefined) throw new Error('empty');` },

  // ═══ JavaScript: Async Patterns ═══
  { name: 'sleep', language: 'javascript', patternType: 'utility',
    description: 'Promise-based delay function', tags: ['async', 'utility', 'promise'],
    code: `function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}`,
    testCode: `if (typeof sleep(1).then !== 'function') throw new Error('not promise');
var start = Date.now();
sleep(10).then(function() {
  if (Date.now() - start < 5) throw new Error('too fast');
});` },

  { name: 'promise-timeout', language: 'javascript', patternType: 'utility',
    description: 'Wrap promise with timeout', tags: ['async', 'utility', 'promise'],
    code: `function promiseTimeout(promise, ms) {
  var timeout = new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('timeout')); }, ms);
  });
  return Promise.race([promise, timeout]);
}`,
    testCode: `promiseTimeout(Promise.resolve(42), 100).then(function(v) {
  if (v !== 42) throw new Error('value');
});` },

  { name: 'deferred', language: 'javascript', patternType: 'utility',
    description: 'Create deferred promise with external resolve/reject', tags: ['async', 'utility', 'promise'],
    code: `function deferred() {
  var resolve, reject;
  var promise = new Promise(function(res, rej) { resolve = res; reject = rej; });
  return { promise: promise, resolve: resolve, reject: reject };
}`,
    testCode: `var d = deferred();
if (typeof d.promise.then !== 'function') throw new Error('promise');
if (typeof d.resolve !== 'function') throw new Error('resolve');
if (typeof d.reject !== 'function') throw new Error('reject');
d.promise.then(function(v) { if (v !== 'ok') throw new Error('value'); });
d.resolve('ok');` },

  { name: 'p-map', language: 'javascript', patternType: 'utility',
    description: 'Parallel map with concurrency limit', tags: ['async', 'utility', 'concurrency'],
    code: `function pMap(items, fn, concurrency) {
  concurrency = concurrency || Infinity;
  var results = new Array(items.length);
  var index = 0;
  function worker() {
    var work = Promise.resolve();
    while (index < items.length) {
      work = (function(i) {
        return work.then(function() { return fn(items[i], i); })
          .then(function(r) { results[i] = r; });
      })(index++);
    }
    return work;
  }
  var workers = [];
  for (var i = 0; i < Math.min(concurrency, items.length); i++) workers.push(worker());
  return Promise.all(workers).then(function() { return results; });
}`,
    testCode: `pMap([1,2,3], function(x) { return Promise.resolve(x * 2); }, 2).then(function(r) {
  if (JSON.stringify(r) !== '[2,4,6]') throw new Error('result: ' + JSON.stringify(r));
});` },

  // ═══ JavaScript: Data Structures ═══
  { name: 'stack', language: 'javascript', patternType: 'data-structure',
    description: 'Stack with push, pop, peek operations', tags: ['data-structure', 'stack'],
    code: `function Stack() {
  this.items = [];
}
Stack.prototype.push = function(item) { this.items.push(item); };
Stack.prototype.pop = function() { return this.items.pop(); };
Stack.prototype.peek = function() { return this.items[this.items.length - 1]; };
Stack.prototype.isEmpty = function() { return this.items.length === 0; };
Stack.prototype.size = function() { return this.items.length; };`,
    testCode: `var s = new Stack();
s.push(1); s.push(2); s.push(3);
if (s.peek() !== 3) throw new Error('peek');
if (s.pop() !== 3) throw new Error('pop');
if (s.size() !== 2) throw new Error('size');
if (s.isEmpty()) throw new Error('not empty');` },

  { name: 'min-heap', language: 'javascript', patternType: 'data-structure',
    description: 'Min-heap with insert and extractMin', tags: ['data-structure', 'heap', 'priority-queue'],
    code: `function MinHeap() { this.data = []; }
MinHeap.prototype.insert = function(val) {
  this.data.push(val);
  var i = this.data.length - 1;
  while (i > 0) {
    var p = (i - 1) >>> 1;
    if (this.data[p] <= this.data[i]) break;
    var t = this.data[p]; this.data[p] = this.data[i]; this.data[i] = t;
    i = p;
  }
};
MinHeap.prototype.extractMin = function() {
  if (!this.data.length) return undefined;
  var min = this.data[0], last = this.data.pop();
  if (this.data.length > 0) {
    this.data[0] = last;
    var i = 0, n = this.data.length;
    while (true) {
      var m = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.data[l] < this.data[m]) m = l;
      if (r < n && this.data[r] < this.data[m]) m = r;
      if (m === i) break;
      var t = this.data[i]; this.data[i] = this.data[m]; this.data[m] = t;
      i = m;
    }
  }
  return min;
};
MinHeap.prototype.peek = function() { return this.data[0]; };`,
    testCode: `var h = new MinHeap();
h.insert(5); h.insert(2); h.insert(8); h.insert(1);
if (h.peek() !== 1) throw new Error('peek');
if (h.extractMin() !== 1) throw new Error('min1');
if (h.extractMin() !== 2) throw new Error('min2');
if (h.extractMin() !== 5) throw new Error('min3');` },

  { name: 'linked-list', language: 'javascript', patternType: 'data-structure',
    description: 'Singly linked list', tags: ['data-structure', 'linked-list'],
    code: `function LinkedList() { this.head = null; this.length = 0; }
LinkedList.prototype.push = function(val) {
  this.head = { val: val, next: this.head };
  this.length++;
};
LinkedList.prototype.pop = function() {
  if (!this.head) return undefined;
  var val = this.head.val;
  this.head = this.head.next;
  this.length--;
  return val;
};
LinkedList.prototype.has = function(val) {
  var n = this.head;
  while (n) { if (n.val === val) return true; n = n.next; }
  return false;
};
LinkedList.prototype.toArray = function() {
  var r = [], n = this.head;
  while (n) { r.push(n.val); n = n.next; }
  return r;
};`,
    testCode: `var ll = new LinkedList();
ll.push(1); ll.push(2); ll.push(3);
if (ll.length !== 3) throw new Error('length');
if (!ll.has(2)) throw new Error('has');
if (ll.pop() !== 3) throw new Error('pop');
if (JSON.stringify(ll.toArray()) !== '[2,1]') throw new Error('toArray');` },

  { name: 'priority-queue', language: 'javascript', patternType: 'data-structure',
    description: 'Priority queue using min-heap', tags: ['data-structure', 'priority-queue', 'heap'],
    code: `function PriorityQueue() { this.heap = []; }
PriorityQueue.prototype.enqueue = function(value, priority) {
  this.heap.push({value: value, priority: priority});
  var i = this.heap.length - 1;
  while (i > 0) {
    var p = (i-1) >>> 1;
    if (this.heap[p].priority <= this.heap[i].priority) break;
    var t = this.heap[p]; this.heap[p] = this.heap[i]; this.heap[i] = t;
    i = p;
  }
};
PriorityQueue.prototype.dequeue = function() {
  if (!this.heap.length) return undefined;
  var top = this.heap[0], last = this.heap.pop();
  if (this.heap.length > 0) {
    this.heap[0] = last;
    var i = 0, n = this.heap.length;
    while (true) {
      var m = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this.heap[l].priority < this.heap[m].priority) m = l;
      if (r < n && this.heap[r].priority < this.heap[m].priority) m = r;
      if (m === i) break;
      var t = this.heap[i]; this.heap[i] = this.heap[m]; this.heap[m] = t;
      i = m;
    }
  }
  return top.value;
};`,
    testCode: `var pq = new PriorityQueue();
pq.enqueue('low', 3); pq.enqueue('high', 1); pq.enqueue('med', 2);
if (pq.dequeue() !== 'high') throw new Error('first');
if (pq.dequeue() !== 'med') throw new Error('second');
if (pq.dequeue() !== 'low') throw new Error('third');` },

  { name: 'bloom-filter', language: 'javascript', patternType: 'data-structure',
    description: 'Bloom filter for probabilistic set membership', tags: ['data-structure', 'bloom-filter', 'probabilistic'],
    code: `function BloomFilter(size) {
  this.size = size || 256;
  this.bits = new Uint8Array(this.size);
}
BloomFilter.prototype._hashes = function(val) {
  var str = String(val), h1 = 0, h2 = 0;
  for (var i = 0; i < str.length; i++) {
    h1 = (h1 * 31 + str.charCodeAt(i)) % this.size;
    h2 = (h2 * 37 + str.charCodeAt(i)) % this.size;
  }
  return [h1, h2, (h1 + h2) % this.size];
};
BloomFilter.prototype.add = function(val) {
  var h = this._hashes(val);
  for (var i = 0; i < h.length; i++) this.bits[h[i]] = 1;
};
BloomFilter.prototype.has = function(val) {
  var h = this._hashes(val);
  for (var i = 0; i < h.length; i++) { if (!this.bits[h[i]]) return false; }
  return true;
};`,
    testCode: `var bf = new BloomFilter(256);
bf.add('hello'); bf.add('world');
if (!bf.has('hello')) throw new Error('has hello');
if (!bf.has('world')) throw new Error('has world');` },

  // ═══ JavaScript: Functional ═══
  { name: 'curry', language: 'javascript', patternType: 'utility',
    description: 'Curry a function for partial application', tags: ['functional', 'utility'],
    code: `function curry(fn) {
  return function curried() {
    var args = Array.prototype.slice.call(arguments);
    if (args.length >= fn.length) return fn.apply(this, args);
    return function() {
      return curried.apply(this, args.concat(Array.prototype.slice.call(arguments)));
    };
  };
}`,
    testCode: `var add = curry(function(a, b, c) { return a + b + c; });
if (add(1, 2, 3) !== 6) throw new Error('all');
if (add(1)(2)(3) !== 6) throw new Error('curried');
if (add(1, 2)(3) !== 6) throw new Error('partial');` },

  { name: 'compose', language: 'javascript', patternType: 'utility',
    description: 'Compose functions right-to-left', tags: ['functional', 'utility'],
    code: `function compose() {
  var fns = Array.prototype.slice.call(arguments);
  return function(input) {
    return fns.reduceRight(function(val, fn) { return fn(val); }, input);
  };
}`,
    testCode: `var double = function(x) { return x * 2; };
var inc = function(x) { return x + 1; };
var transform = compose(String, inc, double);
if (transform(5) !== '11') throw new Error('compose: ' + transform(5));` },

  { name: 'partial', language: 'javascript', patternType: 'utility',
    description: 'Partially apply arguments to function', tags: ['functional', 'utility'],
    code: `function partial(fn) {
  var preset = Array.prototype.slice.call(arguments, 1);
  return function() {
    return fn.apply(this, preset.concat(Array.prototype.slice.call(arguments)));
  };
}`,
    testCode: `var add = function(a, b, c) { return a + b + c; };
var add10 = partial(add, 10);
if (add10(2, 3) !== 15) throw new Error('partial');
var add10and20 = partial(add, 10, 20);
if (add10and20(3) !== 33) throw new Error('two');` },

  { name: 'once', language: 'javascript', patternType: 'utility',
    description: 'Ensure function is only called once', tags: ['functional', 'utility'],
    code: `function once(fn) {
  var called = false, result;
  return function() {
    if (!called) { called = true; result = fn.apply(this, arguments); }
    return result;
  };
}`,
    testCode: `var count = 0;
var inc = once(function() { return ++count; });
if (inc() !== 1) throw new Error('first');
if (inc() !== 1) throw new Error('cached');
if (count !== 1) throw new Error('called once');` },

  { name: 'negate', language: 'javascript', patternType: 'utility',
    description: 'Create function that negates predicate result', tags: ['functional', 'utility'],
    code: `function negate(fn) {
  return function() { return !fn.apply(this, arguments); };
}`,
    testCode: `var isEven = function(n) { return n % 2 === 0; };
var isOdd = negate(isEven);
if (!isOdd(3)) throw new Error('odd');
if (isOdd(4)) throw new Error('even');` },

  { name: 'flip', language: 'javascript', patternType: 'utility',
    description: 'Reverse argument order of function', tags: ['functional', 'utility'],
    code: `function flip(fn) {
  return function() {
    return fn.apply(this, Array.prototype.slice.call(arguments).reverse());
  };
}`,
    testCode: `var div = function(a, b) { return a / b; };
var flipped = flip(div);
if (flipped(2, 10) !== 5) throw new Error('flipped');` },

  // ═══ JavaScript: Date/Time ═══
  { name: 'is-leap-year', language: 'javascript', patternType: 'utility',
    description: 'Check if year is a leap year', tags: ['date', 'utility', 'validation'],
    code: `function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}`,
    testCode: `if (!isLeapYear(2000)) throw new Error('2000');
if (!isLeapYear(2024)) throw new Error('2024');
if (isLeapYear(1900)) throw new Error('1900');
if (isLeapYear(2023)) throw new Error('2023');` },

  { name: 'days-between', language: 'javascript', patternType: 'utility',
    description: 'Count days between two dates', tags: ['date', 'utility'],
    code: `function daysBetween(d1, d2) {
  var ms = Math.abs(new Date(d1) - new Date(d2));
  return Math.floor(ms / 86400000);
}`,
    testCode: `if (daysBetween('2024-01-01', '2024-01-31') !== 30) throw new Error('jan');
if (daysBetween('2024-01-01', '2024-01-01') !== 0) throw new Error('same');` },

  { name: 'days-in-month', language: 'javascript', patternType: 'utility',
    description: 'Get number of days in a given month', tags: ['date', 'utility'],
    code: `function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}`,
    testCode: `if (daysInMonth(2024, 2) !== 29) throw new Error('feb leap');
if (daysInMonth(2023, 2) !== 28) throw new Error('feb normal');
if (daysInMonth(2024, 1) !== 31) throw new Error('jan');` },

  // ═══ JavaScript: Validation ═══
  { name: 'is-url', language: 'javascript', patternType: 'utility',
    description: 'Validate URL string', tags: ['validation', 'utility', 'url'],
    code: `function isURL(str) {
  try {
    var url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch(e) { return false; }
}`,
    testCode: `if (!isURL('https://example.com')) throw new Error('https');
if (!isURL('http://example.com/path?q=1')) throw new Error('path');
if (isURL('not-a-url')) throw new Error('invalid');
if (isURL('ftp://x.com')) throw new Error('ftp');` },

  { name: 'is-json', language: 'javascript', patternType: 'utility',
    description: 'Check if string is valid JSON', tags: ['validation', 'utility', 'json'],
    code: `function isJSON(str) {
  try { JSON.parse(str); return true; } catch(e) { return false; }
}`,
    testCode: `if (!isJSON('{"a":1}')) throw new Error('object');
if (!isJSON('[1,2,3]')) throw new Error('array');
if (!isJSON('"hello"')) throw new Error('string');
if (isJSON('not json')) throw new Error('invalid');` },

  { name: 'luhn-check', language: 'javascript', patternType: 'algorithm',
    description: 'Luhn algorithm for credit card validation', tags: ['validation', 'algorithm'],
    code: `function luhnCheck(num) {
  var str = String(num).replace(/\\D/g, '');
  var sum = 0, alt = false;
  for (var i = str.length - 1; i >= 0; i--) {
    var n = parseInt(str[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}`,
    testCode: `if (!luhnCheck('79927398713')) throw new Error('valid');
if (luhnCheck('1234567890')) throw new Error('invalid');` },

  // ═══ JavaScript: HTTP/Web ═══
  { name: 'parse-query-string', language: 'javascript', patternType: 'utility',
    description: 'Parse URL query string to object', tags: ['http', 'utility', 'url'],
    code: `function parseQueryString(qs) {
  if (!qs || qs === '?') return {};
  return qs.replace(/^\\?/, '').split('&').reduce(function(obj, pair) {
    var parts = pair.split('=');
    obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
    return obj;
  }, {});
}`,
    testCode: `var r = parseQueryString('?foo=bar&baz=42');
if (r.foo !== 'bar') throw new Error('foo');
if (r.baz !== '42') throw new Error('baz');
if (Object.keys(parseQueryString('')).length !== 0) throw new Error('empty');` },

  { name: 'build-query-string', language: 'javascript', patternType: 'utility',
    description: 'Build URL query string from object', tags: ['http', 'utility', 'url'],
    code: `function buildQueryString(obj) {
  var pairs = Object.keys(obj).filter(function(k) {
    return obj[k] !== undefined;
  }).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  });
  return pairs.length ? '?' + pairs.join('&') : '';
}`,
    testCode: `var r = buildQueryString({foo: 'bar', baz: 42});
if (!r.includes('foo=bar')) throw new Error('foo');
if (!r.includes('baz=42')) throw new Error('baz');
if (r[0] !== '?') throw new Error('question');
if (buildQueryString({}) !== '') throw new Error('empty');` },

  { name: 'parse-cookie', language: 'javascript', patternType: 'utility',
    description: 'Parse cookie header string to object', tags: ['http', 'utility', 'cookie'],
    code: `function parseCookie(str) {
  if (!str) return {};
  return str.split(';').reduce(function(obj, pair) {
    var parts = pair.trim().split('=');
    var key = parts[0].trim();
    obj[key] = parts.slice(1).join('=').trim();
    return obj;
  }, {});
}`,
    testCode: `var r = parseCookie('foo=bar; baz=42; name=hello');
if (r.foo !== 'bar') throw new Error('foo');
if (r.baz !== '42') throw new Error('baz');
if (r.name !== 'hello') throw new Error('name');
if (Object.keys(parseCookie('')).length !== 0) throw new Error('empty');` },

