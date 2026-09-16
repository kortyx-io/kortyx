#!/usr/bin/env bash
set -euo pipefail

if [[ ! "$RELEASE_TAG" =~ ^studio-v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Enter a release-please Studio tag (studio-v<version>), got: $RELEASE_TAG"
  exit 1
fi

version="${RELEASE_TAG#studio-v}"
package_version="$(node -p 'require("./apps/studio/package.json").version')"
manifest_version="$(node -p 'require("./.github/release-please/manifest.json")["apps/studio"]')"
if [ "$version" != "$package_version" ] || [ "$version" != "$manifest_version" ]; then
  echo "Studio tag ($version), package ($package_version), and release-please manifest ($manifest_version) must match."
  exit 1
fi

if ! git merge-base --is-ancestor HEAD origin/main; then
  echo "Studio release tags must point to a commit merged into main."
  exit 1
fi

echo "version=$version" >> "$GITHUB_OUTPUT"
echo "commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
