#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

TERRAFORM_VERSION=0.11.10
TERRAFORM_URL="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
TERRAFORM_SHA256="43543a0e56e31b0952ea3623521917e060f2718ab06fe2b2d506cfaa14d54527"

TERRAFORM_ARCHIVE=$(mktemp)
curl -sSL -o $TERRAFORM_ARCHIVE "${TERRAFORM_URL}"
set -e
echo "${TERRAFORM_SHA256}  ${TERRAFORM_ARCHIVE}" | sha256sum -c -

mkdir -p /opt/terraform/bin
unzip "${TERRAFORM_ARCHIVE}" -d /usr/bin/
chmod +x /usr/bin/terraform

rm -f "${TERRAFORM_ARCHIVE}"
