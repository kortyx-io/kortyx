# Code scanning decisions

This register documents CodeQL findings whose rule does not apply to the
credential or data model in use. Each decision is narrow and must be revisited
when the stated assumptions change.

## Active decisions

### HMAC of generated API-key secrets

- Alert: [CodeQL alert 20](https://github.com/kortyx-io/kortyx/security/code-scanning/20)
- Rule: `js/insufficient-password-hash`
- Scope: `packages/telemetry-db/src/repositories/api-keys.ts`
- Decision: false positive
- Reviewed: 2026-10-04

Telemetry API-key secrets are generated with `randomBytes(32)` and are not
human-selected passwords. The database stores HMAC-SHA-256 output keyed with an
independent, required production pepper. A deliberately slow password hash is
needed for low-entropy passwords, but it does not add meaningful protection for
a uniformly random 256-bit secret. HMAC also prevents an attacker who obtains
only the database from testing candidate keys without the server-held pepper.

Reopen this decision if API-key secrets become user-selected, contain less than
256 bits of cryptographic randomness, or can be verified without the production
pepper.
