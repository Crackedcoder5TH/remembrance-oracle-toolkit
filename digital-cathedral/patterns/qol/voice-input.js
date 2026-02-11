function createVoiceInput(options) {
  const opts = options || {};
  const lang = opts.lang || 'en-US';
  let listening = false;

  function isSupported() {
    return typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function start(onResult, onError) {
    if (!isSupported() || listening) return false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;
    recognition.onresult = function(e) {
      listening = false;
      if (onResult) onResult(e.results[0][0].transcript);
    };
    recognition.onerror = function(e) { listening = false; if (onError) onError(e.error); };
    recognition.onend = function() { listening = false; };
    recognition.start();
    listening = true;
    return true;
  }

  function stop() { listening = false; }
  function isListening() { return listening; }

  return { isSupported, start, stop, isListening };
}
module.exports = { createVoiceInput };
