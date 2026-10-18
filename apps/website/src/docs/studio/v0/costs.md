---
id: "v0-studio-costs"
title: "Understand tokens and cost"
description: "Read recorded token usage and model costs, distinguish partial totals from complete prices, and compare similar workflow runs."
keywords: ["kortyx", "studio", "costs"]
sidebar_label: "Understand tokens and cost"
section: "performance"
---
# Understand tokens and cost

Providers count model input and output in tokens, which are pieces of text or other model content. Studio displays the usage your application reported.

## Read a total

Open a run and inspect its model usage and cost. Expand individual model calls when you need to understand which request contributed to the total. A missing token count is unknown usage, not zero usage.

Cached input and reasoning counts may be reported separately. Providers differ in what they report, so compare calls with the same provider/model when investigating a change.

## Recognize partial prices

A partial total includes calls with known prices. Unpriced calls may increase the actual cost. An unknown amount means Studio cannot calculate the total from the recorded evidence; it does not mean the request was free.

> **Good to know:** Recorded model costs are separate from your Cloud subscription or infrastructure bill. A partial total can still grow; [pricing status](/docs/studio/metrics#cost-and-pricing) explains which calls have a known price.

Next: [Metric definitions](/docs/studio/metrics#cost-and-pricing) or [evaluation costs](/docs/studio/evaluation-results#eval-run-costs).
