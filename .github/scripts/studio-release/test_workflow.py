import unittest
from pathlib import Path


WORKFLOW = Path(__file__).parents[2] / "workflows" / "studio-oss-ghcr.yml"
RECOVERY_WORKFLOW = (
    Path(__file__).parents[2] / "workflows" / "studio-oss-cdn-recover.yml"
)


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

    def test_recovery_revalidates_images_and_receives_deployment_strategy(self):
        workflow = RECOVERY_WORKFLOW.read_text()

        self.assertIn("      api_digest:\n", workflow)
        self.assertIn("      studio_digest:\n", workflow)
        self.assertIn("      - name: Verify promoted production indexes\n", workflow)
        self.assertIn(
            "          DEPLOYMENT_STRATEGY: ${{ inputs.deployment_strategy }}\n",
            workflow,
        )


if __name__ == "__main__":
    unittest.main()
