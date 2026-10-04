# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Instead, use GitHub Security Advisories for this repository.

## Automated security controls

- Every pull request and push to `main` runs a production dependency audit. Any
  advisory, including low severity, fails the existing repository validation
  gate.
- Trivy scans committed secrets, Dockerfiles, and infrastructure configuration
  for actionable high and critical findings; `pnpm audit` owns the production
  dependency graph.
- Every validation run publishes a CycloneDX JSON software bill of materials as
  a workflow artifact.
- CodeQL scans JavaScript and TypeScript changes, and release container images
  are scanned independently before they are eligible for promotion.
- Dependabot version updates run weekly for npm and GitHub Actions. Dependabot
  security updates, secret scanning, and push protection must remain enabled in
  the repository security settings.
