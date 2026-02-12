/**
 * Voting & identity CLI commands: vote, top-voted, reputation, github
 */

const { c, colorScore } = require('../colors');

function registerVotingCommands(handlers, { oracle, jsonOut }) {

  handlers['vote'] = (args) => {
    const id = args.id || process.argv[3];
    const direction = args.direction || process.argv[4] || 'up';
    const voter = args.voter || process.env.USER || 'anonymous';
    if (!id) { console.error(`Usage: ${c.cyan('oracle vote')} <pattern-id> [up|down] [--voter <name>]`); process.exit(1); }
    const vote = direction === 'down' || direction === 'downvote' || direction === '-1' ? -1 : 1;
    const result = oracle.vote(id, voter, vote);
    if (result.success) {
      console.log(`${vote > 0 ? c.boldGreen('Upvoted') : c.boldRed('Downvoted')} pattern ${c.bold(id)}`);
      console.log(`  Votes: ${c.green('+' + result.upvotes)} / ${c.red('-' + result.downvotes)} (score: ${result.voteScore})`);
      console.log(`  Vote weight: ${c.cyan(String(result.weight))} (reputation: ${c.cyan(String(result.voterReputation))})`);
    } else {
      console.log(c.red(result.error));
    }
  };

  handlers['top-voted'] = handlers['topvoted'] = (args) => {
    const limit = parseInt(args.limit) || 20;
    const patterns = oracle.topVoted(limit);
    if (patterns.length === 0) {
      console.log(c.dim('No voted patterns yet.'));
      return;
    }
    console.log(c.boldCyan(`Top ${patterns.length} patterns by community votes:\n`));
    for (const p of patterns) {
      const score = (p.upvotes || 0) - (p.downvotes || 0);
      const icon = score > 0 ? c.green(`+${score}`) : score < 0 ? c.red(String(score)) : c.dim('0');
      console.log(`  [${icon}] ${c.bold(p.name)} (${p.language}) — coherency: ${colorScore((p.coherencyScore?.total ?? 0).toFixed(3))}`);
    }
  };

  handlers['reputation'] = handlers['rep'] = (args) => {
    const sub = process.argv[3];
    if (sub === 'check' || !sub) {
      const voter = args.voter || process.argv[4] || process.env.USER || 'anonymous';
      const rep = oracle.getVoterReputation(voter);
      if (!rep) { console.log(c.dim('No reputation data.')); return; }
      console.log(c.boldCyan(`Voter Reputation: ${c.bold(rep.id)}\n`));
      console.log(`  Reputation: ${colorScore(String(rep.reputation))}`);
      console.log(`  Vote weight: ${c.cyan(String(rep.weight))}`);
      console.log(`  Total votes: ${rep.total_votes} | Accurate: ${rep.accurate_votes}`);
      console.log(`  Contributions: ${rep.contributions}`);
      if (rep.recentVotes.length > 0) {
        console.log(`\n  Recent votes:`);
        for (const v of rep.recentVotes) {
          const dir = v.vote > 0 ? c.green('+1') : c.red('-1');
          console.log(`    ${dir} ${c.bold(v.pattern_name || v.pattern_id)} (${v.language || '?'}) — weight: ${v.weight || 1.0}`);
        }
      }
    } else if (sub === 'top' || sub === 'leaderboard') {
      const limit = parseInt(args.limit) || 20;
      const voters = oracle.topVoters(limit);
      if (voters.length === 0) { console.log(c.dim('No voters yet.')); return; }
      console.log(c.boldCyan(`Top ${voters.length} contributors by reputation:\n`));
      for (const v of voters) {
        const repStr = colorScore(String(v.reputation));
        console.log(`  ${repStr} ${c.bold(v.id)} — votes: ${v.total_votes} | accurate: ${v.accurate_votes}`);
      }
    }
  };

  handlers['github'] = handlers['gh-auth'] = (args) => {
    const { GitHubIdentity } = require('../../auth/github-oauth');
    const sub = process.argv[3];
    const sqliteStore = oracle.store.getSQLiteStore();
    const ghIdentity = new GitHubIdentity({ store: sqliteStore });

    if (sub === 'verify') {
      const token = args.token || process.env.GITHUB_TOKEN;
      if (!token) {
        console.log(`${c.boldRed('Error:')} Provide --token <PAT> or set GITHUB_TOKEN env var`);
        process.exit(1);
      }
      ghIdentity.verifyToken(token).then((result) => {
        if (result.success) {
          console.log(`${c.boldGreen('\u2713')} Verified GitHub identity: ${c.bold(result.username)}`);
          console.log(`  Voter ID: ${c.cyan(result.voterId)}`);
          console.log(`  GitHub ID: ${result.githubId}`);
          console.log(`\n  ${c.dim('Your votes will now be linked to your GitHub identity.')}`);
        } else {
          console.log(`${c.boldRed('\u2717')} Verification failed: ${result.error}`);
        }
      });
      return;
    }

    if (sub === 'login') {
      ghIdentity.startDeviceFlow().then((result) => {
        if (result.error) {
          console.log(`${c.boldRed('Error:')} ${result.error}`);
          return;
        }
        console.log(`\n${c.boldCyan('GitHub Login')}\n`);
        console.log(`  1. Go to: ${c.bold(result.verificationUrl)}`);
        console.log(`  2. Enter code: ${c.boldGreen(result.userCode)}\n`);
        console.log(`  ${c.dim('Waiting for authorization...')}`);

        const poll = setInterval(async () => {
          const pollResult = await ghIdentity.pollDeviceFlow(result.deviceCode);
          if (pollResult.pending) return;
          clearInterval(poll);
          if (pollResult.success) {
            console.log(`\n${c.boldGreen('\u2713')} Logged in as ${c.bold(pollResult.username)}`);
            console.log(`  Voter ID: ${c.cyan(pollResult.voterId)}`);
          } else {
            console.log(`\n${c.boldRed('\u2717')} Login failed: ${pollResult.error}`);
          }
        }, (result.interval || 5) * 1000);

        setTimeout(() => {
          clearInterval(poll);
          console.log(`\n${c.yellow('Login expired. Try again with:')} ${c.cyan('oracle github login')}`);
        }, (result.expiresIn || 900) * 1000);
      });
      return;
    }

    if (sub === 'status' || sub === 'identities') {
      const identities = ghIdentity.listIdentities(parseInt(args.limit) || 20);
      if (identities.length === 0) {
        console.log(c.dim('No verified GitHub identities.'));
        console.log(`${c.dim('Link your GitHub:')} ${c.cyan('oracle github verify --token <PAT>')}`);
        return;
      }
      console.log(`\n${c.boldCyan('Verified GitHub Identities')}\n`);
      for (const id of identities) {
        console.log(`  ${c.boldGreen('\u2713')} ${c.bold(id.github_username)} (${c.dim(id.voter_id)}) — ${id.contributions || 0} contributions`);
      }
      return;
    }

    if (sub === 'whoami') {
      const voter = args.voter || `github:${process.env.GITHUB_USER || process.env.USER || 'unknown'}`;
      const identity = ghIdentity.getIdentity(voter);
      if (identity) {
        console.log(`${c.boldGreen('\u2713')} ${c.bold(identity.github_username)}`);
        console.log(`  Voter ID: ${c.cyan(identity.voter_id)}`);
        console.log(`  Verified: ${c.dim(identity.verified_at)}`);
        console.log(`  Contributions: ${identity.contributions || 0}`);
      } else {
        console.log(c.dim('No linked GitHub identity found.'));
        console.log(`${c.dim('Verify with:')} ${c.cyan('oracle github verify --token <PAT>')}`);
      }
      return;
    }

    console.log(`${c.bold('GitHub Identity')}\n`);
    console.log(`  ${c.cyan('oracle github verify')} --token <PAT>   Verify GitHub PAT and link identity`);
    console.log(`  ${c.cyan('oracle github login')}                  OAuth device flow (browser-based)`);
    console.log(`  ${c.cyan('oracle github status')}                 List verified identities`);
    console.log(`  ${c.cyan('oracle github whoami')}                 Show your linked identity`);
  };
}

module.exports = { registerVotingCommands };
