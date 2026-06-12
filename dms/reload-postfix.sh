#!/bin/bash
# Auto-reload DMS postfix when config files change
# Triggered by systemd path unit watching /opt/joemail/dms/config/

CONFIG_DIR="/opt/joemail/dms/config"
DMS_CONTAINER="joemail-dms"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [dms-reload] $1"; }

# Debounce: wait 2s for multiple rapid writes
sleep 2

# Remove signal file if exists
rm -f "$CONFIG_DIR/.reload-signal"

# Copy config files into DMS container
if [ -f "$CONFIG_DIR/postfix-vhost.cf" ]; then
    docker cp "$CONFIG_DIR/postfix-vhost.cf" "$DMS_CONTAINER:/etc/postfix/vhost" 2>/dev/null
    log "Synced postfix-vhost.cf"
fi

if [ -f "$CONFIG_DIR/postfix-transport" ]; then
    docker cp "$CONFIG_DIR/postfix-transport" "$DMS_CONTAINER:/etc/postfix/transport" 2>/dev/null
    docker exec "$DMS_CONTAINER" postmap /etc/postfix/transport 2>/dev/null
    log "Synced postfix-transport + postmap"
fi

# Reload postfix
docker exec "$DMS_CONTAINER" postfix reload 2>/dev/null
log "Postfix reloaded"
