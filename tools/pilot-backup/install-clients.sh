#!/usr/bin/env bash
set -euo pipefail
# GitHub Ubuntu 24.04 runner only; client tools, no database service creation.
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl --fail --silent --show-error --location \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
printf '%s\n' \
  'Types: deb' \
  'URIs: https://apt.postgresql.org/pub/repos/apt' \
  'Suites: noble-pgdg' \
  'Architectures: amd64' \
  'Components: main' \
  'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' \
  | sudo tee /etc/apt/sources.list.d/som40-pgdg.sources >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-client-17 age
printf '%s\n' '/usr/lib/postgresql/17/bin' >> "${GITHUB_PATH:?GitHub runner required}"
