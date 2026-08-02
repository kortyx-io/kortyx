async function main() {
  const canvasUrl =
    process.env.KORTYX_CANVAS_URL ??
    `http://localhost:${process.env.KORTYX_CANVAS_PORT ?? "3002"}`;

  const response = await fetch(
    `${canvasUrl.replace(/\/$/, "")}/api/canvas-agent/telemetry-smoke`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
      },
    },
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Canvas telemetry smoke failed with ${response.status}: ${body}`,
    );
  }

  console.log(body);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
