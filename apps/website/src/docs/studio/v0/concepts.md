---
id: "v0-studio-concepts"
title: "Understand the basics"
description: "Learn how workflows, runs, sessions, model calls, and pauses fit together before reading an execution in Kortyx Studio."
keywords: ["kortyx", "studio", "concepts"]
sidebar_label: "Understand the basics"
section: "get-started"
---
# Understand the basics

A workflow describes the steps an agent can take. A run records one execution of that workflow. Running the same workflow twice creates two runs.

## Runs and sessions

A session groups related runs, such as the messages in a conversation. Your application supplies the session ID and chooses which requests belong together. Application user and tenant IDs describe the people using your app; they are separate from accounts signed in to Studio.

## Models, tools, and child workflows

A model call asks an AI provider for an answer. A tool performs an operation offered by your app, such as looking up a product. A child workflow is another workflow called by the current one. These operations can overlap, so their individual durations may add up to more than the run's total time.

## Pauses and completion

An interrupt pauses work to ask a person for input. Waiting for input is expected behavior. It does not mean the workflow failed. Your app handles the answer and resumes execution.

A response can reach the user while background work continues. Check the run's final status separately from the time its answer finished streaming.

> **Good to know:** When several calls overlap, their durations can add up to more than the run took. Use the [trace](/docs/studio/trace#read-timing) and [timing definitions](/docs/studio/metrics#execution-timing) to separate work from waiting.

## The workflow map

The map combines paths discovered in application source with activity recorded from real runs. A declared path can exist before anyone has used it. Recorded traffic adds counts, timing, and examples of what actually happened.

Next: [Explore your first run](/docs/studio/first-run).
