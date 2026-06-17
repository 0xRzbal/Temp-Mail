#!/bin/bash
CONFIG="/opt/joemail/dms/config/relay.conf"
STATUS_FILE="/opt/joemail/dms/config/relay-status.json"
LAST_HASH=""

# Write initial status
echo '{"active":false,"relayhost":"","updated":"'$(date -Iseconds)'"}' > "$STATUS_FILE"

while true; do
  if [ -f "$CONFIG" ]; then
    CURRENT_HASH=$(md5sum "$CONFIG" | awk '{print $1}')
    if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
      echo "[$(date)] Config changed, applying..."
      /opt/joemail/relay-manager.sh apply
      LAST_HASH="$CURRENT_HASH"
    fi
  fi
  
  # Update status file
  RELAYHOST=$(docker exec joemail-dms postconf relayhost 2>/dev/null | sed 's/relayhost = //')
  if [ -n "$RELAYHOST" ] && [ "$RELAYHOST" != "" ]; then
    echo "{\"active\":true,\"relayhost\":\"$RELAYHOST\",\"updated\":\"$(date -Iseconds)\"}" > "$STATUS_FILE"
  else
    echo "{\"active\":false,\"relayhost\":\"\",\"updated\":\"$(date -Iseconds)\"}" > "$STATUS_FILE"
  fi
  
  sleep 5
done
