const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { TeamManager, TEAM_ROLES } = require('../src/auth/teams');

describe('TeamManager', () => {
  let tm;
  const ownerId = 'user-1';
  const memberId = 'user-2';
  const viewerId = 'user-3';
  let orgId;

  beforeEach(() => {
    tm = new TeamManager({});
    const org = tm.createOrg('TestOrg', ownerId);
    orgId = org.id;
  });

  describe('createOrg', () => {
    it('creates an organization', () => {
      const org = tm.createOrg('NewOrg', 'user-99');
      assert.ok(org.id);
      assert.equal(org.name, 'NewOrg');
      assert.equal(org.owner, 'user-99');
    });

    it('sets owner as first member', () => {
      const members = tm.listMembers(orgId, ownerId);
      assert.equal(members.length, 1);
      assert.equal(members[0].role, TEAM_ROLES.OWNER);
    });

    it('throws without name or owner', () => {
      assert.throws(() => tm.createOrg('', 'user'), /Name and owner required/);
    });
  });

  describe('getOrg', () => {
    it('returns org by id', () => {
      const org = tm.getOrg(orgId);
      assert.equal(org.name, 'TestOrg');
    });

    it('returns null for unknown id', () => {
      assert.equal(tm.getOrg('nonexistent'), null);
    });
  });

  describe('listUserOrgs', () => {
    it('lists orgs for a user', () => {
      const orgs = tm.listUserOrgs(ownerId);
      assert.equal(orgs.length, 1);
      assert.equal(orgs[0].name, 'TestOrg');
      assert.equal(orgs[0].role, TEAM_ROLES.OWNER);
    });

    it('returns empty for non-member', () => {
      assert.equal(tm.listUserOrgs('nobody').length, 0);
    });
  });

  describe('addMember', () => {
    it('adds a member', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.MEMBER);
      const members = tm.listMembers(orgId, ownerId);
      assert.equal(members.length, 2);
    });

    it('throws for non-admin', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.VIEWER);
      assert.throws(
        () => tm.addMember(orgId, memberId, viewerId),
        /Admin access required/
      );
    });

    it('throws for invalid role', () => {
      assert.throws(
        () => tm.addMember(orgId, ownerId, memberId, 'superadmin'),
        /Invalid role/
      );
    });

    it('enforces max members', () => {
      const org = tm.getOrg(orgId);
      org.maxMembers = 2;
      tm.addMember(orgId, ownerId, memberId);
      assert.throws(
        () => tm.addMember(orgId, ownerId, viewerId),
        /Maximum members/
      );
    });
  });

  describe('removeMember', () => {
    it('removes a member', () => {
      tm.addMember(orgId, ownerId, memberId);
      tm.removeMember(orgId, ownerId, memberId);
      const members = tm.listMembers(orgId, ownerId);
      assert.equal(members.length, 1);
    });

    it('allows self-removal', () => {
      tm.addMember(orgId, ownerId, memberId);
      tm.removeMember(orgId, memberId, memberId);
    });

    it('cannot remove owner', () => {
      assert.throws(
        () => tm.removeMember(orgId, ownerId, ownerId),
        /Cannot remove the owner/
      );
    });
  });

  describe('updateMemberRole', () => {
    it('updates role', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.VIEWER);
      tm.updateMemberRole(orgId, ownerId, memberId, TEAM_ROLES.MEMBER);
      const members = tm.listMembers(orgId, ownerId);
      const member = members.find(m => m.userId === memberId);
      assert.equal(member.role, TEAM_ROLES.MEMBER);
    });
  });

  describe('updateOrg', () => {
    it('updates org settings', () => {
      const updated = tm.updateOrg(orgId, ownerId, { name: 'Renamed', settings: { minCoherency: 0.8 } });
      assert.equal(updated.name, 'Renamed');
      assert.equal(updated.settings.minCoherency, 0.8);
    });

    it('throws for non-admin', () => {
      tm.addMember(orgId, ownerId, viewerId, TEAM_ROLES.VIEWER);
      assert.throws(() => tm.updateOrg(orgId, viewerId, { name: 'X' }), /Admin access required/);
    });
  });

  describe('deleteOrg', () => {
    it('deletes org as owner', () => {
      const result = tm.deleteOrg(orgId, ownerId);
      assert.ok(result.deleted);
      assert.equal(tm.getOrg(orgId), null);
    });

    it('throws for non-owner', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.ADMIN);
      assert.throws(() => tm.deleteOrg(orgId, memberId), /Only the owner/);
    });
  });

  describe('invite system', () => {
    it('creates and accepts invite', () => {
      const invite = tm.createInvite(orgId, ownerId);
      assert.ok(invite.token);
      const result = tm.acceptInvite(invite.token, memberId);
      assert.equal(result.orgId, orgId);
      assert.equal(result.role, TEAM_ROLES.MEMBER);
      assert.ok(tm.canView(orgId, memberId));
    });

    it('rejects invalid invite', () => {
      assert.throws(() => tm.acceptInvite('bad-token', memberId), /Invalid invite/);
    });

    it('rejects expired invite', () => {
      const invite = tm.createInvite(orgId, ownerId, { expiresIn: -1000 });
      assert.throws(() => tm.acceptInvite(invite.token, memberId), /expired/);
    });

    it('rejects used invite', () => {
      const invite = tm.createInvite(orgId, ownerId, { maxUses: 1 });
      tm.acceptInvite(invite.token, memberId);
      assert.throws(() => tm.acceptInvite(invite.token, viewerId), /Invalid|used/);
    });
  });

  describe('SSO', () => {
    it('registers SSO provider', () => {
      const result = tm.registerSSOProvider(orgId, ownerId, {
        type: 'oidc',
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        clientSecret: 'secret',
      });
      assert.ok(result.configured);
    });

    it('gets SSO config', () => {
      tm.registerSSOProvider(orgId, ownerId, { type: 'saml', issuer: 'https://idp.example.com' });
      const config = tm.getSSOConfig(orgId);
      assert.equal(config.type, 'saml');
    });

    it('throws for non-owner', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.ADMIN);
      assert.throws(
        () => tm.registerSSOProvider(orgId, memberId, { type: 'oidc' }),
        /Owner access required/
      );
    });

    it('validates SSO token', () => {
      tm.registerSSOProvider(orgId, ownerId, { type: 'oidc', issuer: 'test' });
      const result = tm.validateSSOToken(orgId, 'fake-token');
      assert.ok(result.valid);
    });

    it('returns null for unconfigured org', () => {
      assert.equal(tm.validateSSOToken('no-org', 'token'), null);
    });
  });

  describe('audit log', () => {
    it('records actions', () => {
      tm.addMember(orgId, ownerId, memberId);
      const log = tm.getAuditLog(orgId, ownerId);
      assert.ok(log.length >= 2); // org_created + member_added
      assert.ok(log.some(e => e.action === 'member_added'));
    });

    it('throws for non-admin', () => {
      tm.addMember(orgId, ownerId, viewerId, TEAM_ROLES.VIEWER);
      assert.throws(() => tm.getAuditLog(orgId, viewerId), /Admin access required/);
    });
  });

  describe('permissions', () => {
    it('canSubmit for member', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.MEMBER);
      assert.ok(tm.canSubmit(orgId, memberId));
    });

    it('canView for viewer', () => {
      tm.addMember(orgId, ownerId, viewerId, TEAM_ROLES.VIEWER);
      assert.ok(tm.canView(orgId, viewerId));
      assert.ok(!tm.canSubmit(orgId, viewerId));
    });

    it('canManage for admin', () => {
      tm.addMember(orgId, ownerId, memberId, TEAM_ROLES.ADMIN);
      assert.ok(tm.canManage(orgId, memberId));
    });

    it('owner has all permissions', () => {
      assert.ok(tm.canSubmit(orgId, ownerId));
      assert.ok(tm.canView(orgId, ownerId));
      assert.ok(tm.canManage(orgId, ownerId));
    });
  });
});
