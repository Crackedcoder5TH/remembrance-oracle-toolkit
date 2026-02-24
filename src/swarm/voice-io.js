'use strict';

const { execSync, exec } = require('child_process');

/**
 * Voice Input / Whisper Output Module
 *
 * Speak task → swarm processes → reads back winner whisper aloud.
 * Uses OS-level TTS/STT tools (no npm dependencies):
 *   - macOS: `say` for TTS, no built-in STT
 *   - Linux: `espeak`/`festival` for TTS, `arecord` + external for STT
 *   - Fallback: file-based input, silent output
 *
 * Oracle decision: EVOLVE from pipe (0.970) + cli (0.610)
 */

/**
 * Detect available voice capabilities on this system.
 *
 * @returns {object} { tts: string|null, stt: string|null, platform: string }
 */
function detectVoiceCapabilities() {
  const platform = process.platform;
  let tts = null;
  let stt = null;

  if (platform === 'darwin') {
    try { execSync('which say', { stdio: 'ignore' }); tts = 'say'; } catch {}
  } else if (platform === 'linux') {
    try { execSync('which espeak', { stdio: 'ignore' }); tts = 'espeak'; } catch {}
    if (!tts) {
      try { execSync('which festival', { stdio: 'ignore' }); tts = 'festival'; } catch {}
    }
  } else if (platform === 'win32') {
    // PowerShell SAPI always available on Windows
    tts = 'powershell-sapi';
  }

  // STT detection (optional, rarer)
  try { execSync('which whisper', { stdio: 'ignore' }); stt = 'whisper'; } catch {}

  return { tts, stt, platform };
}

/**
 * Speak text aloud using the best available TTS engine.
 *
 * @param {string} text - Text to speak
 * @param {object} [options] - { engine, rate, voice }
 * @returns {{ spoken: boolean, engine: string|null }}
 */
function speak(text, options = {}) {
  if (!text || text.trim().length === 0) {
    return { spoken: false, engine: null };
  }

  const caps = detectVoiceCapabilities();
  const engine = options.engine || caps.tts;

  if (!engine) {
    return { spoken: false, engine: null };
  }

  // Sanitize text for shell (remove special chars, limit length)
  const safe = sanitizeForShell(text).slice(0, 2000);

  try {
    switch (engine) {
      case 'say': {
        const rate = options.rate || 180;
        const voice = options.voice || '';
        const voiceFlag = voice ? `-v "${voice}"` : '';
        execSync(`say ${voiceFlag} -r ${rate} "${safe}"`, { stdio: 'ignore', timeout: 30000 });
        break;
      }
      case 'espeak': {
        const rate = options.rate || 160;
        execSync(`espeak -s ${rate} "${safe}"`, { stdio: 'ignore', timeout: 30000 });
        break;
      }
      case 'festival': {
        execSync(`echo "${safe}" | festival --tts`, { stdio: 'ignore', timeout: 30000 });
        break;
      }
      case 'powershell-sapi': {
        const psCmd = `Add-Type -AssemblyName System.speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${safe.replace(/'/g, "''")}')`;
        execSync(`powershell -Command "${psCmd}"`, { stdio: 'ignore', timeout: 30000 });
        break;
      }
      default:
        return { spoken: false, engine: null };
    }
    return { spoken: true, engine };
  } catch {
    return { spoken: false, engine };
  }
}

/**
 * Speak a swarm whisper narrative aloud.
 * Formats the whisper for oral delivery (shorter, punchier).
 *
 * @param {object} whisper - From synthesizeWhisper()
 * @param {object} [options] - TTS options
 * @returns {{ spoken: boolean, text: string }}
 */
function speakWhisper(whisper, options = {}) {
  if (!whisper || !whisper.message) {
    return { spoken: false, text: '' };
  }

  // Build oral summary — shorter than full whisper
  const parts = [];

  if (whisper.winner) {
    parts.push(`${whisper.winner.agent} wins with score ${whisper.winner.score.toFixed(2)}.`);
  }

  const pct = Math.round((whisper.agreement || 0) * 100);
  parts.push(`${pct} percent agreement.`);

  if (whisper.recommendation) {
    parts.push(`Recommendation: ${whisper.recommendation}.`);
  }

  if (whisper.dissent && whisper.dissent.length > 0) {
    parts.push(`${whisper.dissent.length} dissenting voice${whisper.dissent.length > 1 ? 's' : ''}.`);
  }

  const text = parts.join(' ');
  const result = speak(text, options);

  return { spoken: result.spoken, text };
}

/**
 * Speak the swarm result summary aloud.
 *
 * @param {object} result - SwarmResult
 * @param {object} [options] - TTS options
 * @returns {{ spoken: boolean, text: string }}
 */
function speakResult(result, options = {}) {
  if (!result) return { spoken: false, text: '' };

  const parts = [];

  if (result.winner) {
    parts.push(`Swarm complete. Winner: ${result.winner.agent}, score ${result.winner.score.toFixed(2)}.`);
    parts.push(`${Math.round(result.agreement * 100)} percent agreement across ${result.agentCount} agents.`);
  } else {
    parts.push('Swarm could not reach consensus.');
  }

  if (result.whisper?.recommendation) {
    parts.push(`Recommendation: ${result.whisper.recommendation}.`);
  }

  const text = parts.join(' ');
  const spoken = speak(text, options);

  return { spoken: spoken.spoken, text };
}

/**
 * Read a voice input file (for async STT workflows).
 * Supports .txt files and transcription results.
 *
 * @param {string} filePath - Path to text/transcription file
 * @returns {string|null} Extracted task text
 */
function readVoiceInput(filePath) {
  const fs = require('fs');
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/**
 * Sanitize text for safe shell command usage.
 */
function sanitizeForShell(text) {
  return text
    .replace(/["`$\\]/g, '')   // Remove shell-dangerous chars
    .replace(/\n/g, '. ')      // Convert newlines to periods
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .trim();
}

module.exports = {
  detectVoiceCapabilities,
  speak,
  speakWhisper,
  speakResult,
  readVoiceInput,
  sanitizeForShell,
};
