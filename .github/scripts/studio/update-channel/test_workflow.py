import unittest
import json
import os
import subprocess
import tempfile
from pathlib import Path


WORKFLOW = Path(__file__).parents[3] / "workflows" / "release-studio-images.yml"
RECOVERY_WORKFLOW = (
    Path(__file__).parents[3] / "workflows" / "release-studio-recover.yml"
)


class StudioReleaseWorkflowTests(unittest.TestCase):
    def test_production_promotion_requires_clean_install_and_real_upgrade_smoke(self):
        workflow = WORKFLOW.read_text()
        smoke = WORKFLOW.parents[1] / "scripts" / "studio" / "smoke-install.sh"
        self.assertIn("      - smoke\n", workflow.split("  promote:\n", 1)[1])
        self.assertIn("platform: linux/amd64", workflow)
        self.assertIn("platform: linux/arm64", workflow)
        self.assertIn('STUDIO_SMOKE_CLI="$cli" bash "$(dirname "$0")/smoke-upgrade.sh"', smoke.read_text())

    def test_storage_preflight_blocks_tags_and_npm_before_studio_publication(self):
        workflow = (WORKFLOW.parent / "npm-publish.yml").read_text()
        preflight = workflow.split("  publication_preflight:\n", 1)[1].split("  tags:\n", 1)[0]
        self.assertIn("environment: studio-production-auto", preflight)
        self.assertIn("operation: prepare", preflight)
        self.assertIn("needs.prepare.outputs.release == 'true'", preflight)
        self.assertIn("contains(fromJSON(needs.prepare.outputs.paths), 'apps/studio')", preflight)
        tags = workflow.split("  tags:\n", 1)[1].split("  publish:\n", 1)[0]
        self.assertIn("needs: [prepare, publication_preflight]", tags)
        publication = workflow.split("  publish:\n", 1)[1].split("  studio:\n", 1)[0]
        self.assertIn("needs: [prepare, tags]", publication)

    def test_standalone_image_release_checks_storage_before_builds(self):
        prepare = WORKFLOW.read_text().split("  prepare:\n", 1)[1].split("  build:\n", 1)[0]
        self.assertIn("environment: studio-production-auto", prepare)
        self.assertIn("operation: prepare", prepare)
        self.assertIn("Verify publication access before building images", prepare)

    def test_images_overlap_npm_but_smoke_and_promotion_wait_for_publication(self):
        workflow = (WORKFLOW.parent / "npm-publish.yml").read_text()
        images = workflow.split("  studio_images:\n", 1)[1].split("  studio:\n", 1)[0]
        self.assertIn("needs: [prepare, tags]", images)
        release = workflow.split("  studio:\n", 1)[1].split("  website:\n", 1)[0]
        self.assertIn("needs: [prepare, publish, studio_images]", release)
        self.assertIn("needs.studio_images.outputs.api_digest", release)
        self.assertIn("needs.studio_images.outputs.studio_digest", release)
        recovery = WORKFLOW.read_text()
        self.assertIn("inputs.api_digest == '' && inputs.studio_digest == ''", recovery)
        self.assertIn("needs.prepare.result == 'success'", recovery)
        self.assertIn("needs.build.result == 'success'", recovery)
        self.assertIn("needs.build.result == 'skipped' && inputs.api_digest != '' && inputs.studio_digest != ''", recovery)

    def test_native_builds_keep_separate_caches_and_verify_merged_indexes(self):
        workflow = (WORKFLOW.parent / "build-studio-images.yml").read_text()
        self.assertIn("runner: ubuntu-24.04-arm", workflow)
        self.assertIn("runner: ubuntu-24.04\n", workflow)
        self.assertIn("platforms: linux/${{ matrix.arch }}", workflow)
        self.assertNotIn('qemu: "true"', workflow)
        self.assertIn("cache-scope: kortyx-${{ matrix.image }}-image-${{ matrix.arch }}", workflow)
        self.assertIn("push-by-digest=true", workflow)
        self.assertIn("overwrite: true", workflow)
        self.assertIn("needs: build", workflow)
        self.assertIn("verify-images.sh", workflow)
        self.assertIn("Attest API index", workflow)
        self.assertIn("Attest Studio index", workflow)

    def test_smoke_validates_external_sdk_manifest_in_release_image(self):
        smoke = (WORKFLOW.parents[1] / "scripts/studio/smoke-install.sh").read_text()
        self.assertIn('"kortyx@${KORTYX_VERSION}"', smoke)
        self.assertIn('generate-eval-manifest.mjs" "$clean_dir"', smoke)
        self.assertIn('"$api_ref" --filter @kortyx/api exec tsx /tmp/validate-eval-manifest.mjs', smoke)

    def test_update_publication_receives_deployment_strategy(self):
        workflow = WORKFLOW.read_text()
        publish_step = workflow.split(
            "      - name: Publish the completed release to the update CDN\n", 1
        )[1].split("\n      - name:", 1)[0]

        self.assertIn(
            "          DEPLOYMENT_STRATEGY: ${{ inputs.deployment_strategy }}",
            publish_step,
        )

    def test_recovery_revalidates_images_and_receives_deployment_strategy(self):
        workflow = RECOVERY_WORKFLOW.read_text()

        self.assertIn("      api_digest:\n", workflow)
        self.assertIn("      studio_digest:\n", workflow)
        self.assertIn("      - name: Verify promoted production indexes\n", workflow)
        self.assertIn(
            "          DEPLOYMENT_STRATEGY: ${{ inputs.deployment_strategy }}\n",
            workflow,
        )


class ReleaseCiGateTests(unittest.TestCase):
    def test_release_requires_latest_successful_default_branch_push_ci(self):
        script = WORKFLOW.parents[1] / "scripts/release/require-ci.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gh = root / "gh"
            gh.write_text('#!/bin/sh\nprintf "%s" "$TEST_RUNS"\n')
            gh.chmod(0o755)
            git = root / "git"
            git.write_text('#!/bin/sh\nprintf "%s" "tested-commit"\n')
            git.chmod(0o755)
            cases = [
                ([], False),
                ([{"status": "completed", "conclusion": "failure", "headBranch": "main"}], False),
                ([{"status": "in_progress", "conclusion": "", "headBranch": "main"}], False),
                ([{"status": "completed", "conclusion": "success", "headBranch": "feature"}], False),
                ([{"status": "completed", "conclusion": "success", "headBranch": "main"}], True),
                ([{"status": "completed", "conclusion": "failure", "headBranch": "main"},
                  {"status": "completed", "conclusion": "success", "headBranch": "main"}], False),
            ]
            for runs, allowed in cases:
                with self.subTest(runs=runs):
                    result = subprocess.run(["bash", str(script)], capture_output=True, text=True,
                        env={**os.environ, "PATH": directory + os.pathsep + os.environ["PATH"],
                             "GITHUB_REPOSITORY": "kortyx-io/kortyx", "TEST_RUNS": json.dumps(runs)})
                    self.assertEqual(result.returncode == 0, allowed, result.stderr)

    def test_studio_stays_draft_until_verified_publication(self):
        config = json.loads((WORKFLOW.parents[1] / "release-please/config.json").read_text())
        self.assertTrue(config["packages"]["apps/studio"]["draft"])
        self.assertTrue(config["packages"]["apps/studio"]["force-tag-creation"])
        for path in [WORKFLOW, RECOVERY_WORKFLOW]:
            workflow = path.read_text()
            self.assertIn("require-ci.sh", workflow)
            self.assertIn("name: studio-production-auto\n", workflow)
            publication = "Publish the recovered release" if path == RECOVERY_WORKFLOW else "Publish the completed release"
            self.assertLess(workflow.index(publication), workflow.index("--draft=false"))


if __name__ == "__main__":
    unittest.main()
