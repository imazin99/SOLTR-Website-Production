(function () {
  var STORAGE_KEY = 'soltr_theme';
  var theme = null;

  try {
    theme = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    theme = null;
  }

  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
