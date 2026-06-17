#!/bin/bash
# Relay manager - called by API via HTTP trigger
ACTION="$1"
CONFIG_FILE="/opt/joemail/dms/config/relay.conf"

case "$ACTION" in
  apply)
    if [ ! -f "$CONFIG_FILE" ]; then
      echo '{"success":false,"message":"No relay config found"}'
      exit 1
    fi
    
    HOST=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['host'])")
    PORT=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['port'])")
    USER=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['username'])")
    PASS=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['password'])")
    ENABLED=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('enabled', True))")
    
    if [ "$ENABLED" = "True" ] || [ "$ENABLED" = "true" ]; then
      # Apply relay config
      docker exec joemail-dms bash -c "echo '[$HOST]:$PORT $USER:$PASS' > /etc/postfix/sasl_passwd_relay"
      docker exec joemail-dms postmap /etc/postfix/sasl_passwd_relay
      docker exec joemail-dms chmod 600 /etc/postfix/sasl_passwd_relay /etc/postfix/sasl_passwd_relay.db
      docker exec joemail-dms postconf -e "relayhost = [$HOST]:$PORT"
      docker exec joemail-dms postconf -e "smtp_sasl_auth_enable = yes"
      docker exec joemail-dms postconf -e "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd_relay"
      docker exec joemail-dms postconf -e "smtp_sasl_security_options = noanonymous"
      docker exec joemail-dms postconf -e "smtp_tls_security_level = encrypt"
      docker exec joemail-dms postconf -e "smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt"
      docker exec joemail-dms postfix reload
      echo '{"success":true,"message":"Relay applied: '$HOST':'$PORT'"}'
    else
      # Disable relay
      docker exec joemail-dms postconf -e "relayhost ="
      docker exec joemail-dms postconf -e "smtp_sasl_auth_enable = no"
      docker exec joemail-dms postconf -e "smtp_sasl_password_maps ="
      docker exec joemail-dms postconf -e "smtp_tls_security_level = may"
      docker exec joemail-dms postfix reload
      echo '{"success":true,"message":"Relay disabled"}'
    fi
    ;;
    
  status)
    RELAYHOST=$(docker exec joemail-dms postconf relayhost 2>/dev/null | sed 's/relayhost = //')
    if [ -n "$RELAYHOST" ] && [ "$RELAYHOST" != "" ]; then
      echo "{\"success\":true,\"data\":{\"active\":true,\"relayhost\":\"$RELAYHOST\"}}"
    else
      echo '{"success":true,"data":{"active":false,"relayhost":""}}'
    fi
    ;;
    
  stats)
    RELAYHOST=$(docker exec joemail-dms postconf relayhost 2>/dev/null | sed 's/relayhost = //')
    RELAYED=$(docker exec joemail-dms tail -100 /var/log/mail.log 2>/dev/null | grep -c "relay=" || echo 0)
    SENT=$(docker exec joemail-dms tail -1000 /var/log/mail.log 2>/dev/null | grep -c "status=sent" || echo 0)
    QUEUE=$(docker exec joemail-dms postqueue -p 2>/dev/null | tail -1 || echo "Empty")
    echo "{\"success\":true,\"data\":{\"relayActive\":$([ -n "$RELAYHOST" ] && [ "$RELAYHOST" != "" ] && echo true || echo false),\"relayHost\":\"$RELAYHOST\",\"recentRelayed\":$RELAYED,\"recentSent\":$SENT,\"queueStatus\":\"$QUEUE\"}}"
    ;;
    
  logs)
    LINES="${2:-50}"
    LOGS=$(docker exec joemail-dms tail -$LINES /var/log/mail.log 2>/dev/null | grep -E "(relay=|status=|smtp2go)" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip().split('\n')))" 2>/dev/null || echo '[]')
    echo "{\"success\":true,\"data\":{\"logs\":$LOGS}}"
    ;;
    
  *)
    echo '{"success":false,"message":"Unknown action"}'
    ;;
esac
