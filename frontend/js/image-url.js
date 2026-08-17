/*
 * SOLTR shared product-image URL resolver.
 *
 * Product documents normally store bare filenames. Older documents may carry
 * an /uploads/products path, a Windows path, or an already-qualified URL.
 * Resolve all supported forms against the configured backend image origin.
 */
(function () {
  const configuredBase = String(window.SOLTR_CONFIG?.IMG || '').trim().replace(/\/+$/, '');
  const helperUrl = document.currentScript?.src || '';
  const fallbackUrl = helperUrl
    ? new URL('../assests/images/product/logo.png', helperUrl).href
    : 'assests/images/product/logo.png';

  function encodePath(pathname) {
    return pathname.split('/').filter(Boolean).map(segment => encodeURIComponent(segment)).join('/');
  }

  window.productImageUrl = function productImageUrl(value) {
    if (value === undefined || value === null) return '';
    let raw = String(value).trim();
    if (!raw) return '';
    raw = raw.replace(/\\/g, '/');

    if (/^(?:https?:|data:image\/)/i.test(raw) || raw.startsWith('//')) return raw;

    const normalized = raw.replace(/^\.\//, '');
    const lower = normalized.toLowerCase();
    const marker = lower.indexOf('uploads/products/');
    const filename = marker >= 0
      ? normalized.slice(marker + 'uploads/products/'.length)
      : normalized.replace(/^\/+/, '');

    if (!filename || !configuredBase) return '';
    return `${configuredBase}/uploads/products/${encodePath(filename)}`;
  };

  window.handleProductImageError = function handleProductImageError(image) {
    if (!image || image.dataset.fallbackApplied === 'true') return;
    image.dataset.fallbackApplied = 'true';
    image.onerror = null;
    image.src = fallbackUrl;
  };
})();
