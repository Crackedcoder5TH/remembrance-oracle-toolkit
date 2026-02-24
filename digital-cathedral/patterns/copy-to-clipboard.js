// Copy-to-clipboard — button with visual feedback state
// Uses navigator.clipboard API with success/error callback

async function copyToClipboard(text, onSuccess, onError) {
  try {
    await navigator.clipboard.writeText(text);
    if (onSuccess) onSuccess();
    return true;
  } catch (err) {
    if (onError) onError(err);
    return false;
  }
}

function createCopyState(resetDelay = 2000) {
  let copied = false;
  let timer = null;
  return {
    get copied() { return copied; },
    copy(text, onSuccess, onError) {
      return copyToClipboard(text, () => {
        copied = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { copied = false; }, resetDelay);
        if (onSuccess) onSuccess();
      }, onError);
    },
  };
}

module.exports = { copyToClipboard, createCopyState };
