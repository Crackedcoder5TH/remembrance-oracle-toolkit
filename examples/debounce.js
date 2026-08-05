// @oracle-infrastructure — experiment/example/app scaffolding, not substrate periodic-table elements
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
module.exports = { debounce };
