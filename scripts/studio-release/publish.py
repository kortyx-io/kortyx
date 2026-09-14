"""Publish promoted Studio digests to R2. Credentials are read from the environment."""

import argparse
import json
import os
from pathlib import Path
import re
import time
import urllib.request

MAX_MANIFEST_BYTES = 16_384
PUBLIC_ORIGIN = "https://updates.kortyx.io"
VERSION = r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"


def validate(value):
    if not isinstance(value, dict) or set(value) != {"format", "installer", "version", "api", "studio"}:
        raise ValueError("Invalid release manifest fields")
    if type(value["format"]) is not int or value["format"] != 1 or type(value["installer"]) is not int or value["installer"] != 1:
        raise ValueError("Unsupported release protocol")
    if not isinstance(value["version"], str) or not re.fullmatch(VERSION, value["version"]):
        raise ValueError("A stable Studio version is required")
    for name in ("api", "studio"):
        if not isinstance(value[name], str) or not re.fullmatch(r"ghcr\.io/kortyx-io/kortyx-" + name + r"@sha256:[a-f0-9]{64}", value[name]):
            raise ValueError("Only promoted official image digests can be published")
    return value


def decode(body):
    if len(body) > MAX_MANIFEST_BYTES:
        raise ValueError("Release manifest is too large")
    return validate(json.loads(body))


def version(value):
    return tuple(int(part) for part in value["version"].split("."))


def status(error):
    return getattr(error, "response", {}).get("ResponseMetadata", {}).get("HTTPStatusCode")


def read_object(client, bucket, key):
    try:
        result = client.get_object(Bucket=bucket, Key=key)
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "NoSuchKey":
            return None
        raise
    with result["Body"] as body:
        manifest = decode(body.read(MAX_MANIFEST_BYTES + 1))
    return manifest, result["ETag"]


def publish(client, bucket, manifest):
    """Immutable history first; compare-and-swap the stable pointer last."""
    validate(manifest)
    body = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    key = f'studio/releases/{manifest["version"]}.json'
    try:
        client.put_object(Bucket=bucket, Key=key, Body=body,
                          ContentType="application/json", CacheControl="public, max-age=31536000, immutable",
                          IfNoneMatch="*")
    except Exception as error:
        if status(error) not in (409, 412):
            raise
        existing = read_object(client, bucket, key)
        if not existing or existing[0] != manifest:
            raise ValueError("This Studio version already has different published digests") from error
    # Do not advertise the version unless its permanent manifest can be read back.
    if read_object(client, bucket, key)[0] != manifest:
        raise ValueError("Permanent manifest verification failed")
    for _ in range(5):
        existing = read_object(client, bucket, "studio/stable.json")
        if existing:
            previous, etag = existing
            if version(previous) > version(manifest):
                return previous  # An older release/rerun must never lower the channel.
            if version(previous) == version(manifest):
                if previous != manifest:
                    raise ValueError("Stable release already uses different image digests")
                return previous
            condition = {"IfMatch": etag}
        else:
            condition = {"IfNoneMatch": "*"}
        try:
            client.put_object(Bucket=bucket, Key="studio/stable.json", Body=body,
                              ContentType="application/json", CacheControl="public, max-age=300, must-revalidate",
                              **condition)
        except Exception as error:
            if status(error) in (409, 412):
                continue  # Another publisher won: re-read and compare versions.
            raise
        current = read_object(client, bucket, "studio/stable.json")[0]
        if version(current) < version(manifest) or (version(current) == version(manifest) and current != manifest):
            raise ValueError("Stable manifest verification failed")
        return current
    raise RuntimeError("Concurrent release publication did not settle; rerun publication")


def verify_public(expected, *, attempts=36, delay=10):
    # Allow the five-minute CDN cache to expire. No GitHub API fallback.
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(PUBLIC_ORIGIN + "/studio/stable.json", headers={"Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.url != request.full_url:
                    raise ValueError("Unexpected manifest redirect")
                current = decode(response.read(MAX_MANIFEST_BYTES + 1))
                if current == expected or version(current) > version(expected):
                    return
        except (OSError, ValueError):
            pass
        if attempt + 1 < attempts:
            time.sleep(delay)
    raise RuntimeError("R2 was published but public CDN verification failed; inspect DNS/cache and rerun")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    manifest = decode(args.manifest.read_bytes())
    import boto3
    from botocore.config import Config

    account = os.environ["STUDIO_UPDATES_R2_ACCOUNT_ID"]
    bucket = os.environ["STUDIO_UPDATES_R2_BUCKET"]
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
        raise ValueError("Invalid R2 account or bucket configuration")
    client = boto3.client(
        "s3", endpoint_url=f"https://{account}.r2.cloudflarestorage.com", region_name="auto",
        aws_access_key_id=os.environ["STUDIO_UPDATES_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["STUDIO_UPDATES_R2_SECRET_ACCESS_KEY"],
        config=Config(connect_timeout=10, read_timeout=15, retries={"mode": "standard", "max_attempts": 3},
                      request_checksum_calculation="when_required", response_checksum_validation="when_required"),
    )
    current = publish(client, bucket, manifest)
    verify_public(current)
    print(f'Verified Studio stable channel: v{current["version"]}')


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # SDK exceptions can include request details; keep credentials out of CI logs.
        print(f"Release publication failed ({type(error).__name__}). Check R2 access, existing manifests, and CDN configuration.")
        raise SystemExit(1) from None
