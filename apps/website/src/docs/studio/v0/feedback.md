---
id: "v0-studio-feedback"
title: "Collect and inspect feedback"
description: "Connect authenticated response ratings to recorded runs and distinguish user feedback from execution failures and evaluation grades."
keywords: ["kortyx", "studio", "feedback"]
sidebar_label: "Collect and inspect feedback"
section: "performance"
---
# Collect and inspect feedback

Your application can send ratings for an assistant response, such as a thumbs-up or thumbs-down. Studio associates the rating with the response's run.

## Collect response feedback

Kortyx assistant messages expose `runId` through `@kortyx/react`. Use the run
reference to connect a response rating to Studio. Send the rating to your own
authenticated backend first: derive the actor from the signed-in user and
verify that the response/run belongs to that user. Do not accept an arbitrary
browser-supplied run ID without an ownership check or signed feedback token.

After those checks, forward a server-to-server request:

```ts
const response = await fetch(
  `${process.env.KORTYX_TELEMETRY_API_URL}/v1/telemetry/scores`,
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.KORTYX_TELEMETRY_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      runId: verifiedResponse.runId,
      actorId: authenticatedUser.id,
      value: liked ? 1 : 0,
      reasons: selectedReasons,
      comment: optionalComment,
    }),
  },
);
if (!response.ok) throw new Error("Feedback could not be saved.");
```

```js
const response = await fetch(`${process.env.KORTYX_TELEMETRY_API_URL}/v1/telemetry/scores`, {
    method: "POST",
    headers: {
        authorization: `Bearer ${process.env.KORTYX_TELEMETRY_API_KEY}`,
        "content-type": "application/json",
    },
    body: JSON.stringify({
        runId: verifiedResponse.runId,
        actorId: authenticatedUser.id,
        value: liked ? 1 : 0,
        reasons: selectedReasons,
        comment: optionalComment,
    }),
});
if (!response.ok)
    throw new Error("Feedback could not be saved.");
```

`verifiedResponse`, `authenticatedUser`, `liked`, `selectedReasons`, and `optionalComment` represent
your application-owned validated values. Reasons are optional: `incorrect`,
`irrelevant`, `incomplete`, `unsafe`, or `other`. Comments are optional and capped
at 4000 characters. Do not assign a negative reason automatically if the user
has not selected one.

One vote is stored per actor/run. Changing the vote updates its existing score;
send `DELETE` to the same endpoint with `{ runId, actorId }` to clear it. The run
must already exist in Studio, so flush/retry pending telemetry before treating
a 404 as permanent. No credentials are exposed to the chat browser.

Studio surfaces ratings in **Runs → Feedback**, its feedback filter, and session
activity. A negative rating does not mark execution as failed. Human correctness
reviews appear separately and require a Studio key with `studio:write` in addition
to `studio:read`. Shared-key self-hosted reviews use the Studio key as reviewer
identity. These native Studio scores are independent of the optional Langfuse
integration; forwarding to Langfuse remains application-owned.

> **Good to know:** A negative user rating can belong to a successfully executed run. [Run status](/docs/studio/runs#status-and-completion) describes execution; [evaluation grades](/docs/studio/evaluation-results) assess defined test requirements.

## Inspect a rating

Open the run's feedback view to read recorded ratings and their available context. A negative rating describes the user's experience. It does not change a successful execution into a failed run or replace an evaluation grade.

Next: [Inspect runs](/docs/studio/runs#feedback).
