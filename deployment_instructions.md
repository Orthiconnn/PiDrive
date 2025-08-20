# PiDrive Deployment Instructions

## Files to Deploy

### 1. Web Interface Updates
- **File**: `index.html`
- **Location on Pi**: `/home/orthicon/pidrive-server/index.html`
- **Changes**: Fixed navigation/refresh issues, added smart auto-refresh

### 2. SMB Monitoring Script
- **File**: `detect_smb_changes.sh`
- **Location on Pi**: `/home/orthicon/detect_smb_changes.sh`
- **Purpose**: Monitors SMB share for changes and triggers USB gadget reload

### 3. SMB Detection Service
- **File**: `smb-detect.service`
- **Location on Pi**: `/etc/systemd/system/smb-detect.service`
- **Purpose**: Systemd service for SMB monitoring

## Deployment Steps

### Step 1: Transfer Files to Pi

```bash
# From your macOS machine, run these commands:

# Transfer the updated web interface
scp index.html orthicon@pidrive.local:/home/orthicon/pidrive-server/

# Transfer the SMB detection script
scp detect_smb_changes.sh orthicon@pidrive.local:/home/orthicon/

# Transfer the service file
scp smb-detect.service orthicon@pidrive.local:/tmp/
```

### Step 2: SSH into the Pi

```bash
ssh orthicon@pidrive.local
```

### Step 3: Install SMB Monitoring

```bash
# Make the script executable
chmod +x /home/orthicon/detect_smb_changes.sh

# Move the service file to systemd directory
sudo mv /tmp/smb-detect.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable the SMB detection service
sudo systemctl enable smb-detect.service

# Start the SMB detection service
sudo systemctl start smb-detect.service
```

### Step 4: Restart Web Service

```bash
# Restart the web server to load the new interface
sudo systemctl restart pidrive-web.service
```

### Step 5: Verify Services

```bash
# Check all services are running
sudo systemctl status pidrive-web smb-detect usb-gadget usb-sync usb-detect

# Check logs for SMB detection
sudo journalctl -u smb-detect -f
```

## Testing the Fixes

### Test 1: Web GUI Navigation
1. Open web interface at `http://pidrive.local:3000`
2. Navigate into subfolders - should stay in the folder
3. Add/delete files via USB - web should update without losing navigation

### Test 2: SMB Synchronization
1. Connect to SMB share from another computer
2. Add a file via SMB
3. Check USB drive on connected computer - file should appear within 5 seconds
4. Delete a file via SMB
5. Check USB drive - file should disappear within 5 seconds

### Test 3: Three-Way Sync
1. Add file via web interface → Should appear on USB and SMB
2. Add file via USB → Should appear on web and SMB
3. Add file via SMB → Should appear on web and USB

## Troubleshooting

### If SMB sync isn't working:
```bash
# Check the SMB detection service logs
sudo journalctl -u smb-detect -n 50

# Manually test the script
sudo /home/orthicon/detect_smb_changes.sh

# Check if mount point is accessible
ls -la /mnt/shared
```

### If web navigation still has issues:
```bash
# Clear browser cache
# Check browser console for errors (F12)
# Check server logs
sudo journalctl -u pidrive-web -n 50
```

### If USB gadget isn't updating:
```bash
# Check gadget status
lsmod | grep g_mass_storage

# Check sync services
sudo systemctl status usb-sync usb-detect smb-detect

# Manually reload gadget
sudo rmmod g_mass_storage
sudo modprobe g_mass_storage file=/home/orthicon/shared.img removable=1
```

## Summary of Changes

### Web GUI Improvements:
- ✅ Smart refresh that preserves navigation state
- ✅ Auto-refresh ignores temporary mount failures
- ✅ Path reference system prevents navigation resets
- ✅ Proper error handling for 404s during auto-refresh

### SMB Synchronization:
- ✅ Automatic detection of SMB changes
- ✅ USB gadget reload when SMB files change
- ✅ Debounce logic prevents excessive reloads
- ✅ Three-way sync now complete (Web ↔ USB ↔ SMB)

All three access methods (Web, USB, SMB) now properly synchronize with each other!
