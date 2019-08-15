if [ ! -v HOME_ROOT ]; then
    >&2 echo "HOME_ROOT is not defined"
    return 1
fi

function _admin_datadog_export_credentials() {
    # Export DataDog app key and api key as env vars if specified
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
    
    local credentials="${HOME}/.datadog/credentials"
    if [ -e "${credentials}" ]; then
        # IMPORTANT: This will grab the _first_ credentials entry. It does not support multiple entries.

        local aki=$(_get_kv_value "$credentials" 'api_key')
        if [ -n "$aki" ]; then
            export DATADOG_API_KEY="$aki"
        fi
        
        local sak=$(_get_kv_value "$credentials" 'app_key')
        if [ -n "$sak" ]; then
            export DATADOG_APP_KEY="$sak"
        fi
    else
        _log_error "No Datadog credentials file available ($credentials)"
    fi
}

