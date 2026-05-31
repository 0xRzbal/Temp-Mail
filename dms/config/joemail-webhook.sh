#!/bin/bash
# JoeMail webhook delivery script
# Receives: recipient as $1, email on stdin
RECIPIENT="$1"
API_URL="http://joemail-api:3000/webhook/mail"

# Read email from stdin
EMAIL=$(cat)

# Parse headers
FROM=$(echo "$EMAIL" | grep -i "^From:" | head -1 | sed 's/^From: *//i')
SUBJECT=$(echo "$EMAIL" | grep -i "^Subject:" | head -1 | sed 's/^Subject: *//i')
DATE=$(echo "$EMAIL" | grep -i "^Date:" | head -1 | sed 's/^Date: *//i')

# Extract body (after first blank line)
BODY=$(echo "$EMAIL" | sed -n '/^$/,$p' | tail -n +2)

# POST to webhook
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg to "$RECIPIENT" \
    --arg from "$FROM" \
    --arg subject "$SUBJECT" \
    --arg body "$BODY" \
    --arg raw "$EMAIL" \
    '{to: $to, from: $from, subject: $subject, body: $body, raw: $raw, headers: {}, attachments: []}')"

exit 0
