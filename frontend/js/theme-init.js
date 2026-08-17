(function () {
  var STORAGE_KEY = 'soltr_theme';
  var theme = null;

  try {
    theme = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    theme = null;
  }

  if (theme !== 'light' && theme !== 'dark') {
    theme = 'dark';
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
