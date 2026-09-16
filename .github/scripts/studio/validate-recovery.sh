#!/usr/bin/env bash
set -euo pipefail

if [[ ! "$RELEASE_TAG" =~ ^studio-v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Enter a release-please Studio tag (studio-v<version>), got: $RELEASE_TAG"
  exit 1
fi
if [[ ! "$API_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] || [[ ! "$STUDIO_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Both recorded image digests must use the sha256:<64 lowercase hex characters> format."
  exit 1
fi

version="${RELEASE_TAG#studio-v}"
package_version="$(node -p 'require("./.release-candidate/apps/studio/package.json").version')"
manifest_version="$(node -p 'require("./.release-candidate/.github/release-please/manifest.json")["apps/studio"]')"
if [ "$version" != "$package_version" ] || [ "$version" != "$manifest_version" ]; then
  echo "Studio tag ($version), package ($package_version), and release-please manifest ($manifest_version) must match."
  exit 1
fi

git -C .release-candidate fetch --no-tags origin \
  "+refs/heads/${DEFAULT_BRANCH}:refs/remotes/origin/${DEFAULT_BRANCH}"
if ! git -C .release-candidate merge-base --is-ancestor HEAD "origin/${DEFAULT_BRANCH}"; then
  echo "Studio release tags must point to a commit merged into the default branch."
  exit 1
fi

echo "version=$version" >> "$GITHUB_OUTPUT"
