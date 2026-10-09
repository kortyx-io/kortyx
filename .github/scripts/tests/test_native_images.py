"""Validate digest assembly without writing to a registry."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "studio/merge-native-images.sh"


class NativeImageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.log = self.root / "calls"
        self.output = self.root / "output"
        self.digests = {}
        for index, (image, arch) in enumerate((
                ("api", "amd64"), ("api", "arm64"),
                ("studio", "amd64"), ("studio", "arm64"))):
            digest = "sha256:" + str(index + 1) * 64
            self.digests[image, arch] = digest
            path = self.root / image / arch
            path.parent.mkdir(exist_ok=True)
            path.write_text(digest + "\n")
        docker = self.root / "docker"
        docker.write_text("#!" + shutil.which("python3") + '\n' + '''import json, os, sys
with open(os.environ["TEST_LOG"], "a") as f: f.write(json.dumps(sys.argv[1:]) + "\\n")
if "inspect" in sys.argv:
    print(json.dumps({"manifest": {"digest": "sha256:" + "a" * 64}}))
''')
        docker.chmod(0o755)

    def run_merge(self):
        return subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True,
                              env={**os.environ, "PATH": str(self.root) + os.pathsep + os.environ["PATH"],
                                   "TEST_LOG": str(self.log), "DIGEST_DIR": str(self.root),
                                   "GITHUB_OUTPUT": str(self.output), "REGISTRY": "ghcr.io",
                                   "VERSION": "0.18.0"})

    def test_merges_only_this_runs_two_platform_digests_per_image(self):
        result = self.run_merge()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        for index, image in enumerate(("api", "studio")):
            ref = "ghcr.io/kortyx-io/kortyx-" + image
            self.assertEqual(calls[index * 2], ["buildx", "imagetools", "create",
                             "--tag", ref + ":staging-v0.18.0", "--tag", ref + ":staging-latest",
                             ref + "@" + self.digests[image, "amd64"],
                             ref + "@" + self.digests[image, "arm64"]])
        self.assertEqual(self.output.read_text(),
                         "api_digest=sha256:" + "a" * 64 + "\nstudio_digest=sha256:" + "a" * 64 + "\n")

    def test_missing_platform_refuses_all_registry_writes(self):
        (self.root / "studio/arm64").unlink()
        self.assertNotEqual(self.run_merge().returncode, 0)
        self.assertFalse(self.log.exists())

    def test_invalid_digest_refuses_all_registry_writes(self):
        (self.root / "studio/arm64").write_text("latest")
        self.assertNotEqual(self.run_merge().returncode, 0)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
