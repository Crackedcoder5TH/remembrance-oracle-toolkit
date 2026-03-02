/* Remembrance Oracle — Kingdom Compressed */

(function () {
  'use strict';

  // --- Mobile Navigation ---
  var navToggle = document.querySelector('.nav-toggle');
  var siteNav = document.querySelector('.site-nav');

  if (navToggle && siteNav) {
    navToggle.addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
      siteNav.classList.toggle('open');
    });
  }

  // --- Smooth Scroll + Nav Close ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var id = this.getAttribute('href');
      if (id === '#') return;
      var target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (navToggle && siteNav) {
          navToggle.setAttribute('aria-expanded', 'false');
          siteNav.classList.remove('open');
        }
      }
    });
  });

  // --- Throttle (oracle: 1dc32fccc413f932, coherency 0.970) ---
  function throttle(fn, limit) {
    var lastCall = 0;
    return function () {
      var now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        fn.apply(this, arguments);
      }
    };
  }

  // --- Scroll: Nav Highlight + Header Shadow ---
  var sections = document.querySelectorAll('.section[id]');
  var header = document.querySelector('.site-header');

  function onScroll() {
    var y = window.scrollY;
    if (header) header.style.boxShadow = y > 50 ? '0 2px 16px rgba(0,0,0,0.3)' : 'none';
    var offset = y + 100;
    sections.forEach(function (s) {
      var link = document.querySelector('.nav-link[href="#' + s.id + '"]');
      if (link) link.classList.toggle('active', offset >= s.offsetTop && offset < s.offsetTop + s.offsetHeight);
    });
  }

  window.addEventListener('scroll', throttle(onScroll, 100), { passive: true });
  onScroll();

  // --- Animate Stats on Visibility ---
  function animateValue(el, end, duration, suffix) {
    if (!el) return;
    var t0 = 0;
    function tick(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / duration, 1);
      el.textContent = Math.floor(p * end) + (suffix || '');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var statsBar = document.querySelector('.stats-bar');
  if (statsBar) {
    new IntersectionObserver(function (entries, obs) {
      if (entries[0].isIntersecting) {
        obs.disconnect();
        animateValue(document.getElementById('stat-patterns'), 28, 1200);
        animateValue(document.getElementById('stat-candidates'), 12, 1200);
        animateValue(document.getElementById('stat-coherency'), 97, 1200, '%');
        animateValue(document.getElementById('stat-languages'), 4, 800);
      }
    }).observe(statsBar);
  }
})();
