# Model pricing maintenance

Default rates live in `packages/telemetry-db/src/pricing/default-rates.ts`. Provider `MODELS` lists contain advertised public API model IDs; callers can still use arbitrary model IDs, including enterprise-only models, with custom prices. Historical rate versions remain available after a model leaves the advertised list.

## Verified catalog (2026-09-17)

All 54 advertised IDs across OpenAI (14), Anthropic (13), Google (11), DeepSeek (3), Mistral (9), and Groq (4) have standard text inference rates. Each new card records its official source, verification date, context/tier constraints, and effective window. Newly observed prices begin on the verification date, avoiding invented historical prices. The four previous versions retain their original dates; the Haiku version gains its previously omitted cache rates.

Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing) and per-model pages linked from each card, [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/), [Mistral pricing](https://docs.mistral.ai/inference/pricing), [Groq models](https://console.groq.com/docs/models) and [Groq prompt caching](https://console.groq.com/docs/prompt-caching).

Important rules:

- OpenAI GPT-6 Astra, GPT-5.6 family, GPT-5.4 and GPT-5.4 Pro: above 272,000 input tokens, input/cache rates double and output rates multiply by 1.5. Gemini Pro's threshold is 200,000. Full input, including cached tokens, determines the threshold.
- Anthropic cache creation is separate from ordinary input: five-minute writes cost 1.25× input; one-hour writes cost 2×. Reads cost 0.1× input, except Fable 5.1 at 0.025×. The adapter preserves one-hour writes, and historical events can recover the split from raw usage.
- Gemini 3.6/3.7/3.8 Flash's published promotion ends after December 31, 2026. The catalog includes the announced January 1 replacement version. Recheck provider announcements before that transition.
- DeepSeek peak windows are Monday–Friday 01:00–04:00 and 06:00–10:00 UTC. Other times use half rates, selected using the generation completion timestamp. Calls crossing a boundary may differ from the provider's billing timestamp; provider-reported actual cost takes precedence.
- Groq GPT-OSS cache reads use its documented 50% discount. The 20B model page displays a rounded $0.037; the card uses $0.0375 from $0.075 × 50%.

Default rates cover global, standard, public text inference. Explicit alternative service tiers, regional inference, audio usage, and Anthropic server tools require provider actual costs, complete custom pricing hints, or project rate cards. Old Sonnet 4.5 long-context requests above 200,000 tokens also require custom pricing. Cache storage charges, taxes, discounts, and separately billed server tools are outside token inference estimates. Models absent from the catalog remain unpriced.

Pricing precedence is provider/custom actual cost, supplied line items, complete supplied unit prices, then an applicable project/default card. Every positive usage item must have a matching unit price, including its label; missing prices make the generation unpriced. Runs/sessions with any missing generation costs, or mixed currencies, have null totals and an `unpriced` status instead of presenting a partial total as complete. Generation details retain available costs.

## Update workflow

1. Verify public model availability, aliases/snapshots, prices, caching, context thresholds, and billing modifiers against official provider documentation. Update the relevant `providers/<provider>/src/models.ts` list. Removed suggestions do not block explicit string IDs.
2. Add a dated rate version with `sourceUrl`, `verifiedAt`, and any constraints. For an actual price change, use a new `effectiveFrom` and `pricingRef`; retain old versions. Correct an existing identity only to fix an incorrectly recorded rate or omitted category. Latest applicable versions win, and project cards take precedence.
3. Run `pnpm --filter @kortyx/telemetry-db test`. The model coverage test imports all six provider lists and fails if an advertised ID lacks verified applicable pricing. CI runs it alongside pricing, native provider, aggregation, and PostgreSQL projection regressions.
4. Deploy the code, then reconcile the target database's defaults. Set `DATABASE_URL` to the intended database; root commands load `.env`. Review a dry run first:

   ```sh
   pnpm db:seed-rates --dry-run
   pnpm db:seed-rates
   ```

   The transactional reconciler reports inserted/updated/skipped identities, serializes concurrent seeders, and uses the database unique index for conflict-safe writes. It preserves custom project rates and unmatched historical identities. It does not delete cards or change effective dates.
5. Existing run/session/workflow costs are materialized. Rebuild the affected project explicitly after seeding:

   ```sh
   pnpm db:backfill-studio --organization-id <organization-uuid> --project-id <project-uuid>
   ```

   Both IDs are required for a scoped backfill. Omitting both rebuilds all projects; use that only when an installation-wide refresh is intended. Events before a newly observed rate's effective date remain unpriced unless an independently verified historical version is added.

For database-backed tests, migrate an isolated database and run:

```sh
DATABASE_URL=<test-database-url> pnpm --filter @kortyx/telemetry-db db:migrate
DATABASE_URL=<test-database-url> pnpm --filter @kortyx/telemetry-db test
```
