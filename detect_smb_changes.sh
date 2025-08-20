#!/bin/bash

# SMB Change Detection Script for PiDrive
# Monitors /mnt/shared for changes made via SMB and triggers USB gadget reload

MOUNT_POINT="/mnt/shared"
IMG_FILE="/home/orthicon/shared.img"
WATCH_INTERVAL=2  # seconds between checks
DEBOUNCE_TIME=3   # seconds to wait after a change before triggering sync

# Store checksums of directories to detect changes
declare -A DIR_CHECKSUMS
LAST_SYNC_TIME=0

# Function to calculate directory checksum
get_dir_checksum() {
    local dir="$1"
    # Use find to list all files with modification times and sizes
    # This will detect file additions, deletions, and modifications
    find "$dir" -type f -printf "%T@ %s %p\n" 2>/dev/null | md5sum | cut -d' ' -f1
}

# Function to reload USB gadget
reload_usb_gadget() {
    echo "SMB change detected, reloading USB gadget..."
    
    # Remove the gadget module
    sudo rmmod g_mass_storage 2>/dev/null
    
    # Sync filesystem
    sync
    sleep 1
    
    # Reload the gadget module
    sudo modprobe g_mass_storage file="$IMG_FILE" removable=1
    
    echo "USB gadget reloaded successfully"
}

# Function to check for changes
check_for_changes() {
    local current_time=$(date +%s)
    local changed=false
    
    # Get current checksum of the mount point
    local current_checksum=$(get_dir_checksum "$MOUNT_POINT")
    
    # Compare with previous checksum
    if [ -n "${DIR_CHECKSUMS[$MOUNT_POINT]}" ]; then
        if [ "$current_checksum" != "${DIR_CHECKSUMS[$MOUNT_POINT]}" ]; then
            changed=true
        fi
    fi
    
    # Update stored checksum
    DIR_CHECKSUMS[$MOUNT_POINT]="$current_checksum"
    
    # If changes detected and enough time has passed since last sync
    if [ "$changed" = true ]; then
        local time_since_last_sync=$((current_time - LAST_SYNC_TIME))
        
        if [ $time_since_last_sync -gt $DEBOUNCE_TIME ]; then
            reload_usb_gadget
            LAST_SYNC_TIME=$current_time
        else
            echo "Change detected, waiting for debounce period..."
        fi
    fi
}

# Main monitoring loop
echo "Starting SMB change detection for PiDrive..."
echo "Monitoring: $MOUNT_POINT"
echo "Check interval: ${WATCH_INTERVAL}s, Debounce time: ${DEBOUNCE_TIME}s"

# Initial checksum
DIR_CHECKSUMS[$MOUNT_POINT]=$(get_dir_checksum "$MOUNT_POINT")

while true; do
    sleep $WATCH_INTERVAL
    
    # Check if mount point is still accessible
    if [ ! -d "$MOUNT_POINT" ]; then
        echo "Warning: Mount point $MOUNT_POINT not accessible, waiting..."
        sleep 5
        continue
    fi
    
    # Check for changes
    check_for_changes
done
