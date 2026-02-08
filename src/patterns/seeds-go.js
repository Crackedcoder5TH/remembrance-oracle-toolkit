/**
 * Native Go Seed Patterns — idiomatic Go, not transpiled JS.
 *
 * Each pattern uses Go conventions: error returns, goroutines, channels,
 * interfaces, struct methods, slices.
 */

const GO_SEEDS = [
  // ─── Data Structures ───
  {
    name: 'stack-go',
    code: `package main

type Stack[T any] struct {
	items []T
}

func NewStack[T any]() *Stack[T] {
	return &Stack[T]{items: make([]T, 0)}
}

func (s *Stack[T]) Push(item T) {
	s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
	if len(s.items) == 0 {
		var zero T
		return zero, false
	}
	item := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return item, true
}

func (s *Stack[T]) Peek() (T, bool) {
	if len(s.items) == 0 {
		var zero T
		return zero, false
	}
	return s.items[len(s.items)-1], true
}

func (s *Stack[T]) Len() int {
	return len(s.items)
}`,
    testCode: `package main

import "testing"

func TestStack(t *testing.T) {
	s := NewStack[int]()
	s.Push(1)
	s.Push(2)
	if s.Len() != 2 { t.Errorf("expected len 2, got %d", s.Len()) }
	v, ok := s.Pop()
	if !ok || v != 2 { t.Errorf("expected 2, got %d", v) }
	v, ok = s.Peek()
	if !ok || v != 1 { t.Errorf("expected peek 1, got %d", v) }
	s.Pop()
	_, ok = s.Pop()
	if ok { t.Error("expected false on empty pop") }
}`,
    language: 'go',
    description: 'Generic stack using Go generics',
    tags: ['data-structure', 'stack', 'generics', 'go-native'],
    patternType: 'data-structure',
  },
  {
    name: 'binary-search-go',
    code: `package main

import "sort"

func BinarySearch(arr []int, target int) int {
	i := sort.SearchInts(arr, target)
	if i < len(arr) && arr[i] == target {
		return i
	}
	return -1
}`,
    testCode: `package main

import "testing"

func TestBinarySearch(t *testing.T) {
	tests := []struct{arr []int; target int; want int}{
		{[]int{1,2,3,4,5}, 3, 2},
		{[]int{1,2,3,4,5}, 1, 0},
		{[]int{1,2,3,4,5}, 6, -1},
		{[]int{}, 1, -1},
	}
	for _, tt := range tests {
		got := BinarySearch(tt.arr, tt.target)
		if got != tt.want { t.Errorf("BinarySearch(%v, %d) = %d, want %d", tt.arr, tt.target, got, tt.want) }
	}
}`,
    language: 'go',
    description: 'Binary search using sort.SearchInts — idiomatic Go',
    tags: ['search', 'algorithm', 'sort', 'go-native'],
    patternType: 'algorithm',
  },
  {
    name: 'worker-pool-go',
    code: `package main

import "sync"

func WorkerPool[T any, R any](workers int, jobs []T, fn func(T) R) []R {
	var wg sync.WaitGroup
	results := make([]R, len(jobs))
	ch := make(chan int, len(jobs))

	for i := range jobs {
		ch <- i
	}
	close(ch)

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range ch {
				results[idx] = fn(jobs[idx])
			}
		}()
	}

	wg.Wait()
	return results
}`,
    testCode: `package main

import "testing"

func TestWorkerPool(t *testing.T) {
	jobs := []int{1, 2, 3, 4, 5}
	results := WorkerPool(3, jobs, func(n int) int { return n * 2 })
	expected := []int{2, 4, 6, 8, 10}
	for i, v := range results {
		if v != expected[i] { t.Errorf("index %d: got %d, want %d", i, v, expected[i]) }
	}
}`,
    language: 'go',
    description: 'Generic worker pool with goroutines and channels',
    tags: ['concurrency', 'goroutine', 'worker-pool', 'go-native'],
    patternType: 'concurrency',
  },
  {
    name: 'retry-go',
    code: `package main

import (
	"errors"
	"time"
)

func Retry(attempts int, delay time.Duration, fn func() error) error {
	var lastErr error
	for i := 0; i < attempts; i++ {
		lastErr = fn()
		if lastErr == nil {
			return nil
		}
		if i < attempts-1 {
			time.Sleep(delay)
			delay *= 2
		}
	}
	return lastErr
}

var ErrMaxRetries = errors.New("max retries exceeded")`,
    testCode: `package main

import (
	"testing"
	"time"
	"errors"
)

func TestRetry(t *testing.T) {
	count := 0
	err := Retry(3, time.Millisecond, func() error {
		count++
		if count < 3 { return errors.New("not yet") }
		return nil
	})
	if err != nil { t.Errorf("expected nil, got %v", err) }
	if count != 3 { t.Errorf("expected 3 attempts, got %d", count) }
}`,
    language: 'go',
    description: 'Retry with exponential backoff — idiomatic Go error handling',
    tags: ['retry', 'resilience', 'error-handling', 'go-native'],
    patternType: 'utility',
  },
  {
    name: 'result-type-go',
    code: `package main

type Result[T any] struct {
	Value T
	Err   error
}

func Ok[T any](value T) Result[T] {
	return Result[T]{Value: value}
}

func Err[T any](err error) Result[T] {
	return Result[T]{Err: err}
}

func (r Result[T]) IsOk() bool {
	return r.Err == nil
}

func (r Result[T]) Unwrap() T {
	if r.Err != nil {
		panic(r.Err)
	}
	return r.Value
}

func (r Result[T]) UnwrapOr(fallback T) T {
	if r.Err != nil {
		return fallback
	}
	return r.Value
}`,
    testCode: `package main

import (
	"errors"
	"testing"
)

func TestResult(t *testing.T) {
	ok := Ok(42)
	if !ok.IsOk() { t.Error("expected ok") }
	if ok.Unwrap() != 42 { t.Error("expected 42") }

	fail := Err[int](errors.New("oops"))
	if fail.IsOk() { t.Error("expected err") }
	if fail.UnwrapOr(0) != 0 { t.Error("expected fallback 0") }
}`,
    language: 'go',
    description: 'Rust-inspired Result type using Go generics',
    tags: ['result', 'error-handling', 'generics', 'go-native'],
    patternType: 'design-pattern',
  },
  {
    name: 'map-filter-reduce-go',
    code: `package main

func Map[T any, R any](slice []T, fn func(T) R) []R {
	result := make([]R, len(slice))
	for i, v := range slice {
		result[i] = fn(v)
	}
	return result
}

func Filter[T any](slice []T, predicate func(T) bool) []T {
	result := make([]T, 0)
	for _, v := range slice {
		if predicate(v) {
			result = append(result, v)
		}
	}
	return result
}

func Reduce[T any, R any](slice []T, initial R, fn func(R, T) R) R {
	acc := initial
	for _, v := range slice {
		acc = fn(acc, v)
	}
	return acc
}`,
    testCode: `package main

import "testing"

func TestMapFilterReduce(t *testing.T) {
	doubled := Map([]int{1,2,3}, func(n int) int { return n * 2 })
	if doubled[0] != 2 || doubled[1] != 4 || doubled[2] != 6 { t.Error("map failed") }

	evens := Filter([]int{1,2,3,4,5}, func(n int) bool { return n%2 == 0 })
	if len(evens) != 2 { t.Errorf("expected 2 evens, got %d", len(evens)) }

	sum := Reduce([]int{1,2,3,4}, 0, func(acc, n int) int { return acc + n })
	if sum != 10 { t.Errorf("expected 10, got %d", sum) }
}`,
    language: 'go',
    description: 'Generic map, filter, reduce for Go slices',
    tags: ['functional', 'generics', 'slice', 'go-native'],
    patternType: 'utility',
  },
  {
    name: 'linked-list-go',
    code: `package main

type Node[T any] struct {
	Value T
	Next  *Node[T]
}

type LinkedList[T any] struct {
	Head *Node[T]
	Size int
}

func (ll *LinkedList[T]) Prepend(value T) {
	ll.Head = &Node[T]{Value: value, Next: ll.Head}
	ll.Size++
}

func (ll *LinkedList[T]) ToSlice() []T {
	result := make([]T, 0, ll.Size)
	current := ll.Head
	for current != nil {
		result = append(result, current.Value)
		current = current.Next
	}
	return result
}

func (ll *LinkedList[T]) Reverse() {
	var prev *Node[T]
	current := ll.Head
	for current != nil {
		next := current.Next
		current.Next = prev
		prev = current
		current = next
	}
	ll.Head = prev
}`,
    testCode: `package main

import "testing"

func TestLinkedList(t *testing.T) {
	ll := &LinkedList[int]{}
	ll.Prepend(3)
	ll.Prepend(2)
	ll.Prepend(1)
	s := ll.ToSlice()
	if len(s) != 3 || s[0] != 1 || s[2] != 3 { t.Error("prepend/toSlice failed") }
	ll.Reverse()
	s = ll.ToSlice()
	if s[0] != 3 || s[2] != 1 { t.Error("reverse failed") }
}`,
    language: 'go',
    description: 'Generic singly linked list with reverse',
    tags: ['data-structure', 'linked-list', 'generics', 'go-native'],
    patternType: 'data-structure',
  },
  {
    name: 'memoize-go',
    code: `package main

import "sync"

func Memoize[K comparable, V any](fn func(K) V) func(K) V {
	cache := make(map[K]V)
	var mu sync.RWMutex

	return func(key K) V {
		mu.RLock()
		if v, ok := cache[key]; ok {
			mu.RUnlock()
			return v
		}
		mu.RUnlock()

		v := fn(key)
		mu.Lock()
		cache[key] = v
		mu.Unlock()
		return v
	}
}`,
    testCode: `package main

import "testing"

func TestMemoize(t *testing.T) {
	calls := 0
	fib := Memoize(func(n int) int {
		calls++
		if n <= 1 { return n }
		return n // simplified
	})
	fib(5)
	fib(5)
	if calls != 1 { t.Errorf("expected 1 call, got %d", calls) }
}`,
    language: 'go',
    description: 'Thread-safe memoization with generics and RWMutex',
    tags: ['memoize', 'cache', 'concurrency', 'go-native'],
    patternType: 'utility',
  },
];

module.exports = { GO_SEEDS };
