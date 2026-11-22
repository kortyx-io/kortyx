import { randomUUID } from "node:crypto";
import {
  ASSESSMENT_SCORE_GROUP,
  DEFAULT_JUDGE_CONTENT,
  DEFAULT_SCORE_GROUP_REF,
  type ScoreGroupDefinition,
} from "@kortyx/telemetry-contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTelemetryDbClient, type TelemetryDbClient } from "../src/client";
import {
  getEvaluatorDetail,
  publishEvaluator,
  publishedEvaluator,
  saveEvaluator,
} from "../src/repositories/evaluators";
import {
  archiveJudgeScoreGroup,
  getJudgeScoreGroup,
  getJudgeScoreGroupVersion,
  listJudgeScoreGroups,
  publishJudgeScoreGroup,
  saveJudgeScoreGroup,
} from "../src/repositories/judge-score-groups";
import { organizations, projects } from "../src/schema";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("project-owned versioned score groups", () => {
  let client: TelemetryDbClient;
  let scope: { organizationId: string; projectId: string };
  let other: typeof scope;
  beforeAll(async () => {
    client = createTelemetryDbClient(url ?? "");
    const [org] = await client.db
      .insert(organizations)
      .values({ name: `score-group-test-${randomUUID()}` })
      .returning();
    if (!org) throw new Error("Missing test organization");
    const rows = await client.db
      .insert(projects)
      .values([
        { organizationId: org.id, name: "a" },
        { organizationId: org.id, name: "b" },
      ])
      .returning();
    if (!rows[0] || !rows[1]) throw new Error("Missing test projects");
    scope = { organizationId: org.id, projectId: rows[0].id };
    other = { organizationId: org.id, projectId: rows[1].id };
  });
  afterAll(async () => {
    if (scope)
      await client.db
        .delete(organizations)
        .where(eq(organizations.id, scope.organizationId));
    await client?.close();
  });
  const definition = (): ScoreGroupDefinition => ({
    ...structuredClone(ASSESSMENT_SCORE_GROUP.definition),
    name: "Answer quality",
  });
  it("keeps Assessment available and immutable in every project", async () => {
    expect((await listJudgeScoreGroups(client.db, scope))[0]?.id).toBe(
      DEFAULT_SCORE_GROUP_REF.id,
    );
    expect((await listJudgeScoreGroups(client.db, other))[0]?.id).toBe(
      DEFAULT_SCORE_GROUP_REF.id,
    );
    await expect(
      saveJudgeScoreGroup(
        client.db,
        scope,
        definition(),
        DEFAULT_SCORE_GROUP_REF.id,
        1,
      ),
    ).rejects.toThrow("read-only");
    await expect(
      archiveJudgeScoreGroup(client.db, scope, DEFAULT_SCORE_GROUP_REF.id, 1),
    ).rejects.toThrow("cannot be archived");
  });
  it("pins output definitions and isolates versions, drafts, conflicts and project scope", async () => {
    let group = await saveJudgeScoreGroup(client.db, scope, definition());
    const id = group.group.id;
    group = await publishJudgeScoreGroup(
      client.db,
      scope,
      id,
      group.group.revision,
    );
    const judge = await saveEvaluator(client.db, scope, {
      name: "Judge",
      description: "",
      model: "test/model",
      content: DEFAULT_JUDGE_CONTENT,
      evidence: "trajectory",
      scoreGroup: { id, version: 1 },
    });
    await publishEvaluator(client.db, scope, judge.id, judge.revision);
    const changed = {
      ...definition(),
      fields: [
        ...definition().fields,
        {
          id: "grounded",
          label: "Grounded",
          description: "Claims are supported.",
          type: "boolean" as const,
          allowNotApplicable: true,
          allowInsufficientEvidence: true,
        },
      ],
    };
    const revision = group.group.revision;
    group = await saveJudgeScoreGroup(client.db, scope, changed, id, revision);
    await expect(
      saveJudgeScoreGroup(client.db, scope, definition(), id, revision),
    ).rejects.toThrow("changed");
    group = await publishJudgeScoreGroup(
      client.db,
      scope,
      id,
      group.group.revision,
    );
    expect(group.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(
      (await getJudgeScoreGroupVersion(client.db, scope, { id, version: 1 }))
        .definition.fields,
    ).toHaveLength(1);
    expect(
      (await publishedEvaluator(client.db, scope, { id: judge.id, version: 1 }))
        .scoreGroup?.definition.fields,
    ).toHaveLength(1);
    await expect(getJudgeScoreGroup(client.db, other, id)).rejects.toThrow(
      "not found",
    );
    await expect(
      getJudgeScoreGroupVersion(client.db, other, { id, version: 1 }),
    ).rejects.toThrow("not found");
    expect(
      (await listJudgeScoreGroups(client.db, other)).some(
        (item) => item.id === id,
      ),
    ).toBe(false);
    await archiveJudgeScoreGroup(client.db, scope, id, group.group.revision);
    expect(
      (await publishedEvaluator(client.db, scope, { id: judge.id, version: 1 }))
        .scoreGroup?.definition.fields,
    ).toHaveLength(1);
    await expect(
      saveEvaluator(client.db, scope, {
        ...judge.draft,
        scoreGroup: { id, version: 2 },
      }),
    ).rejects.toThrow("active score group");
    expect(
      (await getEvaluatorDetail(client.db, scope, judge.id)).evaluator.draft
        .scoreGroup,
    ).toEqual({ id, version: 1 });
  });
  it("selects Assessment for a new judge when no group is provided", async () => {
    const judge = await saveEvaluator(client.db, scope, {
      name: "Default judge",
      description: "",
      model: "test/model",
      content: DEFAULT_JUDGE_CONTENT,
      evidence: "response",
    });
    expect(judge.draft.scoreGroup).toEqual(DEFAULT_SCORE_GROUP_REF);
  });
});
