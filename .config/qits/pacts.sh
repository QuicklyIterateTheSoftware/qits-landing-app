#!/bin/sh
# pacts.sh decide | publish
#
# THE CONSUMER PACT SHIPS AS A JAR, AND ONLY WHEN IT CHANGED (epic qits-546). `pacts/` is
# qits-landing's pact with qits-projects, generated and compared by
# src/testing/qits-projects.pact.spec.ts. It is published as the maven jar
# `eu.wohlben.qits:qits-landing-pacts-qits-projects` at $QITS_VERSION, with `pacts/` on the
# classpath. qits-projects pins that jar as a test dependency, and qits-maintenance bumps the pin
# when a new version appears. So a version that changes nothing would be a bump that verifies
# nothing new. Hence the gate.
#
#   decide    one line on stdout, exit 0:
#               publish <reason>   publish the jar at $QITS_VERSION
#               skip <reason>      publish nothing
#             It is `publish` when published-tree-changed.sh answers `first` or `changed`, or when
#             it answers `unchanged $QITS_VERSION` but that version has no pom yet. That last case
#             is a re-run of a release whose publish died between the jar and the pom. The pom is
#             what makes a version published (qits-ci's `announce: if-published` probe reads the
#             pom), so the jar alone is not a published artifact.
#   publish   build the jar and the pom (.config/qits/pacts-jar.mjs), PUT the jar, then the pom,
#             then assert the pom is there. The maven store derives maven-metadata.xml and every
#             checksum from what it holds (qits-registries' MavenRoutes), so neither is PUT. A
#             re-PUT of identical bytes is an idempotent 201, and the jar is deterministic, so a
#             re-run may PUT again.
#
# EVERY REGISTRY ANSWER THAT IS NOT THE EXPECTED ONE FAILS, never decides. That is
# published-tree-changed.sh's rule, and this file keeps it.
#
# WHY NOT `mvn deploy`: the release step runs on node-base (node:24-alpine plus bash, curl, git).
# There is no maven, no JDK and no zip there, and a maven deploy is two PUTs.
#
# ENVIRONMENT
#   QITS_VERSION                the release version
#   QITS_MAVEN_REGISTRY_URL     the maven repository root
#   QITS_TOKEN                  optional bearer for reads, omitted when unset, never an empty bearer
#   QITS_PUBLISH_TOKEN_COMMAND  optional; mints the publish bearer at the call site, the way the
#                               archetypes' publishes do. No mint = anonymous.
set -eu

die() {
  echo "pacts: $*" >&2
  exit 1
}

here=$(cd "$(dirname "$0")" && pwd)
tree=pacts
group=eu.wohlben.qits
artifact=qits-landing-pacts-qits-projects
coordinate="$group:$artifact"

version=${QITS_VERSION:?QITS_VERSION is the version the jar is published at}
case "$version" in
  ''|*[!A-Za-z0-9._+-]*) die "'$version' is not a version" ;;
esac
root=${QITS_MAVEN_REGISTRY_URL:?QITS_MAVEN_REGISTRY_URL is the maven repository}
root=${root%/}
base="$root/$(printf '%s' "$group" | tr . /)/$artifact/$version/$artifact-$version"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

pom_published() {
  set --
  [ -z "${QITS_TOKEN:-}" ] || set -- -H "Authorization: Bearer $QITS_TOKEN"
  status=$(curl -sS -L --retry 2 --retry-delay 1 -o /dev/null -w '%{http_code}' "$@" "$base.pom") \
    || die "cannot reach $base.pom"
  case "$status" in
    200) echo yes ;;
    404) echo no ;;
    *) die "GET $base.pom answered HTTP $status — not deciding on an error" ;;
  esac
}

decide() {
  gate=$(sh "$here/published-tree-changed.sh" "$coordinate" "$tree") \
    || die "the change gate failed"
  case "$gate" in
    first) echo "publish first publish of $coordinate" ;;
    "changed "*) echo "publish the pact changed since ${gate#changed }" ;;
    "unchanged $version")
      # Assigned, never tested inline: `set -e` does not reach a `$(…)` inside an `if`.
      pom=$(pom_published)
      if [ "$pom" = yes ]; then
        echo "skip $coordinate:$version is already published"
      else
        echo "publish re-run: $version has a jar and no pom — completing it"
      fi ;;
    "unchanged "*) echo "skip unchanged since ${gate#unchanged }" ;;
    *) die "the change gate answered '$gate'" ;;
  esac
}

put() {
  file=$1
  type=$2
  url=$3
  token=""
  if [ -n "${QITS_PUBLISH_TOKEN_COMMAND:-}" ] \
    && command -v "$QITS_PUBLISH_TOKEN_COMMAND" > /dev/null 2>&1; then
    token=$("$QITS_PUBLISH_TOKEN_COMMAND" 2>/dev/null) || token=""
  fi
  set -- -X PUT -H "Content-Type: $type" --data-binary "@$file"
  [ -z "$token" ] || set -- "$@" -H "Authorization: Bearer $token"
  status=$(curl -sS -o "$work/put.out" -w '%{http_code}' "$@" "$url") || die "cannot reach $url"
  case "$status" in
    200|201) echo "PUT $url: $status" >&2 ;;
    *) die "PUT $url answered HTTP $status: $(head -c 500 "$work/put.out")" ;;
  esac
}

publish() {
  node "$here/pacts-jar.mjs" jar "$tree" "$work/pacts.jar" || die "cannot build the jar"
  node "$here/pacts-jar.mjs" pom "$group" "$artifact" "$version" > "$work/pacts.pom" \
    || die "cannot write the pom"
  # The jar first and the pom last: the pom is what says "published".
  put "$work/pacts.jar" application/java-archive "$base.jar"
  put "$work/pacts.pom" application/xml "$base.pom"
  # AND THE VERSION PUBLISHED IS THE VERSION THIS RELEASE IS, or `announce: if-published` would
  # skip a release whose jar went somewhere else.
  [ "$(pom_published)" = yes ] || die "the publish did not leave $coordinate at $version"
  echo "published $coordinate:$version"
}

[ "$#" -eq 1 ] || die "usage: $0 decide | publish"
case "$1" in
  decide) decide ;;
  publish) publish ;;
  *) die "usage: $0 decide | publish" ;;
esac
