---
id: "v0-cloud-evaluations"
title: "Connect evaluations and providers"
description: "Register your application evaluation endpoint and connect a provider for Studio judging in Cloud project Settings, then verify a real case."
keywords: ["kortyx", "cloud", "evaluations"]
sidebar_label: "Connect evaluations and providers"
section: "connections"
---
# Connect evaluations and providers

Cloud calls your application to execute eval suites. The application owns its agent, suites, runtime provider configuration, authentication checks, and workflow behavior. Cloud configuration registers how Studio reaches it and which supported providers Studio can use.

## Application endpoints

First implement and deploy the authenticated endpoint using [Run your first evaluation](/docs/studio/first-eval). In Cloud, register it through **Settings → Evaluations** for the selected project instead of setting operator environment variables on the managed API server.

Provide a name, a reachable HTTPS endpoint, and its authentication credential. This is the credential your application's eval endpoint expects, not the Cloud SDK telemetry key. The endpoint must expose the supported Kortyx eval contract and discover your real suites. Save credentials through the password field; do not paste them into names, URLs, or documentation.

If registration/discovery fails, check reachability, HTTPS, endpoint authentication, the deployed route, and the selected project. Saving a registration does not prove a suite can execute successfully.

## Provider credentials

Use **Settings → Providers** to connect a supported provider for the selected project. This configures Studio model operations, including available judge models; it does not set providers inside your SDK application. Application execution and Studio judging may therefore use different provider credentials.

The application endpoint credential and provider credential have different jobs. Neither should be replaced with the telemetry write key.

## Verify execution and grading

Open **Evals**, select the registered application and environment, discover a suite, and run a representative case. Verify the saved workflow result, expected interrupts/tool evidence, and the selected judge's result. A queued evaluation or successful discovery alone is insufficient.

Keep the shared [results and comparison guide](/docs/studio/evals#read-results-and-compare) nearby. Execution errors, quality failures, cancellation, and interrupted work are different outcomes. Missing judging evidence should not be treated as a passing grade.

> **Good to know:** Your workflow model is configured in your application; a Studio judge uses the project provider connection. [Choosing a judge](/docs/studio/judging#choose-a-judge) and [reading evaluation costs](/docs/studio/evaluation-results#eval-run-costs) help keep those calls distinct.

## Self-hosted configuration

Self-hosted operators register endpoints and judge credentials on their API server. Use [self-hosted evaluation configuration](/docs/self-hosting/configure-evaluations); Cloud users use the Settings controls described above.

Next: [Evaluation timing and cost](/docs/studio/evals#timing-and-cost) or [Write conversation evals](/docs/sdk/guides/conversation-evals).
