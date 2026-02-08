#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: ./test/run-client.sh <API_KEY>"
  exit 1
fi

export API_KEY=$1
node test/test-client.js
