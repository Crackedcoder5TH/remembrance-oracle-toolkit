/**
 * Native Rust Seed Patterns — idiomatic Rust, not transpiled JS.
 *
 * Each pattern uses Rust conventions: ownership, traits, Result/Option,
 * iterators, pattern matching, lifetimes.
 */

const RUST_SEEDS = [
  // ─── Data Structures ───
  {
    name: 'stack-rust',
    code: `pub struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    pub fn new() -> Self {
        Stack { items: Vec::new() }
    }

    pub fn push(&mut self, item: T) {
        self.items.push(item);
    }

    pub fn pop(&mut self) -> Option<T> {
        self.items.pop()
    }

    pub fn peek(&self) -> Option<&T> {
        self.items.last()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}`,
    testCode: `use super::*;

#[test]
fn test_stack() {
    let mut s = Stack::new();
    s.push(1);
    s.push(2);
    assert_eq!(s.len(), 2);
    assert_eq!(s.pop(), Some(2));
    assert_eq!(s.peek(), Some(&1));
    s.pop();
    assert_eq!(s.pop(), None);
    assert!(s.is_empty());
}`,
    language: 'rust',
    description: 'Generic stack backed by Vec',
    tags: ['data-structure', 'stack', 'generics', 'rust-native'],
    patternType: 'data-structure',
  },
  {
    name: 'binary-search-rust',
    code: `pub fn binary_search<T: Ord>(arr: &[T], target: &T) -> Option<usize> {
    arr.binary_search(target).ok()
}

pub fn binary_search_by<T, F>(arr: &[T], mut cmp: F) -> Option<usize>
where
    F: FnMut(&T) -> std::cmp::Ordering,
{
    arr.binary_search_by(|item| cmp(item)).ok()
}`,
    testCode: `use super::*;

#[test]
fn test_binary_search() {
    let arr = vec![1, 2, 3, 4, 5];
    assert_eq!(binary_search(&arr, &3), Some(2));
    assert_eq!(binary_search(&arr, &1), Some(0));
    assert_eq!(binary_search(&arr, &6), None);
    let empty: Vec<i32> = vec![];
    assert_eq!(binary_search(&empty, &1), None);
}`,
    language: 'rust',
    description: 'Binary search using slice::binary_search — idiomatic Rust',
    tags: ['search', 'algorithm', 'slice', 'rust-native'],
    patternType: 'algorithm',
  },
  {
    name: 'result-chain-rust',
    code: `use std::num::ParseIntError;

pub fn parse_and_double(s: &str) -> Result<i64, ParseIntError> {
    s.trim().parse::<i64>().map(|n| n * 2)
}

pub fn parse_sum(values: &[&str]) -> Result<i64, ParseIntError> {
    values.iter()
        .map(|s| s.trim().parse::<i64>())
        .try_fold(0i64, |acc, r| r.map(|n| acc + n))
}`,
    testCode: `use super::*;

#[test]
fn test_result_chain() {
    assert_eq!(parse_and_double("21"), Ok(42));
    assert!(parse_and_double("abc").is_err());
    assert_eq!(parse_sum(&["1", "2", "3"]), Ok(6));
    assert!(parse_sum(&["1", "x"]).is_err());
}`,
    language: 'rust',
    description: 'Result chaining with map and try_fold',
    tags: ['result', 'error-handling', 'iterator', 'rust-native'],
    patternType: 'utility',
  },
  {
    name: 'iterator-pipeline-rust',
    code: `pub fn top_n_words(text: &str, n: usize) -> Vec<(String, usize)> {
    let mut counts = std::collections::HashMap::new();
    for word in text.split_whitespace() {
        let w = word.to_lowercase();
        *counts.entry(w).or_insert(0usize) += 1;
    }
    let mut pairs: Vec<_> = counts.into_iter().collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1));
    pairs.truncate(n);
    pairs
}`,
    testCode: `use super::*;

#[test]
fn test_top_n_words() {
    let result = top_n_words("the cat sat on the mat the", 2);
    assert_eq!(result[0].0, "the");
    assert_eq!(result[0].1, 3);
    assert_eq!(result.len(), 2);
}`,
    language: 'rust',
    description: 'Word frequency counter with iterator pipeline',
    tags: ['iterator', 'string', 'frequency', 'rust-native'],
    patternType: 'utility',
  },
  {
    name: 'trait-strategy-rust',
    code: `pub trait Sorter {
    fn sort(&self, data: &mut [i32]);
}

pub struct BubbleSort;
pub struct InsertionSort;

impl Sorter for BubbleSort {
    fn sort(&self, data: &mut [i32]) {
        let n = data.len();
        for i in 0..n {
            for j in 0..n - 1 - i {
                if data[j] > data[j + 1] {
                    data.swap(j, j + 1);
                }
            }
        }
    }
}

impl Sorter for InsertionSort {
    fn sort(&self, data: &mut [i32]) {
        for i in 1..data.len() {
            let key = data[i];
            let mut j = i;
            while j > 0 && data[j - 1] > key {
                data[j] = data[j - 1];
                j -= 1;
            }
            data[j] = key;
        }
    }
}

pub fn sort_with(data: &mut [i32], strategy: &dyn Sorter) {
    strategy.sort(data);
}`,
    testCode: `use super::*;

#[test]
fn test_strategy_pattern() {
    let mut data = vec![3, 1, 4, 1, 5];
    sort_with(&mut data, &BubbleSort);
    assert_eq!(data, vec![1, 1, 3, 4, 5]);

    let mut data2 = vec![5, 4, 3, 2, 1];
    sort_with(&mut data2, &InsertionSort);
    assert_eq!(data2, vec![1, 2, 3, 4, 5]);
}`,
    language: 'rust',
    description: 'Strategy pattern using traits and dynamic dispatch',
    tags: ['trait', 'design-pattern', 'strategy', 'rust-native'],
    patternType: 'design-pattern',
  },
  {
    name: 'option-utils-rust',
    code: `pub fn first_some<T>(options: &[Option<T>]) -> Option<&T> {
    options.iter().find_map(|o| o.as_ref())
}

pub fn zip_options<A, B>(a: Option<A>, b: Option<B>) -> Option<(A, B)> {
    match (a, b) {
        (Some(a), Some(b)) => Some((a, b)),
        _ => None,
    }
}

pub fn unwrap_or_compute<T, F: FnOnce() -> T>(opt: Option<T>, f: F) -> T {
    match opt {
        Some(v) => v,
        None => f(),
    }
}`,
    testCode: `use super::*;

#[test]
fn test_option_utils() {
    let opts: Vec<Option<i32>> = vec![None, Some(2), Some(3)];
    assert_eq!(first_some(&opts), Some(&2));

    assert_eq!(zip_options(Some(1), Some("a")), Some((1, "a")));
    assert_eq!(zip_options(Some(1), None::<&str>), None);

    assert_eq!(unwrap_or_compute(Some(5), || 10), 5);
    assert_eq!(unwrap_or_compute(None, || 10), 10);
}`,
    language: 'rust',
    description: 'Option utility functions — first_some, zip, unwrap_or_compute',
    tags: ['option', 'utility', 'functional', 'rust-native'],
    patternType: 'utility',
  },
  {
    name: 'linked-list-rust',
    code: `pub struct LinkedList<T> {
    head: Option<Box<Node<T>>>,
    len: usize,
}

struct Node<T> {
    value: T,
    next: Option<Box<Node<T>>>,
}

impl<T> LinkedList<T> {
    pub fn new() -> Self {
        LinkedList { head: None, len: 0 }
    }

    pub fn push_front(&mut self, value: T) {
        let node = Box::new(Node { value, next: self.head.take() });
        self.head = Some(node);
        self.len += 1;
    }

    pub fn pop_front(&mut self) -> Option<T> {
        self.head.take().map(|node| {
            self.head = node.next;
            self.len -= 1;
            node.value
        })
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.head.is_none()
    }
}`,
    testCode: `use super::*;

#[test]
fn test_linked_list() {
    let mut ll = LinkedList::new();
    ll.push_front(3);
    ll.push_front(2);
    ll.push_front(1);
    assert_eq!(ll.len(), 3);
    assert_eq!(ll.pop_front(), Some(1));
    assert_eq!(ll.pop_front(), Some(2));
    assert_eq!(ll.pop_front(), Some(3));
    assert!(ll.is_empty());
}`,
    language: 'rust',
    description: 'Singly linked list using Box and Option',
    tags: ['data-structure', 'linked-list', 'ownership', 'rust-native'],
    patternType: 'data-structure',
  },
  {
    name: 'from-trait-rust',
    code: `#[derive(Debug, PartialEq)]
pub struct Celsius(f64);

#[derive(Debug, PartialEq)]
pub struct Fahrenheit(f64);

impl From<Celsius> for Fahrenheit {
    fn from(c: Celsius) -> Self {
        Fahrenheit(c.0 * 9.0 / 5.0 + 32.0)
    }
}

impl From<Fahrenheit> for Celsius {
    fn from(f: Fahrenheit) -> Self {
        Celsius((f.0 - 32.0) * 5.0 / 9.0)
    }
}`,
    testCode: `use super::*;

#[test]
fn test_temperature_conversion() {
    let boiling = Celsius(100.0);
    let f: Fahrenheit = boiling.into();
    assert_eq!(f.0, 212.0);

    let freezing = Fahrenheit(32.0);
    let c: Celsius = freezing.into();
    assert_eq!(c.0, 0.0);
}`,
    language: 'rust',
    description: 'Type-safe temperature conversion using From trait',
    tags: ['trait', 'from', 'conversion', 'rust-native'],
    patternType: 'design-pattern',
  },
];

module.exports = { RUST_SEEDS };
