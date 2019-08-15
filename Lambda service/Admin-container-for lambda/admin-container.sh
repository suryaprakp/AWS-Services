#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

function usage() {
    echo "usage: [env_root_dir]"
}


if [ $# -ne 1 ] || [ -z "$1" ]; then
    usage
    exit 1
fi

DEPLOY_ROOT="$1"

if [ ! -d "${DEPLOY_ROOT}" ]; then
    echo "${DEPLOY_ROOT} is not valid deployment root dir"
    exit 1
fi

# Check if the deploy folder contains any terraform files
tf_files=$(ls -1 ${DEPLOY_ROOT}/*.tf|wc -l) || true
if [ $tf_files -eq 0 ] ; then
    echo "${DEPLOY_ROOT} does not contain any terraform files"
    exit 1
fi

# Make DEPLOY_ROOT abs path as it will be used to mount volumes into the container.
DEPLOY_ROOT="$(cd "$DEPLOY_ROOT" && pwd)"

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Build the admin container
export CONTAINER_TAG="datadog-autotagger-lambda"
make
make -C "${ROOT_DIR}/admin-container" docker-image

# TODO use absolute path to get aws credentials

docker run --rm \
       --volume "${DEPLOY_ROOT}:/deploy:rw" \
       --volume "${DEPLOY_ROOT}/credentials/aws:/root/.aws:ro" \
       --volume "${DEPLOY_ROOT}/credentials/datadog:/root/.datadog:ro" \
       --volume "${DEPLOY_ROOT}/../../packages:/packages:ro" \
       --interactive \
       -t "${CONTAINER_TAG}" \
       /bin/bash