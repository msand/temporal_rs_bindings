#!/usr/bin/env bash
set -euo pipefail

# Bump all version numbers across the project and sync lockfiles.
#
# Usage:
#   ./scripts/bump-version.sh 0.2.0
#   ./scripts/bump-version.sh patch    # 0.1.1 → 0.1.2
#   ./scripts/bump-version.sh minor    # 0.1.1 → 0.2.0
#   ./scripts/bump-version.sh major    # 0.1.1 → 1.0.0

cd "$(dirname "$0")/.."

# Read current version from package.json
CURRENT=$(node -e "console.log(require('./package.json').version)")

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version|patch|minor|major>"
  echo "Current version: $CURRENT"
  exit 1
fi

ARG="$1"

# Resolve semver bump keywords
if [ "$ARG" = "patch" ] || [ "$ARG" = "minor" ] || [ "$ARG" = "major" ]; then
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$ARG" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  esac
  NEW="${MAJOR}.${MINOR}.${PATCH}"
else
  NEW="$ARG"
fi

if [ "$CURRENT" = "$NEW" ]; then
  echo "Already at version $CURRENT"
  exit 0
fi

echo "Bumping version: $CURRENT → $NEW"
echo ""

# Portable sed -i (macOS requires '' argument, GNU sed does not)
if [[ "$(uname)" == "Darwin" ]]; then
  sed_i() { sed -i '' "$@"; }
else
  sed_i() { sed -i "$@"; }
fi

# 1. Root package.json — version field
echo "  package.json (version)"
sed_i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" package.json

# 2. Root package.json — optionalDependencies versions
echo "  package.json (optionalDependencies)"
sed_i "s/\"temporal_rs-\([^\"]*\)\": \"$CURRENT\"/\"temporal_rs-\1\": \"$NEW\"/g" package.json

# 3. Platform npm packages
for dir in npm/*/; do
  name=$(basename "$dir")
  echo "  npm/$name/package.json"
  sed_i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" "$dir/package.json"
done

# 4. Cargo workspace version
echo "  Cargo.toml"
sed_i "s/^version = \"$CURRENT\"/version = \"$NEW\"/" Cargo.toml

# 5. Sync Cargo.lock
echo "  Cargo.lock (cargo check)"
cargo check --workspace 2>/dev/null || true

# 6. Sync package-lock.json
echo "  package-lock.json (npm install)"
npm install --package-lock-only --ignore-scripts 2>/dev/null || true

echo ""
echo "Done. Version bumped to $NEW in:"
echo "  - package.json (version + optionalDependencies)"
echo "  - npm/*/package.json (7 platform packages)"
echo "  - Cargo.toml (workspace)"
echo "  - Cargo.lock"
echo "  - package-lock.json"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'chore: bump version to $NEW'"
echo "  git tag v$NEW"
echo "  git push && git push --tags"
