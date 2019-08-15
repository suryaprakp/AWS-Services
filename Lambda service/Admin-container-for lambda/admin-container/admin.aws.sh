if [ ! -v HOME_ROOT ]; then
    >&2 echo "HOME_ROOT is not defined"
    return 1
fi

function _admin_aws_export_credentials() {
    # Export AWS access key and secret key as env vars if specified by a
    # credentials file.
    
    function _get_kv_value() {
        local file="$1"
        local key="$2"
        set +e
        local value=$(cat "$file" | grep "$key" | head -n1 | cut -d'=' -f2 | tr -d '\n')
        local status=$?
        set -e
        if [ $status -eq 0 ]; then
            echo "$value"
        fi
    }
    
    local credentials="${HOME}/.aws/credentials"
    if [ -e "${credentials}" ]; then
        # IMPORTANT: This will grab the _first_ credentials entry. It does not support multiple entries.
        # http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-environment

        local aki=$(_get_kv_value "$credentials" 'aws_access_key_id')
        if [ -n "$aki" ]; then
            export AWS_ACCESS_KEY_ID="$aki"
        fi
        
        local sak=$(_get_kv_value "$credentials" 'aws_secret_access_key')
        if [ -n "$sak" ]; then
            export AWS_SECRET_ACCESS_KEY="$sak"
        fi
    else
        _log_error "No AWS credentials file available ($credentials)"
    fi
}

