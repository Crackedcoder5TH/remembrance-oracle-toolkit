/**
 * Blockchain Bridge — connects oracle-toolkit to REMEMBRANCE-BLOCKCHAIN.
 * Resolves the blockchain publisher from multiple possible locations.
 */

const fs = require('fs');
const path = require('path');

/**
 * Resolve the root directory of the REMEMBRANCE-BLOCKCHAIN repo.
 * Tries paths in order:
 *   1. BLOCKCHAIN_ROOT env var
 *   2. Sibling directory: ../REMEMBRANCE-BLOCKCHAIN (relative to cwd)
 *   3. Parent sibling: ../../REMEMBRANCE-BLOCKCHAIN (relative to oracle-toolkit root)
 * Returns the path if found, null if not.
 */
function resolveBlockchainRoot() {
  const candidates = [];

  // 1. BLOCKCHAIN_ROOT env var
  if (process.env.BLOCKCHAIN_ROOT) {
    candidates.push(path.resolve(process.env.BLOCKCHAIN_ROOT));
  }

  // 2. Sibling directory relative to cwd
  candidates.push(path.resolve(process.cwd(), '..', 'REMEMBRANCE-BLOCKCHAIN'));

  // 3. Parent sibling relative to oracle-toolkit root
  const oracleRoot = path.join(__dirname, '..', '..');
  candidates.push(path.resolve(oracleRoot, '..', 'REMEMBRANCE-BLOCKCHAIN'));

  for (const candidate of candidates) {
    try {
      const publisherPath = path.join(candidate, 'src', 'publisher');
      // Check if directory or file exists (publisher.js or publisher/index.js)
      if (fs.existsSync(publisherPath) || fs.existsSync(publisherPath + '.js')) {
        return candidate;
      }
    } catch (_) {
      // skip inaccessible paths
    }
  }

  return null;
}

/**
 * Get a Publisher instance from REMEMBRANCE-BLOCKCHAIN.
 * Returns null if the blockchain repo is not found.
 */
function getPublisher(options = {}) {
  const root = resolveBlockchainRoot();
  if (!root) return null;

  try {
    const publisherModule = require(path.join(root, 'src', 'publisher'));
    const Publisher = publisherModule.Publisher || publisherModule;

    if (typeof Publisher === 'function') {
      return new Publisher({
        oracleRoot: path.join(__dirname, '..', '..'),
        network: options.network || 'devnet',
        walletPath: options.walletPath || null,
      });
    }

    // If it's already an object with a publish method, return it directly
    if (Publisher && typeof Publisher.publish === 'function') {
      return Publisher;
    }

    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Publish a pattern to the blockchain.
 * Returns a promise that resolves to { published, hash, watermark, bridgeStatus, signature, reasons }.
 * The publisher may be sync or async — this function always returns a promise.
 */
async function publishPattern(pattern, options = {}) {
  const publisher = getPublisher(options);
  if (!publisher) {
    return { published: false, reasons: ['REMEMBRANCE-BLOCKCHAIN not found'] };
  }

  try {
    const result = await publisher.publish(pattern);
    return result;
  } catch (err) {
    return { published: false, reasons: [err.message || String(err)] };
  }
}

module.exports = { resolveBlockchainRoot, getPublisher, publishPattern };
