/**
 * Team & Organization Auth Layer
 *
 * Extends AuthManager with multi-tenant organization support:
 *   - Organizations with isolated pattern stores
 *   - Team-level roles (org-admin, member, viewer)
 *   - Invite system with expiring tokens
 *   - Org-scoped pattern sharing
 *   - SSO bridge for SAML/OIDC providers
 *   - Audit log for compliance
 */

const crypto = require('crypto');

// ─── Team Roles ───

const TEAM_ROLES = Object.freeze({
  OWNER: 'owner',       // Full control, can delete org
  ADMIN: 'org-admin',   // Manage members, patterns, settings
  MEMBER: 'member',     // Submit and use patterns
  VIEWER: 'viewer',     // Read-only access
});

const TEAM_ROLE_HIERARCHY = { owner: 4, 'org-admin': 3, member: 2, viewer: 1 };

// ─── Team Manager ───

class TeamManager {
  /**
   * @param {object} options
   *   - authManager: AuthManager instance (required)
   *   - store: SQLite store or null (in-memory fallback)
   */
  constructor(options = {}) {
    this.auth = options.authManager;
    this._orgs = new Map();       // orgId → org
    this._members = new Map();    // orgId → Map<userId, role>
    this._invites = new Map();    // token → invite
    this._auditLog = [];
    this._ssoProviders = new Map();
  }

  // ─── Organization Management ───

  /**
   * Create a new organization.
   * @param {string} name - Org display name
   * @param {string} ownerId - User ID of the creator
   * @returns {object} { id, name, owner, createdAt }
   */
  createOrg(name, ownerId) {
    if (!name || !ownerId) throw new Error('Name and owner required');

    const id = crypto.randomUUID();
    const org = {
      id,
      name,
      owner: ownerId,
      plan: 'free',
      maxMembers: 10,
      maxPatterns: 5000,
      createdAt: new Date().toISOString(),
      settings: { requireTests: true, minCoherency: 0.6 },
    };

    this._orgs.set(id, org);
    this._members.set(id, new Map([[ownerId, TEAM_ROLES.OWNER]]));
    this._audit(ownerId, id, 'org_created', { name });

    return org;
  }

  /**
   * Get organization by ID.
   */
  getOrg(orgId) {
    return this._orgs.get(orgId) || null;
  }

  /**
   * List organizations a user belongs to.
   */
  listUserOrgs(userId) {
    const orgs = [];
    for (const [orgId, members] of this._members) {
      if (members.has(userId)) {
        const org = this._orgs.get(orgId);
        if (org) {
          orgs.push({ ...org, role: members.get(userId) });
        }
      }
    }
    return orgs;
  }

  /**
   * Update org settings.
   */
  updateOrg(orgId, userId, updates) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.ADMIN)) {
      throw new Error('Admin access required');
    }
    const org = this._orgs.get(orgId);
    if (!org) throw new Error('Organization not found');

    if (updates.name) org.name = updates.name;
    if (updates.settings) Object.assign(org.settings, updates.settings);
    if (updates.plan) org.plan = updates.plan;
    if (updates.maxMembers) org.maxMembers = updates.maxMembers;

    this._audit(userId, orgId, 'org_updated', updates);
    return org;
  }

  /**
   * Delete an organization (owner only).
   */
  deleteOrg(orgId, userId) {
    const org = this._orgs.get(orgId);
    if (!org) throw new Error('Organization not found');
    if (org.owner !== userId) throw new Error('Only the owner can delete an org');

    this._audit(userId, orgId, 'org_deleted', { name: org.name });
    this._orgs.delete(orgId);
    this._members.delete(orgId);
    return { deleted: true };
  }

  // ─── Member Management ───

  /**
   * Add a member to an organization.
   */
  addMember(orgId, userId, targetUserId, role = TEAM_ROLES.MEMBER) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.ADMIN)) {
      throw new Error('Admin access required');
    }
    const org = this._orgs.get(orgId);
    if (!org) throw new Error('Organization not found');

    const members = this._members.get(orgId);
    if (members.size >= org.maxMembers) {
      throw new Error(`Maximum members (${org.maxMembers}) reached`);
    }

    if (!Object.values(TEAM_ROLES).includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    members.set(targetUserId, role);
    this._audit(userId, orgId, 'member_added', { targetUserId, role });
    return { added: true, role };
  }

  /**
   * Remove a member from an organization.
   */
  removeMember(orgId, userId, targetUserId) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.ADMIN) && userId !== targetUserId) {
      throw new Error('Admin access required');
    }
    const org = this._orgs.get(orgId);
    if (!org) throw new Error('Organization not found');
    if (org.owner === targetUserId) throw new Error('Cannot remove the owner');

    const members = this._members.get(orgId);
    members.delete(targetUserId);
    this._audit(userId, orgId, 'member_removed', { targetUserId });
    return { removed: true };
  }

  /**
   * Update a member's role.
   */
  updateMemberRole(orgId, userId, targetUserId, newRole) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.ADMIN)) {
      throw new Error('Admin access required');
    }
    if (!Object.values(TEAM_ROLES).includes(newRole)) {
      throw new Error(`Invalid role: ${newRole}`);
    }
    const members = this._members.get(orgId);
    if (!members || !members.has(targetUserId)) {
      throw new Error('User is not a member');
    }
    members.set(targetUserId, newRole);
    this._audit(userId, orgId, 'role_updated', { targetUserId, newRole });
    return { updated: true, role: newRole };
  }

  /**
   * List members of an organization.
   */
  listMembers(orgId, userId) {
    if (!this._isMember(orgId, userId)) {
      throw new Error('Not a member of this organization');
    }
    const members = this._members.get(orgId);
    if (!members) return [];
    return Array.from(members.entries()).map(([uid, role]) => ({ userId: uid, role }));
  }

  // ─── Invite System ───

  /**
   * Create an invite link for an organization.
   */
  createInvite(orgId, userId, options = {}) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.ADMIN)) {
      throw new Error('Admin access required');
    }
    const token = crypto.randomBytes(24).toString('hex');
    const invite = {
      token,
      orgId,
      role: options.role || TEAM_ROLES.MEMBER,
      createdBy: userId,
      expiresAt: new Date(Date.now() + (options.expiresIn || 7 * 86400000)).toISOString(),
      maxUses: options.maxUses || 1,
      uses: 0,
    };
    this._invites.set(token, invite);
    this._audit(userId, orgId, 'invite_created', { role: invite.role });
    return invite;
  }

  /**
   * Accept an invite.
   */
  acceptInvite(token, userId) {
    const invite = this._invites.get(token);
    if (!invite) throw new Error('Invalid invite');
    if (new Date(invite.expiresAt) < new Date()) {
      this._invites.delete(token);
      throw new Error('Invite expired');
    }
    if (invite.uses >= invite.maxUses) {
      throw new Error('Invite has been used');
    }

    invite.uses++;
    if (invite.uses >= invite.maxUses) this._invites.delete(token);

    const members = this._members.get(invite.orgId);
    if (members) {
      members.set(userId, invite.role);
    }
    this._audit(userId, invite.orgId, 'invite_accepted', { role: invite.role });
    return { orgId: invite.orgId, role: invite.role };
  }

  // ─── SSO Bridge ───

  /**
   * Register an SSO provider for an organization.
   */
  registerSSOProvider(orgId, userId, provider) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.OWNER)) {
      throw new Error('Owner access required');
    }
    const config = {
      type: provider.type || 'oidc',
      issuer: provider.issuer,
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      callbackUrl: provider.callbackUrl,
      orgId,
      createdAt: new Date().toISOString(),
    };
    this._ssoProviders.set(orgId, config);
    this._audit(userId, orgId, 'sso_configured', { type: config.type, issuer: config.issuer });
    return { configured: true, type: config.type };
  }

  /**
   * Get SSO config for an org.
   */
  getSSOConfig(orgId) {
    return this._ssoProviders.get(orgId) || null;
  }

  /**
   * Validate an SSO token and return the org membership.
   * In production, this would verify against the IdP.
   */
  validateSSOToken(orgId, ssoToken) {
    const config = this._ssoProviders.get(orgId);
    if (!config) return null;
    // Placeholder — in production, verify JWT against IdP's JWKS
    return { valid: true, orgId, provider: config.type };
  }

  // ─── Audit Log ───

  /**
   * Get audit log for an organization.
   */
  getAuditLog(orgId, userId, options = {}) {
    if (!this._hasRole(orgId, userId, TEAM_ROLES.ADMIN)) {
      throw new Error('Admin access required');
    }
    const limit = options.limit || 50;
    return this._auditLog
      .filter(e => e.orgId === orgId)
      .slice(-limit)
      .reverse();
  }

  _audit(userId, orgId, action, details = {}) {
    this._auditLog.push({
      id: crypto.randomUUID(),
      userId,
      orgId,
      action,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Permission Checks ───

  _isMember(orgId, userId) {
    const members = this._members.get(orgId);
    return members && members.has(userId);
  }

  _getRole(orgId, userId) {
    const members = this._members.get(orgId);
    return members ? members.get(userId) : null;
  }

  _hasRole(orgId, userId, minRole) {
    const role = this._getRole(orgId, userId);
    if (!role) return false;
    const minLevel = TEAM_ROLE_HIERARCHY[minRole] || 0;
    const userLevel = TEAM_ROLE_HIERARCHY[role] || 0;
    return userLevel >= minLevel;
  }

  /**
   * Check if a user can submit patterns to an org.
   */
  canSubmit(orgId, userId) {
    return this._hasRole(orgId, userId, TEAM_ROLES.MEMBER);
  }

  /**
   * Check if a user can read patterns from an org.
   */
  canView(orgId, userId) {
    return this._hasRole(orgId, userId, TEAM_ROLES.VIEWER);
  }

  /**
   * Check if a user can manage an org.
   */
  canManage(orgId, userId) {
    return this._hasRole(orgId, userId, TEAM_ROLES.ADMIN);
  }
}

module.exports = { TeamManager, TEAM_ROLES, TEAM_ROLE_HIERARCHY };
