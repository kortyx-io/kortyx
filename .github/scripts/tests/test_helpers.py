"""Exercise consolidated helpers with local fakes; never deploy or publish externally."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

GITHUB = Path(__file__).resolve().parents[2]
COOLIFY = GITHUB / "actions/deployment/coolify/deploy.sh"
PROMOTE = GITHUB / "actions/containers/promote/promote.sh"
NPM = GITHUB / "actions/release/npm-publish/publish.mjs"
DIGEST = "sha256:" + "a" * 64


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "calls.jsonl"
        self.env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
                    "TEST_LOG": str(self.log), "RUNNER_TEMP": str(self.root)}

    def fake(self, name, body):
        file = self.bin / name
        file.write_text("#!" + shutil.which("python3") + "\n" + body)
        file.chmod(0o755)

    def run_shell(self, script, **env):
        return subprocess.run(["bash", str(script)], env={**self.env, **env},
                              text=True, capture_output=True)

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def coolify(self, **overrides):
        self.fake("curl", '''import json, os, sys
args = sys.argv[1:]
with open(os.environ["TEST_LOG"], "a") as f: f.write(json.dumps(args) + "\\n")
if "DELETE" in args: print(os.environ.get("DELETE_STATUS", "200"))
elif "POST" in args: print('{"deployments":[{"deployment_uuid":"deploy-1"}]}')
else: print(json.dumps({"status": os.environ.get("DEPLOY_STATUS", "finished")}))
''')
        self.fake("sleep", "pass\n")
        return self.run_shell(COOLIFY, **{**dict(COOLIFY_TOKEN="test-token", COOLIFY_URL="https://coolify.invalid",
                              COOLIFY_APP_UUID="app-1", PR_NUMBER="", DOCKER_TAG="", OPERATION="deploy"),
                              **overrides})

    def test_standard_deployment_payload_and_polling(self):
        result = self.coolify()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(json.loads(calls[0][calls[0].index("--data") + 1]),
                         {"uuid": "app-1", "force": True})
        self.assertEqual(calls[1][-1], "https://coolify.invalid/api/v1/deployments/deploy-1")

    def test_preview_payload(self):
        result = self.coolify(PR_NUMBER="42", DOCKER_TAG="pr-42")
        self.assertEqual(result.returncode, 0, result.stderr)
        call = self.calls()[0]
        self.assertEqual(json.loads(call[call.index("--data") + 1]),
                         {"uuid": "app-1", "force": True, "pull_request_id": 42, "docker_tag": "pr-42"})

    def test_failed_and_cancelled_deployments_fail(self):
        for status in ["failed", "cancelled"]:
            with self.subTest(status=status):
                result = self.coolify(DEPLOY_STATUS=status)
                self.assertNotEqual(result.returncode, 0)

    def test_deployment_timeout_is_bounded(self):
        result = self.coolify(DEPLOY_STATUS="in_progress")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.calls()), 61)  # One POST, 60 polls.

    def test_preview_cleanup_is_idempotent(self):
        for status in ["200", "404"]:
            with self.subTest(status=status):
                result = self.coolify(OPERATION="remove-preview", PR_NUMBER="42", DELETE_STATUS=status)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.calls()[-1][-1],
                                 "https://coolify.invalid/api/v1/applications/app-1/previews/42")

    def test_cleanup_rejects_other_http_statuses(self):
        self.assertNotEqual(self.coolify(OPERATION="remove-preview", PR_NUMBER="42",
                                       DELETE_STATUS="500").returncode, 0)

    def test_missing_configuration_fails_before_request(self):
        result = self.coolify(COOLIFY_TOKEN="")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def promotion(self, **overrides):
        self.fake("docker", '''import json, os, sys
args = sys.argv[1:]
with open(os.environ["TEST_LOG"], "a") as f: f.write(json.dumps(args) + "\\n")
if "inspect" in args:
    digest = os.environ["SOURCE_DIGEST"] if args[-1] == "registry/image:staging" else os.environ.get("DEST_DIGEST", os.environ["SOURCE_DIGEST"])
    print(json.dumps({"manifest":{"digest":digest}}))
''')
        return self.run_shell(PROMOTE, **{**dict(SOURCE="registry/image:staging",
                              TAGS="registry/image:v1\nregistry/image:latest", EXPECTED_DIGEST=DIGEST,
                              SOURCE_DIGEST=DIGEST), **overrides})

    def test_promotion_verifies_all_destination_digests(self):
        result = self.promotion()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(calls[1], ["buildx", "imagetools", "create", "-t", "registry/image:v1",
                                  "-t", "registry/image:latest", "registry/image:staging"])
        self.assertEqual([call[-1] for call in calls[2:]], ["registry/image:v1", "registry/image:latest"])

    def test_promotion_rejects_untested_source_before_mutation(self):
        result = self.promotion(EXPECTED_DIGEST="sha256:" + "b" * 64)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("create" in call for call in self.calls()))

    def test_promotion_rejects_changed_destination(self):
        self.assertNotEqual(self.promotion(DEST_DIGEST="sha256:" + "b" * 64).returncode, 0)

    def test_promotion_requires_at_least_one_destination(self):
        result = self.promotion(TAGS="")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("create" in call for call in self.calls()))

    def npm_fixture(self, subject="chore: release main", managed=True):
        for directory in ["packages/a", "packages/b", "providers", ".github/release-please"]:
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        config = {"packages": {"packages/a": {}} if managed else {"packages/other": {}}}
        (self.root / ".github/release-please/config.json").write_text(json.dumps(config))
        def package(name, version):
            (self.root / f"packages/{name}/package.json").write_text(json.dumps(
                {"name": f"@test/{name}", "version": version, "dependencies": {}}))
        package("a", "1.0.0")
        package("b", "1.0.0")
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=self.root, text=True,
                                           stderr=subprocess.DEVNULL).strip()
        git("init", "-q")
        git("config", "user.email", "test@example.invalid")
        git("config", "user.name", "Test")
        git("add", ".")
        git("commit", "-qm", "Initial packages")
        package("a", "1.1.0")
        git("add", ".")
        git("commit", "-qm", subject)
        self.env["RELEASE_COMMIT"] = git("rev-parse", "HEAD")
        self.fake("npm", '''import os, sys
sys.exit(0 if os.environ.get("NPM_EXISTS") == "1" else 1)
''')
        self.fake("pnpm", '''import json, os, sys
with open(os.environ["TEST_LOG"], "a") as f: f.write(json.dumps({"args":sys.argv[1:],"cwd":os.getcwd()}) + "\\n")
''')

    def run_npm(self, **env):
        return subprocess.run(["node", str(NPM)], cwd=self.root, env={**self.env, **env},
                              text=True, capture_output=True)

    def test_npm_publishes_only_changed_managed_packages_with_provenance(self):
        self.npm_fixture()
        result = self.run_npm()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls(), [{"cwd": str(self.root / "packages/a"),
                          "args": ["publish", "--provenance", "--access", "public", "--tag", "latest", "--no-git-checks"]}])

    def test_npm_skips_versions_already_published(self):
        self.npm_fixture()
        self.assertEqual(self.run_npm(NPM_EXISTS="1").returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_npm_refuses_nonrelease_commits(self):
        self.npm_fixture(subject="feat: feature commit")
        self.assertNotEqual(self.run_npm().returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_npm_refuses_unmanaged_package_changes(self):
        self.npm_fixture(managed=False)
        self.assertNotEqual(self.run_npm().returncode, 0)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
