# Server-First Data Architecture

A portable playbook for how data flows through a Next.js App Router app that
sits in front of an HTTP API. Fetch on the server in the page, return a
`Result` from the data layer (never throw), keep filter state in the URL
(nuqs), enforce authorization at the API (`forbidden()` for 403), and structure
pages as a single async component + `loading.tsx`.

Distilled from a real migration of the Workfully Customer Success dashboard
from client-side data hooks to server-first rendering. See `SKILL.md` for the
rule index and `rules/` for each rule with examples.

Sibling skill: `feature-driven-architecture` (where code lives). This one
covers how data moves and fails.
