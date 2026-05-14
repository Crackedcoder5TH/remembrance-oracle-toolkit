# Remembrance Ecosystem — Terms of Service

**Effective Date:** April 10, 2026
**Last Updated:** April 10, 2026

These Terms of Service ("Terms") govern your access to and use of the Remembrance ecosystem of products and services ("Services"), including the Oracle Toolkit, Void Data Compressor, Reflector, Agent Swarm, Dashboard, Dialer, and related APIs, libraries, and tools, operated by Remembrance ("we", "us", "our").

By accessing or using our Services, you agree to be bound by these Terms. If you do not agree, do not use the Services.

---

## 1. Definitions

- **"Open Source Components"** — The publicly available source code of the Remembrance ecosystem, licensed under the MIT License. This includes the Oracle Toolkit library, CLI tools, VS Code extension source, Reflector, Swarm, and Dialer source code.
- **"Substrate Data"** — Proprietary pattern libraries, waveform databases, domain substrate files, learned pattern collections, and any derived datasets used by the Void Data Compressor and Oracle pattern matching systems.
- **"Community Patterns"** — Patterns contributed by users to the shared community substrate through opt-in participation.
- **"User Patterns"** — Patterns generated from or derived from your code, stored in your private pattern store.
- **"API"** — Any programmatic interface provided by the Services, including REST endpoints, MCP tools, and WebSocket connections.
- **"Coherency Score"** — The quality metric computed by the Oracle's 7-dimension scoring system.

---

## 2. Account and Access

### 2.1 API Keys
Access to paid features requires an API key. You are responsible for keeping your API key confidential. You must not share, publish, or embed your API key in client-side code.

### 2.2 Authentication
Enterprise features require authentication via SSO/OIDC or API key. You are responsible for all activity under your account.

### 2.3 Free Tier
The open source components may be used without an account under the MIT License. The free tier includes 302 seed patterns and local-only scoring.

---

## 3. Permitted Use

You may use the Services to:
- Score code quality using the Oracle coherency engine
- Search for and retrieve patterns from your authorized tier
- Run cascade resonance analysis against the Void substrate
- Integrate the self-healing CI pipeline into your repositories
- Use the multi-agent swarm for code review and generation
- Build applications that interact with our API

---

## 4. Prohibited Use

You may NOT:
- Attempt to extract, scrape, bulk-download, or reverse-engineer the Substrate Data
- Redistribute, resell, or sublicense the Substrate Data or any portion thereof
- Use the API to build a competing pattern library or substrate database
- Circumvent rate limits, authentication, or access controls
- Use the Services for any purpose that violates the Covenant principles (harmful code generation, injection attacks, denial of service, etc.)
- Share API keys or enable unauthorized third-party access
- Misrepresent the source of patterns retrieved from the Services

---

## 5. Intellectual Property

### 5.1 Open Source Code
The source code of the Remembrance ecosystem is licensed under the MIT License. You may use, modify, and distribute it in accordance with that license.

### 5.2 Substrate Data — Proprietary
The Substrate Data (38,000+ waveform patterns, domain substrate files, learned pattern collections) is the proprietary intellectual property of Remembrance. It is NOT covered by the MIT License. Access is granted only through paid subscription tiers and is subject to these Terms.

### 5.3 Your Code
We do not claim ownership of any code you submit, score, or analyze through the Services. Your code remains yours.

### 5.4 User Patterns
Patterns derived from your code and stored in your private pattern store belong to you. You may export them at any time.

### 5.5 Community Patterns
If you opt in to contributing patterns to the Community Substrate:
- You grant Remembrance a non-exclusive, worldwide, royalty-free license to include your contributed patterns in the Community Substrate
- Community Patterns are anonymized (no attribution to source code or repository)
- You may opt out at any time; previously contributed patterns remain in the substrate
- Community Substrate access is available to all paid tier users

---

## 6. Data Handling

### 6.1 Code Analysis
When you submit code for scoring, cascade analysis, or healing:
- Code is processed in memory and not permanently stored unless you explicitly register it as a pattern
- Coherency scores and cascade results are returned to you and logged in your audit trail
- We do not train AI models on your code
- We do not share your code with other users

### 6.2 Pattern Registration
When you register a pattern:
- It is stored in your private pattern store (local or cloud, depending on tier)
- It is not visible to other users unless you opt in to Community sharing
- You may delete registered patterns at any time

### 6.3 Audit Logs
Enterprise tier includes immutable audit logs of all API operations. Audit logs are retained for 1 year and are accessible only to your organization's administrators.

---

## 7. Service Tiers and Payment

### 7.1 Free (1-Week Delay)
- Complete access to all patterns, tools, and features
- All new patterns delayed by 7 days from real-time availability
- No payment or contribution required
- Abundance for all — nobody is excluded
- No SLA

### 7.2 Merit (Earned Real-Time Access)
- Submit a pattern with coherency >= 0.80 AND cascade resonance >= 0.50
- Earn 30 days of real-time access per qualifying submission
- Same features as Premium while active
- Pattern attributed to contributor (reputation building)
- Community leaderboard position
- Free through contribution

### 7.3 Premium ($50/month)
- Real-time access to all patterns (zero delay)
- Exponentially compounding advantage
- Premium badge and community recognition
- Priority support
- Full API access
- Enterprise SSO/SAML and audit logging available as add-on

### 7.4 Payment Terms
- Premium subscriptions billed monthly or annually (annual = 2 months free)
- Merit access renews with each qualifying contribution
- You may cancel at any time; access continues through the end of the billing period
- Refunds are not provided for partial months

---

## 8. Rate Limits

| Tier | API Calls/Minute | Cascade Calls/Minute | Swarm Calls/Minute |
|---|---|---|---|
| Free | 30 | 0 | 0 |
| Pro | 200 | 60 | 10 |
| Team | 500 | 120 | 30 |
| Enterprise | Custom | Custom | Custom |

Exceeding rate limits results in HTTP 429 responses. Persistent abuse may result in account suspension.

---

## 9. Availability and SLA

- **Free/Pro/Team:** Best-effort availability. No SLA.
- **Enterprise:** 99.9% monthly uptime SLA. Downtime credits applied automatically.
- Scheduled maintenance will be announced 48 hours in advance.

---

## 10. Termination

We may suspend or terminate your access if you:
- Violate these Terms
- Attempt to extract or redistribute Substrate Data
- Engage in abusive API usage
- Fail to pay for your subscription tier

Upon termination:
- Your User Patterns remain accessible for 30 days for export
- API access is revoked immediately
- Audit logs are retained per our retention policy

---

## 11. Disclaimer of Warranties

THE SERVICES ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. WE DO NOT WARRANT THAT:
- Coherency scores are a guarantee of code quality
- Pattern suggestions are free of bugs or vulnerabilities
- SERF healing will always improve code
- The Services will be uninterrupted or error-free

THE COVENANT SAFETY CHECK IS A BEST-EFFORT HARM FILTER, NOT A SECURITY GUARANTEE. YOU ARE RESPONSIBLE FOR REVIEWING ALL CODE BEFORE DEPLOYING TO PRODUCTION.

---

## 12. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, REMEMBRANCE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING FROM YOUR USE OF THE SERVICES.

OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID FOR THE SERVICES IN THE 12 MONTHS PRECEDING THE CLAIM.

---

## 13. Changes to Terms

We may update these Terms from time to time. Material changes will be communicated via:
- Email to registered users
- Notice on the dashboard
- Updated "Last Updated" date above

Continued use after changes constitutes acceptance.

---

## 14. Governing Law

These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles.

---

## 15. Contact

For questions about these Terms:
- GitHub: https://github.com/Crackedcoder5TH
- Issues: https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/issues

---

*Remembrance — Your codebase remembers what works.*
