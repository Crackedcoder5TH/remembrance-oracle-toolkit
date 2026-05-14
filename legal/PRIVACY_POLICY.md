# Remembrance Ecosystem — Privacy Policy

**Effective Date:** April 10, 2026
**Last Updated:** April 10, 2026

This Privacy Policy describes how Remembrance ("we", "us", "our") collects, uses, and protects information when you use our products and services.

---

## 1. Information We Collect

### 1.1 Account Information
- Email address (for paid tiers)
- Organization name (for Enterprise tier)
- Payment information (processed by Stripe; we do not store card numbers)

### 1.2 Usage Data
- API call counts and timestamps
- Coherency scores generated (not the source code)
- Pattern search queries (anonymized)
- Feature usage metrics (which tools you use, frequency)

### 1.3 What We Do NOT Collect
- **We do not store your source code** unless you explicitly register it as a pattern
- **We do not read your private repositories**
- **We do not train AI models on your code**
- **We do not share your data with third parties** for advertising

### 1.4 Code Processing
When you submit code for scoring or cascade analysis:
- Code is processed in memory
- Only the computed scores and resonance results are retained
- Raw code is discarded after processing
- Exception: If you call `register` or `submit`, the code is stored in YOUR private pattern store

### 1.5 Community Contributions
If you opt in to Community Pattern sharing:
- Pattern waveform signatures are extracted (not raw code)
- Signatures are anonymized (no attribution to source)
- You may opt out at any time

---

## 2. How We Use Information

- **Provide the Services:** Score code, search patterns, run cascade analysis
- **Improve the Services:** Aggregate anonymous usage statistics to improve scoring accuracy
- **Billing:** Process payments and manage subscriptions
- **Support:** Respond to your requests and troubleshoot issues
- **Security:** Detect and prevent abuse, enforce rate limits

---

## 3. Data Storage and Security

- Data is encrypted at rest (AES-256) and in transit (TLS 1.3)
- API keys are stored using scrypt-derived encryption
- Audit logs are append-only and immutable
- Self-hosted deployments keep all data on your infrastructure
- Cloud-hosted data is stored in US data centers

---

## 4. Data Retention

| Data Type | Retention |
|---|---|
| Account information | Until account deletion |
| API usage logs | 90 days |
| Audit logs (Enterprise) | 1 year |
| Registered patterns | Until you delete them |
| Coherency scores | 90 days |
| Community pattern signatures | Indefinite (anonymized) |

---

## 5. Your Rights

You have the right to:
- **Access** your data (export patterns, view audit logs)
- **Delete** your account and all associated data
- **Opt out** of Community Pattern sharing at any time
- **Export** your private pattern store in JSON format
- **Correct** inaccurate account information

To exercise these rights, contact us via GitHub Issues or email.

---

## 6. Third-Party Services

We use the following third-party services:
- **Stripe** — Payment processing (subject to Stripe's privacy policy)
- **GitHub** — Source code hosting and CI/CD (subject to GitHub's privacy policy)

We do NOT use:
- Analytics trackers (no Google Analytics, no Mixpanel)
- Advertising networks
- Data brokers

---

## 7. Children's Privacy

The Services are not intended for users under 16 years of age. We do not knowingly collect information from children.

---

## 8. Changes

We may update this Privacy Policy from time to time. Material changes will be communicated via email to registered users.

---

## 9. Contact

For privacy-related questions:
- GitHub: https://github.com/Crackedcoder5TH
- Issues: https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/issues

---

*Remembrance — Your code is yours. We just help it remember what works.*
