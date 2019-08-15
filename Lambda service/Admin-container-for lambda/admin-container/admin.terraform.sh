# This file should be sourced

function _admin_terraform_map_tf_env_vars_aws() {
    # If a AWS credentials file is available, export access key and
    # secret as terraform env variables.
    if [ -v AWS_ACCESS_KEY_ID ]; then
        echo "Exporting TF_VAR_aws_access_key"
        export TF_VAR_aws_access_key="$AWS_ACCESS_KEY_ID"
    fi
    if [ -v AWS_SECRET_ACCESS_KEY ]; then
        echo "Exporting TF_VAR_aws_secret_key"
        export TF_VAR_aws_secret_key="$AWS_SECRET_ACCESS_KEY"
    fi
}

function _admin_terraform_map_tf_env_vars_dd() {
    # If a Datadog credentials file is available, export app key and
    # api key as terraform env variables.
    if [ -v DATADOG_API_KEY ]; then
        echo "Exporting TF_VAR_datadog_api_key"
        export TF_VAR_datadog_api_key="$DATADOG_API_KEY"
    fi
    if [ -v DATADOG_APP_KEY ]; then
        echo "Exporting TF_VAR_datadog_app_key"
        export TF_VAR_datadog_app_key="$DATADOG_APP_KEY"
    fi
}

function _admin_terraform_init() {
    _ensure_dir "${DEPLOY_ROOT}"
    cd "${DEPLOY_ROOT}"
    export TF_INPUT=0
    _admin_terraform_map_tf_env_vars_aws
    _admin_terraform_map_tf_env_vars_dd
    terraform init
}

function admin_terraform_plan() {
    _ensure_dir "${DEPLOY_ROOT}"
    _check_aws_credentials
    cd "${DEPLOY_ROOT}"
    terraform plan -out=tfplan.tmp -input=false
}

function admin_terraform_apply() {
    _ensure_dir "${DEPLOY_ROOT}"
    _check_aws_credentials
    cd "${DEPLOY_ROOT}"
    terraform apply -input=false tfplan.tmp
}

# Helper functions
function _ensure_dir(){
    if [ ! -d "$1" ]; then
        echo "Could not locate required directory $1" >&2
        exit 1
    fi
}

# Check if aws keys are provided as environment variables
# before running any terraform command
function _check_aws_credentials(){
        if [ -z "${AWS_ACCESS_KEY_ID}" ] || [ -z "${AWS_SECRET_ACCESS_KEY}" ]; then
            echo "Error: AWS keys are not set !" >&2
            echo "Error: Make sure exporting AWS keys before running terraform commands" >&2
            return 1
        fi
}