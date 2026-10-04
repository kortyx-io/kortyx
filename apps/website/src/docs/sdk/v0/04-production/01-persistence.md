---
id: v0-runtime-persistence-boundary
title: "Runtime Persistence"
description: "Understand when you need Kortyx runtime persistence and when your app should use its own database."
keywords: [kortyx, runtime-persistence, framework-adapter, resume]
sidebar_label: "Runtime Persistence"
---
# Runtime Persistence

If you are new to Kortyx, the main idea is simple:

- Kortyx stores its own temporary workflow state so paused runs can continue later.
- Your app stores its own business data in your database or service layer.

Most confusion comes from mixing those two jobs together.

## Read this page if

- you use `useInterrupt(...)`
- you want a paused run to resume later
- you want resume to survive a server restart or redeploy

If you are building a simple request -> response flow with no pause/resume, you can usually skip this page for now.

## The simple rule

| You want to store... | Where it belongs |
| --- | --- |
| a paused run waiting for user input | Kortyx runtime persistence |
| a checkpoint needed to continue after restart | Kortyx runtime persistence |
| rollback/fork checkpoints for active workflow sessions | Kortyx runtime persistence |
| conversation history you want to show in your product | your app DB or service layer |
| users, orgs, tickets, profiles, orders | your app DB or service layer |
| documents, embeddings, search indexes | your app DB or service layer |

## Why Kortyx needs its own persistence

When a workflow pauses, Kortyx needs to remember enough state to continue safely later.

That includes:

- the pending interrupt request
- the checkpoint for the paused run
- user-facing session checkpoints for rollback, fork, regenerate, and undo
- short-lived runtime state tied to that run

Without that stored state, a restart would lose the paused workflow.

## What Kortyx does not own

Kortyx does not manage your product database, schema, or business records.

If you want to save something because it matters to your product later, save it through your own DB or service layer inside node code.

> **Good to know:** Treat Kortyx runtime persistence as execution state, not as an application data store.

## When the default is enough

- local dev or demos: in-memory is usually fine
- production with interrupt/resume across restarts: use Redis
- production with rollback/fork/regenerate for many users: use Redis

In-memory runtime persistence is intentionally lightweight. It stores state in the current Node process, so it is not shared across workers and it disappears on restart. Session checkpoints are capped by count per session, but in-memory session checkpoint records do not have a global memory cap or TTL.

> **Good to know:** The config property is still called `frameworkAdapter`, but what it controls is the runtime persistence backend used by Kortyx.

## What to read next

Read [Runtime Persistence Adapters](./02-framework-adapters.md) when you need to choose or configure the backend used for that runtime state.
