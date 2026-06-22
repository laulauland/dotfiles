#!/usr/bin/env bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Lights
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 💡
# @raycast.packageName Toggle Lights

# Documentation:
# @raycast.description Simple Litra snippet to turn on all devices
# @raycast.author laurynas
# @raycast.authorURL https://raycast.com/laurynas

# List all connected Litra devices in JSON format
LITRA_CLI_PATH="${LITRA_CLI_PATH:-litra}"

devices=$("$LITRA_CLI_PATH" devices --json)

# Extract serial numbers using jq
serial_numbers=$(echo "$devices" | jq -r '.[].serial_number')

# Check if any devices are found
if [ -z "$serial_numbers" ]; then
    echo "No Litra devices found."
    exit 1
fi

# Turn on each device
for serial in $serial_numbers; do
    echo "Toggling Litra device with serial number: $serial"
    $LITRA_CLI_PATH toggle --serial-number "$serial"
done

echo "All Litra devices have been turned on."
