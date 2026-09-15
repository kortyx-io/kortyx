import unittest
from pathlib import Path


WORKFLOW = Path(__file__).parents[2] / "workflows" / "studio-oss-ghcr.yml"


class StudioReleaseWorkflowTests(unittest.TestCase):
    def test_update_publication_receives_deployment_strategy(self):
        workflow = WORKFLOW.read_text()
        publish_step = workflow.split(
            "      - name: Publish the completed release to the update CDN\n", 1
        )[1].split("\n      - name:", 1)[0]

        self.assertIn(
            "          DEPLOYMENT_STRATEGY: ${{ inputs.deployment_strategy }}\n",
            publish_step,
        )


if __name__ == "__main__":
    unittest.main()
