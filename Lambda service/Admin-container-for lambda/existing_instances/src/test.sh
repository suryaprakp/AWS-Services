#!/bin/bash
#
# This script is a utility to test the python script / function that
# is primarily meant to be run as an AWS Lambda, but this script is
# for running it locally for testing purposes.
#
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

python "${DIR}/datadog_autotagger_lambdafunction.py" "$@"
