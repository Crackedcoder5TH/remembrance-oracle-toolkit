/* ========================================
   Remembrance Oracle — Website Script
   ======================================== */

(function () {
  'use strict';

  // --- Mobile Navigation Toggle ---
  const navToggle = document.querySelector('.nav-toggle');
  const siteNav = document.querySelector('.site-nav');

  if (navToggle && siteNav) {
    navToggle.addEventListener('click', function () {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
      siteNav.classList.toggle('open');
    });

    // Close nav when a link is clicked
    siteNav.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.setAttribute('aria-expanded', 'false');
        siteNav.classList.remove('open');
      });
    });
  }

  // --- Smooth Scroll for Anchor Links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Active Nav Highlighting on Scroll ---
  const sections = document.querySelectorAll('.section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  function highlightNav() {
    const scrollY = window.scrollY + 100;
    sections.forEach(function (section) {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');
      const link = document.querySelector('.nav-link[href="#' + id + '"]');
      if (link) {
        if (scrollY >= top && scrollY < top + height) {
          link.style.color = '';
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      }
    });
  }

  window.addEventListener('scroll', highlightNav, { passive: true });
  highlightNav();

  // --- Animate Stats on Scroll ---
  function animateValue(el, start, end, duration, suffix) {
    suffix = suffix || '';
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var value = Math.floor(progress * (end - start) + start);
      el.textContent = value + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  var statsAnimated = false;
  var statsBar = document.querySelector('.stats-bar');

  function checkStatsVisible() {
    if (statsAnimated || !statsBar) return;
    var rect = statsBar.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      statsAnimated = true;
      animateValue(document.getElementById('stat-patterns'), 0, 28, 1200);
      animateValue(document.getElementById('stat-candidates'), 0, 12, 1200);
      animateValue(document.getElementById('stat-coherency'), 0, 97, 1200, '%');
      animateValue(document.getElementById('stat-languages'), 0, 4, 800);
    }
  }

  window.addEventListener('scroll', checkStatsVisible, { passive: true });
  checkStatsVisible();

  // --- Header Shrink on Scroll ---
  var header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 50) {
        header.style.boxShadow = '0 2px 16px rgba(0,0,0,0.3)';
      } else {
        header.style.boxShadow = 'none';
      }
    }, { passive: true });
  }
})();
