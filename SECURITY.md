# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| < 3.0   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in Remembrance Oracle Toolkit, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:
https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/security/advisories/new

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- Acknowledgment within 48 hours
- Assessment and fix timeline within 1 week
- Security patch released as soon as possible

## Built-in Security Features

### The Covenant (15 Principles)

All code passes through the Covenant filter before storage. It rejects:
- SQL injection patterns
- Command injection
- Cross-site scripting (XSS)
- Credential exposure (hardcoded passwords, API keys)
- Infinite loops and resource exhaustion
- Unsafe eval/exec usage
- Path traversal

### Code Validation

- All proven patterns require passing tests
- Coherency scoring rejects low-quality code (threshold: 0.6)
- Community sharing requires coherency >= 0.7

### Sandbox Execution

Test code runs in sandboxed environments with:
- Blocked `require()` for dangerous modules (fs, child_process, net, etc.)
- Timeout enforcement
- Separate process isolation for Go and Rust

## Dependencies

This project has **zero external runtime dependencies**. It uses only Node.js 22+ built-in modules, reducing supply chain risk.
