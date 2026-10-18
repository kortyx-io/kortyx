"""Public SDK packages must participate in versioning and publication."""
import json
from pathlib import Path
import unittest

# CI loads helpers from a sparse workflow checkout; validate the calling repository.
ROOT = Path.cwd()


class ReleasePackageTests(unittest.TestCase):
    def test_managed_packages_have_publishable_release_metadata(self):
        config = json.loads((ROOT / ".github/release-please/config.json").read_text())
        versions = json.loads((ROOT / ".github/release-please/manifest.json").read_text())
        self.assertIn("packages/prompts", config["packages"])
        for key, settings in config["packages"].items():
            path = ROOT / key / "package.json"
            package = json.loads(path.read_text())
            if package.get("private"):
                continue
            with self.subTest(package=package["name"]):
                self.assertIn(key, config["packages"])
                self.assertIn(key, versions)
                self.assertEqual(settings["package-name"], package["name"])
                if versions[key] == "0.0.0":
                    # Publication selects manifests changed by the release commit.
                    self.assertEqual(package["version"], "0.0.0")
                    self.assertNotEqual(settings["initial-version"], "0.0.0")


if __name__ == "__main__":
    unittest.main()
