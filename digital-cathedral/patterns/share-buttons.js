// Share-buttons — social sharing with URL encoding
// Supports X (Twitter) share and generic share text generation

function buildShareUrl(platform, text) {
  if (platform === 'x' || platform === 'twitter') {
    return 'https://x.com/intent/tweet?text=' + encodeURIComponent(text);
  }
  if (platform === 'linkedin') {
    return 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(text);
  }
  if (platform === 'email') {
    return 'mailto:?body=' + encodeURIComponent(text);
  }
  return '';
}

function openShareWindow(url) {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function shareOnPlatform(platform, text) {
  const url = buildShareUrl(platform, text);
  if (url) openShareWindow(url);
  return url;
}

module.exports = { buildShareUrl, openShareWindow, shareOnPlatform };
