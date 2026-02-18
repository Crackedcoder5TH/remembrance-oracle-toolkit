'use strict';

/* @oracle-infrastructure */

function getDashboardScript(resilientFetchSource) {
  return `
(function() {
  'use strict';

  // ─── Resilient Fetch (retry with exponential backoff) ───
  ${resilientFetchSource()}

  // ─── Helpers ───
  function escapeHtml(text) {
    if (!text) return '';
    var el = document.createElement('div');
    el.textContent = String(text);
    return el.innerHTML;
  }
  function getScoreClass(score) {
    return score >= 0.7 ? 'score-high' : score >= 0.4 ? 'score-mid' : 'score-low';
  }
  function debounce(fn, delay) {
    var timer;
    return function() {
      clearTimeout(timer);
      var args = arguments, ctx = this;
      timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
    };
  }

  // ─── Reusable UI builders ───
  function statCard(label, value, sub) {
    return '<div class="stat-card"><div class="stat-label">' + escapeHtml(label) +
      '</div><div class="stat-value">' + escapeHtml(String(value)) +
      '</div>' + (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : '') + '</div>';
  }
  function emptyState(icon, message) {
    return '<div class="empty-state"><div class="empty-icon">' + icon +
      '</div><div class="empty-text">' + escapeHtml(message) + '</div></div>';
  }

  // Basic syntax highlight
  function highlight(code, lang) {
    if (!code) return '';
    var highlighted = escapeHtml(code);
    highlighted = highlighted.replace(/(\/\/[^\\n]*)/g, '<span class="cm">$1</span>');
    highlighted = highlighted.replace(/(#[^\\n]*)/g, function(match) {
      return lang === 'python' ? '<span class="cm">' + match + '</span>' : match;
    });
    highlighted = highlighted.replace(
      /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|\`[^\`]*?\`)/g,
      '<span class="str">$1</span>'
    );
    highlighted = highlighted.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="num">$1</span>');
    var kwPattern = /\\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|try|catch|throw|switch|case|break|default|typeof|instanceof|in|of|def|self|lambda|yield|None|True|False|fn|impl|pub|use|mod|struct|enum|match|mut|go|func|defer|select|chan)\\b/g;
    highlighted = highlighted.replace(kwPattern, '<span class="kw">$1</span>');
    highlighted = highlighted.replace(/\\b([a-zA-Z_]\\w*)\\s*\\(/g, '<span class="fn">$1</span>(');
    return highlighted;
  }

  // ─── State ───
  let allPatterns = [];
  let currentFilter = 'all';
  let sortBy = 'coherency';
  let sortAsc = false;

  // ─── Toast ───
  function showToast(msg) {
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3100);
  }

  // ─── Navigation ───
  var navItems = document.querySelectorAll('.nav-item');
  var panels = document.querySelectorAll('.panel');

  function switchPanel(panelName) {
    navItems.forEach(function(nav) {
      nav.classList.toggle('active', nav.dataset.panel === panelName);
    });
    panels.forEach(function(panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + panelName);
    });
    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
    // Lazy-load tab data
    if (panelName === 'analytics' && !window._analyticsLoaded) loadAnalytics();
    if (panelName === 'charts' && !window._chartsLoaded) loadCharts();
    if (panelName === 'history' && !window._historyLoaded) loadHistory();
    if (panelName === 'debug' && !window._debugLoaded) loadDebugStats();
    if (panelName === 'teams' && !window._teamsLoaded) loadTeams();
    if (panelName === 'admin' && !window._adminLoaded) loadAdmin();
  }

  navItems.forEach(function(item) {
    item.addEventListener('click', function() { switchPanel(this.dataset.panel); });
  });

  // Mobile toggle
  document.getElementById('mobile-toggle').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ─── Keyboard shortcuts ───
  document.addEventListener('keydown', function(e) {
    // Ctrl+K or Cmd+K => command palette / search focus
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      var palette = document.getElementById('cmd-palette');
      if (palette.classList.contains('open')) {
        palette.classList.remove('open');
      } else {
        palette.classList.add('open');
        document.getElementById('cmd-input').value = '';
        document.getElementById('cmd-input').focus();
      }
    }
    if (e.key === 'Escape') {
      document.getElementById('cmd-palette').classList.remove('open');
    }
  });

  // Command palette search redirects to Search tab
  document.getElementById('cmd-input').addEventListener('input', debounce(function() {
    var query = this.value.trim();
    if (query.length > 1) {
      switchPanel('search');
      document.getElementById('search-input').value = query;
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      document.getElementById('cmd-palette').classList.remove('open');
    }
  }, 400));

  // Close palette on bg click
  document.getElementById('cmd-palette').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });

  // ─── WebSocket ───
  var ws = null;
  var wsReconnectTimer = null;

  function connectWS() {
    try {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host);
      ws.onopen = function() {
        document.getElementById('ws-dot').className = 'ws-dot on';
        document.getElementById('ws-dot').title = 'Connected';
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      };
      ws.onmessage = function(event) {
        try { handleWSEvent(JSON.parse(event.data)); } catch(e) { console.debug('[ws] message parse error:', e.message); }
      };
      ws.onclose = function() {
        document.getElementById('ws-dot').className = 'ws-dot off';
        document.getElementById('ws-dot').title = 'Disconnected';
        ws = null;
        if (!wsReconnectTimer) wsReconnectTimer = setTimeout(connectWS, 3000);
      };
      ws.onerror = function(e) { console.debug('[ws] connection error:', e); };
    } catch(e) { console.debug('[ws] setup error:', e.message); }
  }

  function handleWSEvent(data) {
    switch(data.type) {
      case 'pattern_registered':
        showToast('New pattern: ' + (data.name || 'unknown'));
        refreshPatterns();
        break;
      case 'entry_added':
        showToast('New entry added');
        break;
      case 'pattern_evolved':
        showToast('Pattern evolved: ' + (data.name || ''));
        refreshPatterns();
        break;
      case 'feedback':
        showToast('Feedback: ' + (data.id || '').slice(0,8));
        break;
      case 'stats_update':
        refreshStats();
        break;
      case 'healing_start':
        showHealingBanner(data);
        break;
      case 'healing_progress':
        updateHealingProgress(data);
        break;
      case 'healing_complete':
        completeHealingBanner(data);
        break;
      case 'healing_failed':
        failHealingBanner(data);
        break;
      case 'auto_promote':
        showToast('Auto-promoted: ' + (data.promoted || 0) + ' candidate(s)');
        refreshPatterns();
        break;
      case 'rollback':
        showToast('Rollback: ' + (data.patternName || '') + ' reverted to v' + (data.restoredVersion || '?'));
        refreshPatterns();
        break;
      case 'security_veto':
        showToast('Security veto: ' + (data.patternName || '') + ' — ' + (data.tool || ''));
        break;
    }
  }

  // ─── Healing Banner (real-time feedback) ───
  function showHealingBanner(data) {
    var existing = document.getElementById('healing-banner');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.id = 'healing-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#e0e0ff;padding:12px 20px;z-index:9999;font-family:monospace;border-bottom:2px solid #6c63ff;transition:opacity 0.5s;';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:1.2em;">&#x2728;</span>' +
      '<span>Healing <strong>' + escapeHtml(data.patternName || '') + '</strong> (' + escapeHtml(data.decision || '') + ')...</span>' +
      '<span id="healing-coherence" style="color:#6c63ff;font-weight:bold;">loop 0/' + (data.maxLoops || 3) + '</span>' +
      '<div id="healing-bar" style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden;">' +
      '<div id="healing-bar-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#6c63ff,#a78bfa);transition:width 0.3s;"></div>' +
      '</div></div>';
    document.body.prepend(banner);
  }

  function updateHealingProgress(data) {
    var label = document.getElementById('healing-coherence');
    var fill = document.getElementById('healing-bar-fill');
    if (label) label.textContent = 'loop ' + data.loop + '/' + data.maxLoops + ' | coherence: ' + (data.coherence || 0).toFixed(3) + ' | ' + (data.strategy || '');
    if (fill) fill.style.width = Math.min(100, ((data.loop / (data.maxLoops || 3)) * 100)).toFixed(0) + '%';
  }

  function completeHealingBanner(data) {
    var banner = document.getElementById('healing-banner');
    if (!banner) return;
    var imp = data.improvement || 0;
    var sign = imp >= 0 ? '+' : '';
    banner.style.borderBottomColor = '#22c55e';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:1.2em;">&#x2705;</span>' +
      '<span>Healed <strong>' + escapeHtml(data.patternName || '') + '</strong></span>' +
      '<span style="color:#22c55e;font-weight:bold;">' + (data.finalCoherence || 0).toFixed(3) + ' (' + sign + imp.toFixed(3) + ') in ' + (data.loops || 0) + ' loop(s)</span>' +
      '</div>';
    setTimeout(function() { if (banner.parentNode) { banner.style.opacity = '0'; setTimeout(function() { banner.remove(); }, 500); } }, 5000);
  }

  function failHealingBanner(data) {
    var banner = document.getElementById('healing-banner');
    if (!banner) return;
    banner.style.borderBottomColor = '#ef4444';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:1.2em;">&#x274C;</span>' +
      '<span>Healing failed for <strong>' + escapeHtml(data.patternName || '') + '</strong>: ' + escapeHtml(data.error || 'unknown') + '</span>' +
      '</div>';
    setTimeout(function() { if (banner.parentNode) { banner.style.opacity = '0'; setTimeout(function() { banner.remove(); }, 500); } }, 5000);
  }

  connectWS();

  // ─── Voice Mode (Web Speech API) ───
  var voiceEnabled = false;
  var voiceToggle = document.getElementById('voice-toggle');
  voiceToggle.addEventListener('click', function() {
    voiceEnabled = !voiceEnabled;
    voiceToggle.style.opacity = voiceEnabled ? '1' : '0.4';
    voiceToggle.innerHTML = voiceEnabled ? '&#128266;' : '&#128264;';
    if (voiceEnabled) speakWhisper('Voice mode activated. I will speak whispers from the healed future.');
  });

  function speakWhisper(text) {
    if (!voiceEnabled || !window.speechSynthesis || !text) return;
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 0.95;
    utterance.volume = 0.8;
    // Prefer a calm, clear voice
    var voices = window.speechSynthesis.getVoices();
    var preferred = voices.find(function(v) { return /samantha|karen|daniel|google.*uk|zira/i.test(v.name); });
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }

  // Speak healing whispers when events arrive
  var _origComplete = completeHealingBanner;
  completeHealingBanner = function(data) {
    _origComplete(data);
    if (data.whisper) speakWhisper(data.whisper);
    else if (data.patternName) speakWhisper('Healing complete for ' + data.patternName + '. Coherence: ' + (data.finalCoherence || 0).toFixed(2));
  };

  var _origFail = failHealingBanner;
  failHealingBanner = function(data) {
    _origFail(data);
    speakWhisper('Healing failed for ' + (data.patternName || 'pattern') + '. ' + (data.error || ''));
  };

  // ─── Pattern Rendering ───
  function renderPatternCard(p) {
    var score = (p.coherencyScore && p.coherencyScore.total != null ? p.coherencyScore.total : 0);
    var tags = (p.tags || []).map(function(t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('');
    var typeTag = p.patternType ? '<span class="tag tag-type">' + escapeHtml(p.patternType) + '</span>' : '';
    var cxTag = p.complexity ? '<span class="tag tag-complexity">' + escapeHtml(p.complexity) + '</span>' : '';

    return '<div class="code-card" data-id="' + escapeHtml(p.id) + '" data-lang="' + escapeHtml(p.language || '') +
      '" data-score="' + score + '">' +
      '<div class="code-card-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
      '<span class="code-card-expand">&#9654;</span>' +
      '<span class="code-card-name">' + escapeHtml(p.name) + '</span>' +
      '<span class="code-card-lang">' + escapeHtml(p.language || 'unknown') + '</span>' +
      '<span class="code-card-score ' + getScoreClass(score) + '">' + score.toFixed(3) + '</span>' +
      '</div>' +
      '<div class="code-card-body">' +
      '<div class="code-card-meta">' + typeTag + cxTag + tags + '</div>' +
      '<pre class="code-block">' + highlight(p.code, p.language) + '</pre>' +
      '</div></div>';
  }

  // ─── Patterns Tab ───
  function refreshStats() {
    resilientFetch('/api/stats').then(function(resp) { return resp.json(); }).then(function(stats) {
      var patStats = stats.patterns || {};
      var grid = document.getElementById('stats-grid');
      grid.innerHTML =
        statCard('Patterns', patStats.totalPatterns || 0, 'Proven code patterns') +
        statCard('Entries', (stats.store && stats.store.totalEntries) || 0, 'Store entries') +
        statCard('Avg Coherency', (patStats.avgCoherency || 0).toFixed(3), 'Quality score') +
        statCard('Languages', Object.keys(patStats.byLanguage || {}).length, 'Supported');
      document.getElementById('nav-pat-count').textContent = patStats.totalPatterns || 0;
    }).catch(function() {});
  }

  function refreshPatterns() {
    resilientFetch('/api/patterns').then(function(resp) { return resp.json(); }).then(function(patterns) {
      allPatterns = patterns;
      buildFilters();
      renderFilteredPatterns();
    }).catch(function() {
      document.getElementById('patterns-list').innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load patterns</div></div>';
    });
  }

  function buildFilters() {
    var langCounts = {};
    allPatterns.forEach(function(pat) {
      var lang = pat.language || 'unknown';
      langCounts[lang] = (langCounts[lang] || 0) + 1;
    });
    var filterBar = document.getElementById('pattern-filters');
    var html = '<span class="filter-pill' +
      (currentFilter === 'all' ? ' active' : '') +
      '" data-filter="all">All (' + allPatterns.length + ')</span>';
    Object.keys(langCounts).sort().forEach(function(lang) {
      html += '<span class="filter-pill' +
        (currentFilter === lang ? ' active' : '') +
        '" data-filter="' + escapeHtml(lang) + '">' +
        escapeHtml(lang) + ' (' + langCounts[lang] + ')</span>';
    });
    html += '<button class="sort-btn" id="sort-toggle">Sort: ' +
      (sortBy === 'coherency' ? 'Coherency' : 'Name') + ' ' +
      (sortAsc ? '&#9650;' : '&#9660;') + '</button>';
    filterBar.innerHTML = html;

    filterBar.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        currentFilter = this.dataset.filter;
        buildFilters();
        renderFilteredPatterns();
      });
    });
    var sortBtn = document.getElementById('sort-toggle');
    if (sortBtn) {
      sortBtn.addEventListener('click', function() {
        if (sortBy === 'coherency') { sortBy = 'name'; }
        else { sortBy = 'coherency'; sortAsc = !sortAsc; }
        buildFilters();
        renderFilteredPatterns();
      });
    }
  }

  function renderFilteredPatterns() {
    var filtered = allPatterns;
    if (currentFilter !== 'all') {
      filtered = allPatterns.filter(function(p) { return (p.language || 'unknown') === currentFilter; });
    }
    filtered = filtered.slice().sort(function(a, b) {
      if (sortBy === 'coherency') {
        var sa = (a.coherencyScore && a.coherencyScore.total != null ? a.coherencyScore.total : 0);
        var sb = (b.coherencyScore && b.coherencyScore.total != null ? b.coherencyScore.total : 0);
        return sortAsc ? sa - sb : sb - sa;
      }
      return sortAsc ? (a.name || '').localeCompare(b.name || '') : (b.name || '').localeCompare(a.name || '');
    });
    var pl = document.getElementById('patterns-list');
    if (filtered.length === 0) {
      pl.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9638;</div><div class="empty-text">No patterns found. Run: oracle seed</div></div>';
    } else {
      pl.innerHTML = filtered.map(renderPatternCard).join('');
    }
  }

  // Initial load
  refreshStats();
  refreshPatterns();

  // ─── Search Tab ───
  var searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', debounce(function() {
    var searchQuery = this.value.trim();
    var intentEl = document.getElementById('search-intent');
    if (!searchQuery) {
      document.getElementById('search-results').innerHTML =
        emptyState('&#8981;', 'Type a query to search proven patterns');
      intentEl.textContent = 'idle';
      return;
    }
    intentEl.textContent = 'searching...';
    var mode = document.getElementById('search-mode').value;
    resilientFetch('/api/search?q=' + encodeURIComponent(searchQuery) + '&mode=' + mode)
      .then(function(resp) { return resp.json(); })
      .then(function(results) {
        if (results.length === 0) {
          intentEl.textContent = 'no matches';
          document.getElementById('search-results').innerHTML =
            emptyState('', 'No results for "' + escapeHtml(searchQuery) + '"');
          return;
        }
        intentEl.textContent = results.length + ' match' + (results.length !== 1 ? 'es' : '');
        document.getElementById('search-results').innerHTML = results.map(function(result) {
          var matchScore = result.matchScore || result.semanticScore || 0;
          var concepts = (result.matchedConcepts && result.matchedConcepts.length)
            ? '<div style="font-size:0.75em;color:var(--fg3);margin-top:4px">Concepts: ' +
              result.matchedConcepts.join(', ') + '</div>' : '';
          return '<div class="code-card">' +
            '<div class="code-card-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
            '<span class="code-card-expand">&#9654;</span>' +
            '<span class="code-card-name">' + escapeHtml(result.name || result.description || result.id) + '</span>' +
            '<span class="code-card-lang">' + escapeHtml(result.language || '') + '</span>' +
            '<span class="code-card-score ' + getScoreClass(matchScore) + '">match: ' +
            matchScore.toFixed(3) + '</span>' +
            '</div><div class="code-card-body">' + concepts +
            '<pre class="code-block">' + highlight(result.code, result.language) + '</pre>' +
            '</div></div>';
        }).join('');
      }).catch(function() { intentEl.textContent = 'error'; });
  }, 300));

  // ─── Debug Tab ───
  function loadDebugStats() {
    window._debugLoaded = true;
    resilientFetch('/api/debug/stats').then(function(resp) { return resp.json(); }).then(function(debugStats) {
      document.getElementById('debug-stats').innerHTML =
        statCard('Debug Patterns', debugStats.totalPatterns || 0) +
        statCard('Avg Confidence', (debugStats.avgConfidence || 0).toFixed(3)) +
        statCard('Resolution Rate', ((debugStats.resolutionRate || 0) * 100).toFixed(0) + '%');
    }).catch(function() {
      document.getElementById('debug-stats').innerHTML = statCard('Debug Patterns', 0);
    });
  }

  document.getElementById('debug-search-input').addEventListener('input', debounce(function() {
    var debugQuery = this.value.trim();
    if (!debugQuery) {
      document.getElementById('debug-results').innerHTML =
        emptyState('&#9888;', 'Search for error messages to find proven fixes');
      return;
    }
    resilientFetch('/api/debug/search?q=' + encodeURIComponent(debugQuery))
      .then(function(resp) { return resp.json(); })
      .then(function(results) {
        if (!results || results.length === 0) {
          document.getElementById('debug-results').innerHTML =
            emptyState('', 'No debug fixes found for that error');
          return;
        }
        document.getElementById('debug-results').innerHTML = results.map(function(d) {
          var conf = d.confidence || 0;
          return '<div class="debug-card">' +
            '<div class="debug-card-header">' +
            '<span class="debug-error">' + escapeHtml(d.errorMessage || d.error_message || '') + '</span>' +
            '<span class="debug-confidence ' + getScoreClass(conf) + '">' + (conf*100).toFixed(0) + '% conf</span>' +
            '</div>' +
            '<div class="debug-meta">' +
            '<span class="debug-category">' + escapeHtml(d.errorCategory || d.error_category || '') + '</span>' +
            '<span>' + escapeHtml(d.language || '') + '</span>' +
            '<span>Applied: ' + (d.timesApplied || 0) + '</span>' +
            '<span>Resolved: ' + (d.timesResolved || 0) + '</span>' +
            (d.matchType ? '<span>Match: ' + escapeHtml(d.matchType) + '</span>' : '') +
            '</div>' +
            (d.fixCode ? '<pre class="code-block" style="margin-top:8px">' + highlight(d.fixCode || d.fix_code || '', d.language) + '</pre>' : '') +
            (d.fixDescription || d.fix_description ? '<div style="font-size:0.78em;color:var(--fg3);margin-top:6px">' + escapeHtml(d.fixDescription || d.fix_description) + '</div>' : '') +
            '</div>';
        }).join('');
      }).catch(function() {
        document.getElementById('debug-results').innerHTML = '<div class="empty-state"><div class="empty-text">Error searching debug patterns</div></div>';
      });
  }, 300));

  // ─── Teams Tab ───
  function loadTeams() {
    window._teamsLoaded = true;
    resilientFetch('/api/teams').then(function(resp) { return resp.json(); }).then(function(teams) {
      if (!teams || teams.length === 0) {
        document.getElementById('teams-list').innerHTML =
          emptyState('&#9734;', 'No teams yet. Create one to get started.');
        return;
      }
      document.getElementById('teams-list').innerHTML = teams.map(function(team) {
        var initial = (team.name || '?')[0].toUpperCase();
        return '<div class="team-card">' +
          '<div class="team-avatar">' + escapeHtml(initial) + '</div>' +
          '<div class="team-info">' +
          '<div class="team-name">' + escapeHtml(team.name) + '</div>' +
          '<div class="team-desc">' + escapeHtml(team.description || '') + '</div>' +
          '</div>' +
          '<div class="team-members">' + (team.memberCount || 0) + ' members</div>' +
          '</div>';
      }).join('');
    }).catch(function() {
      document.getElementById('teams-list').innerHTML =
        emptyState('', 'Failed to load teams');
    });
  }

  document.getElementById('create-team-btn').addEventListener('click', function() {
    var form = document.getElementById('create-team-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('cancel-team-btn').addEventListener('click', function() {
    document.getElementById('create-team-form').style.display = 'none';
  });
  document.getElementById('submit-team-btn').addEventListener('click', function() {
    var name = document.getElementById('team-name-input').value.trim();
    if (!name) return;
    resilientFetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, description: document.getElementById('team-desc-input').value.trim() })
    }).then(function(resp) { return resp.json(); }).then(function(team) {
      showToast('Team created: ' + team.name);
      document.getElementById('create-team-form').style.display = 'none';
      document.getElementById('team-name-input').value = '';
      document.getElementById('team-desc-input').value = '';
      window._teamsLoaded = false;
      loadTeams();
    }).catch(function() { showToast('Failed to create team'); });
  });

  // ─── History Tab ───
  function loadHistory() {
    window._historyLoaded = true;
    resilientFetch('/api/entries').then(function(resp) { return resp.json(); }).then(function(entries) {
      if (!entries || entries.length === 0) {
        document.getElementById('history-list').innerHTML =
          emptyState('&#8634;', 'No entries in history');
        return;
      }
      var html = '<div class="timeline">';
      entries.forEach(function(entry) {
        var score = (entry.coherencyScore && entry.coherencyScore.total != null
          ? entry.coherencyScore.total : 0);
        var date = entry.timestamp || entry.created_at || '';
        var tagHtml = (entry.tags && entry.tags.length)
          ? ' &middot; ' + entry.tags.map(function(tag) {
              return '<span class="tag" style="font-size:0.68em">' + escapeHtml(tag) + '</span>';
            }).join('') : '';
        html += '<div class="timeline-item">' +
          '<div class="timeline-dot"></div>' +
          '<div class="timeline-card">' +
          '<div class="timeline-date">' + escapeHtml(date) + '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div class="timeline-title">' + escapeHtml(entry.description || entry.id) + '</div>' +
          '<span class="code-card-score ' + getScoreClass(score) +
          '" style="font-size:0.75em">' + score.toFixed(3) + '</span>' +
          '</div>' +
          '<div class="timeline-detail">' +
          '<span class="code-card-lang" style="font-size:0.7em">' +
          escapeHtml(entry.language || '') + '</span>' + tagHtml +
          '</div></div></div>';
      });
      html += '</div>';
      document.getElementById('history-list').innerHTML = html;
    }).catch(function() {
      document.getElementById('history-list').innerHTML =
        emptyState('', 'Failed to load history');
    });
  }

  // History filter
  document.getElementById('history-search').addEventListener('input', debounce(function() {
    var filterText = this.value.trim().toLowerCase();
    document.querySelectorAll('#history-list .timeline-item').forEach(function(item) {
      var text = item.textContent.toLowerCase();
      item.style.display = !filterText || text.includes(filterText) ? '' : 'none';
    });
  }, 200));

  // ─── Vectors Tab ───
  var vectorColors = ['#7aa2f7','#bb9af7','#7dcfff','#9ece6a','#e0af68','#f7768e','#ff9e64','#73daca','#b4f9f8','#c0caf5'];

  document.getElementById('vector-input').addEventListener('input', debounce(function() {
    var vectorQuery = this.value.trim();
    if (!vectorQuery) {
      document.getElementById('vector-scatter').style.display = 'none';
      document.getElementById('vector-results').innerHTML =
        emptyState('&#8728;', 'Type a term to explore the vector space');
      return;
    }
    resilientFetch('/api/nearest?q=' + encodeURIComponent(vectorQuery))
      .then(function(resp) { return resp.json(); })
      .then(function(terms) {
        if (!terms || terms.length === 0) {
          document.getElementById('vector-scatter').style.display = 'none';
          document.getElementById('vector-results').innerHTML =
            emptyState('', 'No matching terms in vector space');
          return;
        }
        // Bar chart
        var maxSim = terms[0].similarity || 1;
        var html = terms.map(function(term, idx) {
          var pct = (term.similarity / maxSim * 100).toFixed(1);
          var barColor = vectorColors[idx % vectorColors.length];
          return '<div class="bar-row">' +
            '<span class="bar-label">' + escapeHtml(term.term) + '</span>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + pct +
            '%;background:' + barColor + '"></div></div>' +
            '<span class="bar-val">' + term.similarity.toFixed(3) + '</span></div>';
        }).join('');
        document.getElementById('vector-results').innerHTML = html;

        // 3D scatter
        var scatter = document.getElementById('vector-scatter');
        scatter.style.display = 'block';
        var scatterWidth = scatter.offsetWidth;
        var scatterHeight = scatter.offsetHeight;
        var scatterHTML = '<div class="scatter-axis" style="bottom:8px;left:50%;transform:translateX(-50%)">Similarity</div>' +
          '<div class="scatter-axis" style="left:8px;top:50%;transform:translateY(-50%) rotate(-90deg)">Distribution</div>';

        terms.forEach(function(term, idx) {
          var posX = 40 + (term.similarity / maxSim) * (scatterWidth - 100);
          // Pseudo-random y based on term hash
          var hash = 0;
          for (var ci = 0; ci < term.term.length; ci++) {
            hash = ((hash << 5) - hash) + term.term.charCodeAt(ci);
          }
          var posY = 30 + Math.abs(hash % (scatterHeight - 80));
          var dotSize = 6 + (term.similarity / maxSim) * 12;
          var dotDepth = 0.5 + (term.similarity / maxSim) * 0.5;
          var dotColor = vectorColors[idx % vectorColors.length];
          scatterHTML += '<div class="scatter-point" style="left:' + posX +
            'px;top:' + posY + 'px;width:' + dotSize + 'px;height:' + dotSize + 'px;' +
            'background:' + dotColor + ';opacity:' + dotDepth +
            ';transform:scale(' + dotDepth + ');" title="' +
            escapeHtml(term.term) + ': ' + term.similarity.toFixed(3) + '"></div>';
          scatterHTML += '<div class="scatter-label" style="left:' +
            (posX + dotSize + 4) + 'px;top:' + (posY - 2) + 'px;opacity:' +
            (dotDepth * 0.8) + '">' + escapeHtml(term.term) + '</div>';
        });
        scatter.innerHTML = scatterHTML;
      }).catch(function() {
        document.getElementById('vector-scatter').style.display = 'none';
        document.getElementById('vector-results').innerHTML =
          emptyState('', 'Failed to load vectors');
      });
  }, 300));

  // ─── Analytics Tab ───
  function loadAnalytics() {
    window._analyticsLoaded = true;
    resilientFetch('/api/analytics').then(function(resp) { return resp.json(); }).then(function(data) {
      var overview = data.overview || {};
      var dist = data.coherencyDistribution || {};
      var healthReport = data.healthReport || {};
      var langBreakdown = data.languageBreakdown || {};
      var tagCloud = data.tagCloud || [];
      var topPatterns = data.topPatterns || [];

      var html = '';

      // Stats
      html += '<div class="stats-row">';
      html += statCard('Total Patterns', overview.totalPatterns || 0);
      html += statCard('Avg Coherency', (overview.avgCoherency || 0).toFixed(3));
      html += statCard('Quality Ratio', (overview.qualityRatio || 0) + '%');
      html += statCard('Languages', overview.languages || 0);
      html += '</div>';

      // Health indicators
      html += '<div style="display:flex;gap:24px;margin:16px 0;flex-wrap:wrap">';
      html += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="health-dot health-good"></span>' +
        '<span style="font-size:0.85em">Healthy: ' + (healthReport.healthy || 0) +
        '</span></div>';
      html += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="health-dot health-warn"></span>' +
        '<span style="font-size:0.85em">Warning: ' + (healthReport.warning || 0) +
        '</span></div>';
      html += '<div style="display:flex;align-items:center;gap:8px">' +
        '<span class="health-dot health-bad"></span>' +
        '<span style="font-size:0.85em">Critical: ' + (healthReport.critical || 0) +
        '</span></div>';
      html += '</div>';

      // Coherency distribution bars
      html += '<div class="admin-section-title" style="margin-top:20px">Coherency Distribution</div>';
      var distKeys = Object.keys(dist);
      var maxBucket = Math.max.apply(null, distKeys.map(function(k) { return dist[k]; }).concat([1]));
      distKeys.forEach(function(range) {
        var pct = (dist[range] / maxBucket * 100).toFixed(1);
        html += '<div class="bar-row"><span class="bar-label">' + escapeHtml(range) + '</span>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-val">' + dist[range] + '</span></div>';
      });

      // Language donut
      var langKeys = Object.keys(langBreakdown);
      if (langKeys.length > 0) {
        html += '<div class="admin-section-title" style="margin-top:20px">Languages</div>';
        var langTotal = langKeys.reduce(function(sum, key) {
          return sum + langBreakdown[key].count;
        }, 0) || 1;
        var gradParts = [];
        var angle = 0;
        var legendItems = [];
        langKeys.forEach(function(lang, idx) {
          var pct = langBreakdown[lang].count / langTotal * 100;
          var color = vectorColors[idx % vectorColors.length];
          gradParts.push(color + ' ' + angle.toFixed(1) + '% ' +
            (angle + pct).toFixed(1) + '%');
          legendItems.push(
            '<div class="donut-legend-item">' +
            '<span class="donut-swatch" style="background:' + color + '"></span>' +
            escapeHtml(lang) + ': ' + langBreakdown[lang].count +
            ' (' + langBreakdown[lang].avgCoherency.toFixed(3) + ')</div>');
          angle += pct;
        });
        html += '<div class="donut-wrap">';
        html += '<div class="donut" style="background:conic-gradient(' +
          gradParts.join(',') + ');">' +
          '<div style="width:60px;height:60px;border-radius:50%;background:var(--bg);' +
          'display:flex;align-items:center;justify-content:center">' +
          '<span class="donut-center">' + langKeys.length + '</span>' +
          '</div></div>';
        html += '<div class="donut-legend">' + legendItems.join('') + '</div>';
        html += '</div>';
      }

      // Tag cloud
      if (tagCloud.length > 0) {
        html += '<div class="admin-section-title" style="margin-top:20px">Tag Cloud</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:12px 0">';
        var maxTagCount = tagCloud[0].count || 1;
        tagCloud.forEach(function(tagItem) {
          var fontSize = 0.72 + (tagItem.count / maxTagCount) * 0.9;
          html += '<span class="tag" style="font-size:' + fontSize.toFixed(2) +
            'em;padding:3px 10px">' + escapeHtml(tagItem.tag) +
            ' (' + tagItem.count + ')</span>';
        });
        html += '</div>';
      }

      // Top patterns
      if (topPatterns.length > 0) {
        html += '<div class="admin-section-title" style="margin-top:20px">Top Patterns</div>';
        topPatterns.forEach(function(pat) {
          html += '<div class="code-card" style="border-left-color:var(--green)">' +
            '<div class="code-card-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
            '<span class="code-card-expand">&#9654;</span>' +
            '<span class="code-card-name">' + escapeHtml(pat.name) + '</span>' +
            '<span class="code-card-lang">' + escapeHtml(pat.language || '') + '</span>' +
            '<span class="code-card-score ' + getScoreClass(pat.coherency) + '">' +
            pat.coherency.toFixed(3) + '</span></div></div>';
        });
      }

      document.getElementById('analytics-content').innerHTML = html;
    }).catch(function(err) {
      document.getElementById('analytics-content').innerHTML =
        emptyState('', 'Failed to load analytics');
    });
  }

  // ─── Charts Tab (Visual Coherence) ───
  function loadCharts() {
    window._chartsLoaded = true;
    resilientFetch('/api/analytics').then(function(resp) { return resp.json(); }).then(function(data) {
      var patterns = [];
      try {
        resilientFetch('/api/patterns').then(function(resp2) { return resp2.json(); }).then(function(pats) {
          patterns = pats || [];
          renderAllCharts(data, patterns);
        });
      } catch(e) { console.debug('[charts] pattern fetch failed:', e.message); renderAllCharts(data, []); }
    });
  }

  function renderAllCharts(analytics, patterns) {
    var ov = analytics.overview || {};
    var dist = analytics.coherencyDistribution || {};
    var langs = analytics.languageBreakdown || {};

    // Summary cards
    document.getElementById('chart-avg-coherency').textContent = (ov.avgCoherency || 0).toFixed(3);
    document.getElementById('chart-total-patterns').textContent = ov.totalPatterns || 0;
    document.getElementById('chart-high-quality').textContent = (ov.qualityRatio || 0) + '%';
    var totalVotes = patterns.reduce(function(sum, p) { return sum + (p.upvotes || 0) + (p.downvotes || 0); }, 0);
    document.getElementById('chart-total-votes').textContent = totalVotes;

    // 1. Coherence Distribution Bar Chart
    renderBarChart('chart-coherence-dist', dist, 'var(--accent)');

    // 2. Dimension Breakdown
    renderDimensionChart('chart-dimensions', patterns);

    // 3. Top 10 by Usage
    renderUsageChart('chart-top-usage', patterns);

    // 4. Language Distribution
    renderLanguageChart('chart-languages', langs);

    // 5. Sparkline
    renderSparkline('chart-sparkline', patterns);
  }

  function renderBarChart(svgId, dist, color) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var keys = Object.keys(dist);
    if (keys.length === 0) { svg.innerHTML = '<text x="200" y="100" fill="var(--fg3)" text-anchor="middle" font-size="14">No data</text>'; return; }
    var maxVal = Math.max.apply(null, keys.map(function(k) { return dist[k]; }).concat([1]));
    var barW = Math.floor(360 / keys.length) - 4;
    var html = '';
    keys.forEach(function(k, i) {
      var h = Math.max(2, (dist[k] / maxVal) * 160);
      var x = 30 + i * (barW + 4);
      var y = 180 - h;
      html += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + color + '" rx="3" opacity="0.85"/>';
      html += '<text x="' + (x + barW/2) + '" y="195" fill="var(--fg3)" text-anchor="middle" font-size="9">' + k + '</text>';
      html += '<text x="' + (x + barW/2) + '" y="' + (y - 4) + '" fill="var(--fg2)" text-anchor="middle" font-size="10">' + dist[k] + '</text>';
    });
    svg.innerHTML = html;
  }

  function renderDimensionChart(svgId, patterns) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var dims = { correctness: 0, simplicity: 0, unity: 0, reliability: 0, economy: 0 };
    var count = 0;
    patterns.forEach(function(p) {
      var cs = p.coherencyScore;
      if (cs && typeof cs === 'object') {
        Object.keys(dims).forEach(function(d) { if (cs[d] != null) dims[d] += cs[d]; });
        count++;
      }
    });
    if (count === 0) { svg.innerHTML = '<text x="200" y="100" fill="var(--fg3)" text-anchor="middle" font-size="14">No dimension data</text>'; return; }
    var dimKeys = Object.keys(dims);
    var barW = Math.floor(360 / dimKeys.length) - 8;
    var colors = ['var(--green)', 'var(--accent)', 'var(--purple)', 'var(--yellow)', 'var(--cyan)'];
    var html = '';
    dimKeys.forEach(function(d, i) {
      var avg = dims[d] / count;
      var h = avg * 160;
      var x = 30 + i * (barW + 8);
      var y = 180 - h;
      html += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + colors[i] + '" rx="4" opacity="0.8"/>';
      html += '<text x="' + (x + barW/2) + '" y="195" fill="var(--fg3)" text-anchor="middle" font-size="9">' + d.slice(0,4) + '</text>';
      html += '<text x="' + (x + barW/2) + '" y="' + (y - 4) + '" fill="var(--fg2)" text-anchor="middle" font-size="10">' + avg.toFixed(2) + '</text>';
    });
    svg.innerHTML = html;
  }

  function renderUsageChart(svgId, patterns) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var sorted = patterns.slice().sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); }).slice(0, 10);
    if (sorted.length === 0) { svg.innerHTML = '<text x="200" y="130" fill="var(--fg3)" text-anchor="middle" font-size="14">No usage data</text>'; return; }
    var maxUsage = Math.max.apply(null, sorted.map(function(p) { return p.usageCount || 0; }).concat([1]));
    var html = '';
    sorted.forEach(function(p, i) {
      var w = Math.max(2, ((p.usageCount || 0) / maxUsage) * 260);
      var y = 10 + i * 24;
      html += '<rect x="130" y="' + y + '" width="' + w + '" height="18" fill="var(--green)" rx="3" opacity="0.75"/>';
      var name = (p.name || '').length > 15 ? (p.name || '').slice(0, 15) + '..' : (p.name || '');
      html += '<text x="125" y="' + (y + 13) + '" fill="var(--fg2)" text-anchor="end" font-size="10">' + name + '</text>';
      html += '<text x="' + (135 + w) + '" y="' + (y + 13) + '" fill="var(--fg3)" font-size="10">' + (p.usageCount || 0) + '</text>';
    });
    svg.innerHTML = html;
  }

  function renderLanguageChart(svgId, langs) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var keys = Object.keys(langs);
    if (keys.length === 0) { svg.innerHTML = '<text x="200" y="130" fill="var(--fg3)" text-anchor="middle" font-size="14">No language data</text>'; return; }
    var total = keys.reduce(function(s, k) { return s + langs[k]; }, 0);
    var colors = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--yellow)', 'var(--cyan)', 'var(--red)', 'var(--orange)'];
    var html = '';
    var cx = 130, cy = 130, r = 100;
    var startAngle = 0;
    keys.forEach(function(lang, i) {
      var pct = langs[lang] / total;
      var angle = pct * Math.PI * 2;
      var endAngle = startAngle + angle;
      var x1 = cx + r * Math.cos(startAngle);
      var y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle);
      var y2 = cy + r * Math.sin(endAngle);
      var largeArc = angle > Math.PI ? 1 : 0;
      html += '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + colors[i % colors.length] + '" opacity="0.85"/>';
      // Legend
      html += '<rect x="260" y="' + (20 + i * 22) + '" width="14" height="14" fill="' + colors[i % colors.length] + '" rx="3"/>';
      html += '<text x="280" y="' + (32 + i * 22) + '" fill="var(--fg2)" font-size="11">' + lang + ' (' + langs[lang] + ')</text>';
      startAngle = endAngle;
    });
    svg.innerHTML = html;
  }

  function renderSparkline(svgId, patterns) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var scores = patterns.map(function(p) { return p.coherencyScore && p.coherencyScore.total != null ? p.coherencyScore.total : 0; });
    if (scores.length === 0) { svg.innerHTML = '<text x="400" y="50" fill="var(--fg3)" text-anchor="middle" font-size="14">No sparkline data</text>'; return; }
    var step = 790 / Math.max(scores.length - 1, 1);
    var points = scores.map(function(s, i) { return (5 + i * step).toFixed(1) + ',' + (90 - s * 80).toFixed(1); });
    var html = '<polyline points="' + points.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.7"/>';
    // Average line
    var avg = scores.reduce(function(s, v) { return s + v; }, 0) / scores.length;
    var avgY = (90 - avg * 80).toFixed(1);
    html += '<line x1="5" y1="' + avgY + '" x2="795" y2="' + avgY + '" stroke="var(--green)" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>';
    html += '<text x="798" y="' + (parseFloat(avgY) + 4) + '" fill="var(--green)" font-size="9" text-anchor="end">avg ' + avg.toFixed(2) + '</text>';
    svg.innerHTML = html;
  }

  document.getElementById('refresh-charts-btn').addEventListener('click', function() {
    window._chartsLoaded = false;
    loadCharts();
  });

  // ─── Admin Tab ───
  function loadAdmin() {
    window._adminLoaded = true;
    // Load users
    resilientFetch('/api/users').then(function(resp) { return resp.json(); }).then(function(users) {
      if (!users || !Array.isArray(users) || users.length === 0) {
        document.getElementById('users-table').innerHTML =
          '<div style="font-size:0.82em;color:var(--fg3);padding:8px 0">' +
          'No users configured (auth may be disabled)</div>';
        return;
      }
      var html = '<table class="admin-table">' +
        '<thead><tr><th>Username</th><th>Role</th><th>Created</th></tr></thead><tbody>';
      users.forEach(function(user) {
        html += '<tr><td>' + escapeHtml(user.username) +
          '</td><td><span class="role-badge role-' + (user.role || 'viewer') + '">' +
          escapeHtml(user.role) + '</span></td><td>' +
          escapeHtml(user.created_at || '') + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('users-table').innerHTML = html;
    }).catch(function() {
      document.getElementById('users-table').innerHTML = '<div style="font-size:0.82em;color:var(--fg3);padding:8px 0">Auth disabled or not available</div>';
    });

    // Load health
    resilientFetch('/api/health').then(function(resp) { return resp.json(); }).then(function(healthData) {
      document.getElementById('system-health').innerHTML =
        '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
        '<div class="stat-card" style="flex:1;min-width:150px">' +
        '<div class="stat-label">Status</div>' +
        '<div class="stat-value" style="color:var(--green)">' +
        escapeHtml(healthData.status || 'unknown') + '</div></div>' +
        '<div class="stat-card" style="flex:1;min-width:150px">' +
        '<div class="stat-label">WS Clients</div>' +
        '<div class="stat-value">' + (healthData.wsClients || 0) + '</div></div>' +
        '</div>';
    }).catch(function() {});
  }

  // Create user button
  document.getElementById('create-user-btn').addEventListener('click', function() {
    var username = document.getElementById('new-username').value.trim();
    var password = document.getElementById('new-password').value;
    var role = document.getElementById('new-role').value;
    if (!username || !password) { showToast('Username and password required'); return; }
    resilientFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, role: role })
    }).then(function(resp) { return resp.json(); }).then(function(result) {
      if (result.error) { showToast('Error: ' + result.error); return; }
      showToast('User created: ' + result.username);
      document.getElementById('new-username').value = '';
      document.getElementById('new-password').value = '';
      window._adminLoaded = false;
      loadAdmin();
    }).catch(function() { showToast('Failed to create user'); });
  });

  // API key generation
  document.getElementById('gen-api-key-btn').addEventListener('click', function() {
    var key = 'rok_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), function(b) { return b.toString(16).padStart(2,'0'); }).join('');
    var display = document.getElementById('api-key-display');
    display.textContent = key;
    display.style.display = 'inline';
    showToast('API key generated (local only)');
  });

})();`;
}

module.exports = { getDashboardScript };
