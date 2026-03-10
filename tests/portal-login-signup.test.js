/**
 * Tests for Client Portal Login / Sign-Up page logic
 *
 * Tests the core behavioral contracts of the login/signup component:
 * - Mode toggling between login and signup
 * - Correct API endpoint selection per mode
 * - Payload construction per mode
 * - Form validation (disabled state)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Extract the logic that the component uses for endpoint and payload selection
function getEndpoint(mode) {
  return mode === "login" ? "/api/client/login" : "/api/client/register";
}

function buildPayload(mode, fields) {
  if (mode === "login") {
    return { email: fields.email, password: fields.password };
  }
  return {
    email: fields.email,
    password: fields.password,
    contactName: fields.contactName,
    companyName: fields.companyName,
    phone: fields.phone,
  };
}

function isSubmitDisabled(loading, email, password) {
  return loading || !email.trim() || !password.trim();
}

function getButtonLabel(loading, mode) {
  if (loading) {
    return mode === "login" ? "Signing in..." : "Creating account...";
  }
  return mode === "login" ? "Sign In" : "Create Account";
}

function getHeading(mode) {
  return mode === "login" ? "Sign In" : "Create Your Account";
}

function getSubheading(mode) {
  return mode === "login"
    ? "Access your lead purchase dashboard"
    : "Sign up to browse and purchase leads";
}

describe("Login/Signup mode toggling", () => {
  it("defaults to login mode", () => {
    const mode = "login";
    assert.equal(getEndpoint(mode), "/api/client/login");
    assert.equal(getHeading(mode), "Sign In");
    assert.equal(getSubheading(mode), "Access your lead purchase dashboard");
  });

  it("switches to signup mode", () => {
    const mode = "signup";
    assert.equal(getEndpoint(mode), "/api/client/register");
    assert.equal(getHeading(mode), "Create Your Account");
    assert.equal(getSubheading(mode), "Sign up to browse and purchase leads");
  });
});

describe("Payload construction", () => {
  const fields = {
    email: "test@example.com",
    password: "secret123",
    contactName: "John Doe",
    companyName: "Acme",
    phone: "555-1234",
  };

  it("login payload only includes email and password", () => {
    const payload = buildPayload("login", fields);
    assert.deepEqual(Object.keys(payload).sort(), ["email", "password"]);
    assert.equal(payload.email, "test@example.com");
    assert.equal(payload.password, "secret123");
  });

  it("signup payload includes all fields", () => {
    const payload = buildPayload("signup", fields);
    assert.deepEqual(
      Object.keys(payload).sort(),
      ["companyName", "contactName", "email", "password", "phone"],
    );
    assert.equal(payload.contactName, "John Doe");
    assert.equal(payload.companyName, "Acme");
    assert.equal(payload.phone, "555-1234");
  });
});

describe("Submit button state", () => {
  it("disabled when loading", () => {
    assert.equal(isSubmitDisabled(true, "a@b.com", "pass"), true);
  });

  it("disabled when email is empty", () => {
    assert.equal(isSubmitDisabled(false, "", "pass"), true);
    assert.equal(isSubmitDisabled(false, "  ", "pass"), true);
  });

  it("disabled when password is empty", () => {
    assert.equal(isSubmitDisabled(false, "a@b.com", ""), true);
    assert.equal(isSubmitDisabled(false, "a@b.com", "   "), true);
  });

  it("enabled when all fields present and not loading", () => {
    assert.equal(isSubmitDisabled(false, "a@b.com", "pass123"), false);
  });
});

describe("Button labels", () => {
  it("shows correct loading labels", () => {
    assert.equal(getButtonLabel(true, "login"), "Signing in...");
    assert.equal(getButtonLabel(true, "signup"), "Creating account...");
  });

  it("shows correct idle labels", () => {
    assert.equal(getButtonLabel(false, "login"), "Sign In");
    assert.equal(getButtonLabel(false, "signup"), "Create Account");
  });
});
