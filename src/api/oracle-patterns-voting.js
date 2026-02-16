/**
 * Oracle Patterns — Voting, reputation, and GitHub identity.
 */

module.exports = {
  vote(patternId, voter, vote) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return { success: false, error: 'No SQLite store available' };
    const result = sqliteStore.votePattern(patternId, voter, vote);
    if (result.success) this._emit({ type: 'vote', patternId, voter, vote, voteScore: result.voteScore });
    return result;
  },

  getVotes(patternId) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return null;
    return sqliteStore.getVotes(patternId);
  },

  topVoted(limit = 20) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return [];
    return sqliteStore.topVoted(limit);
  },

  getVoterReputation(voterId) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return null;
    const voter = sqliteStore.getVoter(voterId);
    const history = sqliteStore.getVoterHistory(voterId, 10);
    return { ...voter, weight: sqliteStore.getVoteWeight(voterId), recentVotes: history };
  },

  topVoters(limit = 20) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return [];
    return sqliteStore.topVoters(limit);
  },

  getGitHubIdentity() {
    if (!this._githubIdentity) {
      const { GitHubIdentity } = require('../auth/github-oauth');
      const sqliteStore = this.patterns._sqlite;
      this._githubIdentity = new GitHubIdentity({ store: sqliteStore });
    }
    return this._githubIdentity;
  },

  async verifyGitHubToken(token) { return this.getGitHubIdentity().verifyToken(token); },
  async startGitHubLogin() { return this.getGitHubIdentity().startDeviceFlow(); },
  async pollGitHubLogin(deviceCode) { return this.getGitHubIdentity().pollDeviceFlow(deviceCode); },
  getVerifiedIdentity(voterId) { return this.getGitHubIdentity().getIdentity(voterId); },
  listVerifiedIdentities(limit = 50) { return this.getGitHubIdentity().listIdentities(limit); },
  isVerifiedVoter(voterId) { return this.getGitHubIdentity().isVerified(voterId); },
};
