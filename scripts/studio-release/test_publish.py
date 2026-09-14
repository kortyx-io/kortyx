import hashlib
import io
import json
import unittest
from unittest.mock import patch
from publish import decode, publish, validate, verify_public


def manifest(version="0.3.0", digest="a"):
    return {"format": 1, "installer": 1, "version": version,
            "api": "ghcr.io/kortyx-io/kortyx-api@sha256:" + digest * 64,
            "studio": "ghcr.io/kortyx-io/kortyx-studio@sha256:" + "b" * 64}


class StorageError(Exception):
    def __init__(self, code, status):
        self.response = {"Error": {"Code": code}, "ResponseMetadata": {"HTTPStatusCode": status}}


class MemoryR2:
    def __init__(self):
        self.objects = {}
        self.writes = []
        self.before_put = None

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise StorageError("NoSuchKey", 404)
        value = self.objects[Key]
        return {"Body": io.BytesIO(value), "ETag": hashlib.sha256(value).hexdigest()}

    def put_object(self, **request):
        key = request["Key"]
        if self.before_put:
            self.before_put(request)
        existing = self.objects.get(key)
        if request.get("IfNoneMatch") == "*" and existing is not None:
            raise StorageError("PreconditionFailed", 412)
        if "IfMatch" in request and (existing is None or hashlib.sha256(existing).hexdigest() != request["IfMatch"]):
            raise StorageError("PreconditionFailed", 412)
        self.objects[key] = request["Body"]
        self.writes.append(request)


class PublishTest(unittest.TestCase):
    def test_uploads_history_before_channel_and_is_idempotent(self):
        client = MemoryR2()
        self.assertEqual(publish(client, "updates", manifest()), manifest())
        self.assertEqual([x["Key"] for x in client.writes], ["studio/releases/0.3.0.json", "studio/stable.json"])
        self.assertIn("max-age=300", client.writes[-1]["CacheControl"])
        publish(client, "updates", manifest())
        self.assertEqual(len(client.writes), 2)

    def test_refuses_changed_digest_for_existing_version(self):
        client = MemoryR2()
        publish(client, "updates", manifest())
        with self.assertRaisesRegex(ValueError, "different published digests"):
            publish(client, "updates", manifest(digest="c"))
        self.assertEqual(decode(client.objects["studio/stable.json"]), manifest())

    def test_older_rerun_does_not_lower_stable_and_versions_are_numeric(self):
        client = MemoryR2()
        publish(client, "updates", manifest("0.10.0"))
        self.assertEqual(publish(client, "updates", manifest("0.9.0")), manifest("0.10.0"))

    def test_newer_concurrent_publisher_wins_without_being_overwritten(self):
        client = MemoryR2()
        publish(client, "updates", manifest("0.2.0"))
        def race(request):
            if request["Key"] == "studio/stable.json":
                client.before_put = None
                publish(client, "updates", manifest("0.4.0"))
        client.before_put = race
        self.assertEqual(publish(client, "updates", manifest()), manifest("0.4.0"))
        self.assertEqual(decode(client.objects["studio/stable.json"]), manifest("0.4.0"))

    def test_failed_upload_does_not_advertise_incomplete_release(self):
        client = MemoryR2()
        def fail(_):
            raise StorageError("AccessDenied", 403)
        client.before_put = fail
        with self.assertRaises(StorageError):
            publish(client, "updates", manifest())
        self.assertNotIn("studio/stable.json", client.objects)

    def test_corrupt_channel_is_not_silently_overwritten(self):
        client = MemoryR2()
        client.objects["studio/stable.json"] = b"invalid"
        with self.assertRaises(ValueError):
            publish(client, "updates", manifest())
        self.assertEqual(client.objects["studio/stable.json"], b"invalid")

    def test_rejects_invalid_manifests(self):
        for invalid in [manifest("0.4.0-rc.1"), {**manifest(), "installer": 2}, {**manifest(), "api": "evil:latest"}, {**manifest(), "format": True}]:
            with self.assertRaises(ValueError):
                validate(invalid)
        with self.assertRaises(ValueError):
            decode(b" " * 16_385)

    def test_public_verification_waits_for_cache_and_requires_valid_manifest(self):
        def response(value):
            result = io.BytesIO(json.dumps(value).encode())
            result.url = "https://updates.kortyx.io/studio/stable.json"
            return result
        with patch("publish.urllib.request.urlopen", side_effect=[response(manifest("0.2.0")), response(manifest())]):
            verify_public(manifest(), attempts=2, delay=0)
        with patch("publish.urllib.request.urlopen", return_value=response(manifest("0.2.0"))):
            with self.assertRaises(RuntimeError):
                verify_public(manifest(), attempts=1)


if __name__ == "__main__":
    unittest.main()
