(function () {
  'use strict';

  var STORAGE_KEY = 'soltr_theme';
  var VALID_THEMES = ['light', 'dark'];
  var toggleButton = null;

  function readStoredTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.indexOf(value) !== -1 ? value : null;
    } catch (error) {
      return null;
    }
  }

  function getTheme() {
    var current = document.documentElement.dataset.theme;
    return VALID_THEMES.indexOf(current) !== -1 ? current : 'dark';
  }

  function setTheme(theme, persist) {
    if (VALID_THEMES.indexOf(theme) === -1) return;

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    if (persist !== false) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {
        /* Private browsing or disabled storage should not block theme use. */
      }
    }

    updateToggle();
  }

  function updateToggle() {
    if (!toggleButton) return;

    var theme = getTheme();
    var nextTheme = theme === 'dark' ? 'light' : 'dark';
    var isDark = theme === 'dark';

    toggleButton.dataset.theme = theme;
    toggleButton.setAttribute('aria-pressed', String(isDark));
    toggleButton.setAttribute('aria-label', 'Switch to ' + nextTheme + ' mode');
    toggleButton.title = 'Switch to ' + nextTheme + ' mode';

    var icon = toggleButton.querySelector('.theme-toggle-icon');
    var label = toggleButton.querySelector('.theme-toggle-label');
    if (icon) icon.textContent = isDark ? '☀' : '☾';
    if (label) label.textContent = isDark ? 'Light' : 'Dark';
  }

  function createToggle() {
    var host = document.querySelector('[data-theme-toggle-host]');

    if (!host) {
      var headerActions = document.querySelector('.header-actions');
      var dashboardActions = document.querySelector('.topbar-right');
      var pageHeader = document.querySelector('header');
      var loginScreen = document.querySelector('.login-screen');

      if (headerActions) {
        host = document.createElement('div');
        host.className = 'theme-toggle-host';
        headerActions.appendChild(host);
      } else if (dashboardActions) {
        host = document.createElement('div');
        host.className = 'theme-toggle-host';
        dashboardActions.insertBefore(host, dashboardActions.firstChild);
      } else if (pageHeader) {
        host = document.createElement('div');
        host.className = 'theme-toggle-host';
        pageHeader.appendChild(host);
      } else if (loginScreen) {
        host = document.createElement('div');
        host.className = 'theme-toggle-host theme-toggle-host--standalone';
        loginScreen.appendChild(host);
      }
    }

    if (!host || host.querySelector('.theme-toggle')) return;

    toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'theme-toggle';
    toggleButton.innerHTML = '<span class="theme-toggle-icon" aria-hidden="true"></span><span class="theme-toggle-label"></span>';
    toggleButton.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark', true);
    });
    host.appendChild(toggleButton);
    updateToggle();
  }

  document.addEventListener('DOMContentLoaded', createToggle);
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY && VALID_THEMES.indexOf(event.newValue) !== -1) {
      setTheme(event.newValue, false);
    }
  });

  window.SOLTR_THEME = {
    get: getTheme,
    set: function (theme) { setTheme(theme, true); },
    toggle: function () { setTheme(getTheme() === 'dark' ? 'light' : 'dark', true); }
  };
})();
