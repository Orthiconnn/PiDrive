# PiDrive System Documentation

## Overview

PiDrive is a Raspberry Pi-based file sharing system that emulates Google Drive functionality. It provides three synchronized methods to access the same 32GB virtual drive:

1. **USB Mass Storage** - Appears as removable drive when connected via USB
2. **Web Interface** - Google Drive-like web UI accessible via browser
3. **SMB Network Share** - Appears as network drive in Finder/Explorer

All three methods access the same virtual drive file and stay synchronized in real-time.

## Hardware Requirements

- Raspberry Pi 2 W (or similar with USB OTG capability)
- MicroSD card (16GB+ recommended)
- USB cable for connecting to computers

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   USB Computer  │    │  Network Computer │    │   Pi Services   │
│                 │    │                  │    │                 │
│  ┌───────────┐  │    │  ┌─────────────┐ │    │  Web Server     │
│  │USB Drive  │◄─┼────┼──┤Web Interface│ │    │  SMB Server     │
│  │(32GB)     │  │    │  │             │ │    │  USB Gadget     │
│  └───────────┘  │    │  └─────────────┘ │    │  Sync Scripts   │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                 │                        │
                                 └────────────────────────┘
                                     shared.img (32GB)
```

## Core Components

### 1. Virtual Drive Image
- **File**: `/home/orthicon/shared.img`
- **Size**: 32GB
- **Format**: exFAT (cross-platform compatibility)
- **Mount Point**: `/mnt/shared`

### 2. USB Mass Storage Gadget
- **Module**: `g_mass_storage`
- **Service**: `usb-gadget.service`
- **Purpose**: Exposes virtual drive as USB storage device

### 3. Web Interface
- **Service**: `pidrive-web.service`
- **Port**: 3000
- **Technology**: Node.js + Express + React
- **Features**: Upload, download, delete, rename, multi-select

### 4. SMB Network Share
- **Service**: `smbd`
- **Share Name**: PiDrive
- **Access**: Guest (no authentication required)

### 5. Synchronization Scripts
- **USB Sync**: `~/sync_usb.sh` (web→USB changes)
- **USB Detection**: `~/detect_usb_changes.sh` (USB→web changes)

## File Structure

```
/home/orthicon/
├── shared.img                    # 32GB virtual drive file
├── sync_usb.sh                   # Web-to-USB sync script
├── detect_usb_changes.sh         # USB-to-web detection script
└── pidrive-server/               # Web server directory
    ├── server.js                 # Node.js backend
    ├── package.json              # Dependencies
    └── public/
        └── index.html            # React frontend

/mnt/shared/                      # Mount point for virtual drive
├── (user files)                  # Files accessible via all interfaces

/etc/systemd/system/
├── usb-gadget.service           # USB mass storage service
├── pidrive-web.service          # Web server service
├── usb-sync.service             # Web-to-USB sync service
└── usb-detect.service           # USB-to-web detection service

/etc/hostapd/hostapd.conf        # WiFi hotspot config (optional)
/etc/dhcpcd.conf                 # Network configuration
/etc/samba/smb.conf              # SMB share configuration
/etc/fstab                       # Auto-mount configuration
/boot/firmware/config.txt        # Pi hardware configuration
/boot/firmware/cmdline.txt       # Boot parameters
```

## Service Configuration

### USB Mass Storage (`usb-gadget.service`)
```ini
[Unit]
Description=USB Mass Storage Gadget
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/sbin/modprobe g_mass_storage file=/home/orthicon/shared.img removable=1
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

### Web Server (`pidrive-web.service`)
```ini
[Unit]
Description=PiDrive Web Server
After=network.target

[Service]
Type=simple
User=orthicon
WorkingDirectory=/home/orthicon/pidrive-server
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

### USB Sync (`usb-sync.service`)
```ini
[Unit]
Description=USB Sync Service

[Service]
Type=simple
User=root
ExecStart=/home/orthicon/sync_usb.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

### USB Detection (`usb-detect.service`)
```ini
[Unit]
Description=USB Changes Detection

[Service]
Type=simple
User=root
ExecStart=/home/orthicon/detect_usb_changes.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

## Script Details

### Web-to-USB Sync Script (`~/sync_usb.sh`)
```bash
#!/bin/bash
while true; do
  sleep 2  # Check every 2 seconds
  if [ -f /tmp/sync_needed ]; then
    sudo rmmod g_mass_storage
    sync
    sudo modprobe g_mass_storage file=/home/orthicon/shared.img removable=1
    rm /tmp/sync_needed
  fi
done
```

**Purpose**: Monitors for `/tmp/sync_needed` flag and reloads USB gadget when web changes occur.

### USB-to-Web Detection Script (`~/detect_usb_changes.sh`)
```bash
#!/bin/bash
LAST_MODIFIED=$(stat -c %Y /home/orthicon/shared.img)
LAST_SIZE=$(stat -c %s /home/orthicon/shared.img)
LAST_CHANGE=0

while true; do
  sleep 3  # Check every 3 seconds
  CURRENT_TIME=$(date +%s)
  
  # Only check if it's been at least 5 seconds since last change
  if [ $((CURRENT_TIME - LAST_CHANGE)) -gt 5 ]; then
    CURRENT_MODIFIED=$(stat -c %Y /home/orthicon/shared.img)
    CURRENT_SIZE=$(stat -c %s /home/orthicon/shared.img)
    
    if [ "$CURRENT_MODIFIED" != "$LAST_MODIFIED" ] || [ "$CURRENT_SIZE" != "$LAST_SIZE" ]; then
      echo "USB change detected, remounting..."
      sudo umount /mnt/shared 2>/dev/null
      sleep 1
      sudo mount -t exfat -o loop,offset=210763776,uid=1000,gid=1000 /home/orthicon/shared.img /mnt/shared
      
      LAST_MODIFIED=$CURRENT_MODIFIED
      LAST_SIZE=$CURRENT_SIZE
      LAST_CHANGE=$CURRENT_TIME
    fi
  fi
done
```

**Purpose**: Detects changes to the virtual drive image and remounts the filesystem for web access.

## Key Configuration Files

### Boot Configuration (`/boot/firmware/config.txt`)
```
dtoverlay=dwc2
```

### Boot Parameters (`/boot/firmware/cmdline.txt`)
```
console=serial0,115200 console=tty1 root=PARTUUID=xxx rootfstype=ext4 fsck.repair=yes rootwait cfg80211.ieee80211_regdom=US modules-load=dwc2
```

### Auto-mount Configuration (`/etc/fstab`)
```
/home/orthicon/shared.img /mnt/shared exfat loop,offset=210763776,uid=1000,gid=1000,user,auto 0 0
```

### SMB Configuration (`/etc/samba/smb.conf`)
```ini
[PiDrive]
path = /mnt/shared
browseable = yes
read only = no
guest ok = yes
force user = orthicon
create mask = 0775
directory mask = 0775
```

## API Endpoints

The web server provides these REST endpoints:

- `GET /api/files?path=<path>` - List files in directory (supports nested paths)
- `POST /api/upload?path=<path>` - Upload files to specific directory (multipart/form-data)
- `GET /api/download/:filename?path=<path>` - Download a file from specific directory
- `DELETE /api/files/:filename?path=<path>` - Delete a file from specific directory
- `PUT /api/files/:filename?path=<path>` - Rename a file in specific directory
- `POST /api/refresh` - Force remount of shared drive

## Recent Improvements (2025)

### Folder Navigation System
The web interface now supports full folder navigation with the following enhancements:

#### **Fixed Issues**
- **Path Duplication Bug**: Resolved issue where folder navigation would create malformed paths like `import/import/import`
- **Frontend Crashes**: Fixed `TypeError: data.filter is not a function` when server returns error objects
- **Race Conditions**: Eliminated conflicts between auto-refresh intervals and user navigation
- **Double-Click Interference**: Prevented duplicate navigation events from onClick/onDoubleClick handlers

#### **Enhanced Error Handling**
- Frontend now gracefully handles non-array server responses
- Automatic fallback to root directory when invalid paths are accessed
- Comprehensive error logging for debugging navigation issues
- Server always returns proper JSON responses even for 404 errors

#### **Performance Optimizations**
- **Memoized Components**: React.memo() prevents unnecessary re-renders of file rows
- **Smart File Diffing**: Hash-based comparison only updates UI when files actually change
- **Optimized Keys**: File list uses path-based keys instead of array indices
- **Loading States**: Prevents navigation conflicts during folder transitions

#### **Debugging Features**
- Console logging for path calculation steps
- Network request monitoring for API calls
- Error tracking for failed navigation attempts
- Breadcrumb path validation logging

### Frontend Architecture

#### **Component Structure**
```javascript
// Memoized file row component prevents unnecessary re-renders
const FileRow = memo(({ file, isSelected, isRenaming, ... }) => {
  // Handles single-click navigation for directories
  // Prevents double-click interference
  // Supports file selection, renaming, and download
});

// Main application component
function PiDrive() {
  // State management for navigation, loading, file operations
  // Smart file fetching with error handling
  // Breadcrumb navigation support
  // Drag-and-drop file upload
}
```

#### **Navigation Logic**
```javascript
const handleFolderDoubleClick = (folderName) => {
  if (loading) return; // Prevent navigation during loading
  
  console.log('handleFolderDoubleClick called with:', folderName);
  console.log('Current path before navigation:', currentPath);
  
  setLoading(true);
  const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
  console.log('New path calculated:', newPath);
  
  setCurrentPath(newPath);
  setSelectedFiles(new Set());
  
  setTimeout(() => {
    fetchFiles(newPath).finally(() => setLoading(false));
  }, 0);
};
```

#### **Error Recovery**
```javascript
const fetchFiles = async (path = currentPath) => {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('API error:', error);
      
      // Auto-recovery: return to root on 404
      if (response.status === 404 && path) {
        console.log('Directory not found, returning to root');
        setCurrentPath('');
        fetchFiles('');
        return;
      }
      // Prevent crashes: set empty array for other errors
      setFiles([]);
      return;
    }
    
    const data = await response.json();
    
    // Ensure data is always an array
    if (!Array.isArray(data)) {
      console.error('Invalid response format:', data);
      setFiles([]);
      return;
    }
    
    // Smart diffing and sorting logic...
  } catch (error) {
    console.error('Error fetching files:', error);
  }
};
```

### Backend Enhancements

#### **Path Security**
- Comprehensive path validation to prevent directory traversal attacks
- Proper URL encoding/decoding for special characters in filenames
- Security checks ensure all operations stay within mount point

#### **Enhanced File Operations**
- Support for nested directory operations (upload, delete, rename)
- Proper error responses with consistent JSON format
- Filesystem sync after operations to ensure USB gadget updates

#### **Mount Point Management**
- Automatic remounting with correct exFAT offset (210763776)
- Retry logic for failed mount operations
- Proper error handling for mount/unmount operations

### Current Status

#### **Fully Implemented**
- ✅ Folder navigation with breadcrumb support
- ✅ Multi-file selection and operations
- ✅ Drag-and-drop file upload
- ✅ File renaming with inline editing
- ✅ Error recovery and graceful degradation
- ✅ Smart UI updates without page refreshes
- ✅ Cross-browser compatibility (Firefox, Safari, Chrome)
- ✅ Mobile-responsive design
- ✅ Real-time synchronization across all access methods

#### **Testing Status**
- ✅ Path concatenation logic verified
- ✅ Error handling tested with malformed requests
- ✅ Race condition fixes validated
- ✅ Double-click interference resolved
- ✅ Browser cache compatibility confirmed
- ✅ Pi server deployment process validated

#### **Known Limitations**
- Single-click navigation temporarily enabled for testing (will revert to double-click)
- No authentication/authorization system
- No file versioning or conflict resolution
- Limited to 32GB total storage

### Deployment Process

#### **Development to Production**
1. **Local Testing**: Test changes in local development environment
2. **File Transfer**: Use SCP to deploy files to Pi server
   ```bash
   scp index.html orthicon@pidrive.local:/home/orthicon/pidrive-server/
   scp server.js orthicon@pidrive.local:/home/orthicon/pidrive-server/
   ```
3. **Service Restart**: Restart web service if needed
   ```bash
   ssh orthicon@pidrive.local "sudo systemctl restart pidrive-web"
   ```
4. **Verification**: Test functionality via web interface
5. **Browser Cache**: Clear browser cache if changes don't appear

#### **Rollback Procedure**
- Keep backup copies of working versions
- Quick rollback via SCP of previous working files
- Service restart to load previous version

## Synchronization Process

### Web → USB Flow
1. User uploads/deletes file via web interface
2. Server processes request and saves to `/mnt/shared`
3. Server creates `/tmp/sync_needed` flag
4. `sync_usb.sh` detects flag and reloads USB gadget
5. USB drive reflects changes immediately

### USB → Web Flow
1. User adds/deletes file via USB connection
2. Changes written to `/home/orthicon/shared.img`
3. `detect_usb_changes.sh` detects file modification
4. Script remounts `/mnt/shared` to see changes
5. Web interface auto-refreshes and shows updates

## Network Configuration

### Default Setup
- **Hostname**: `pidrive.local`
- **User**: `orthicon`
- **Web Interface**: `http://pidrive.local:3000` or `http://[IP]:3000`
- **SMB Share**: `smb://pidrive.local` or `smb://[IP]`

### Optional WiFi Hotspot
- **SSID**: `pi-drive`
- **Password**: `platter`
- **IP Range**: `192.168.4.x`

## Installation Summary

1. **Base System**: Raspberry Pi OS Lite
2. **Dependencies**: Node.js, npm, hostapd, dnsmasq, samba, exfat-fuse
3. **Virtual Drive**: 32GB exFAT image file
4. **Services**: All systemd services enabled for auto-start
5. **Scripts**: Executable sync scripts in home directory
6. **Web App**: React frontend with Node.js backend

## Troubleshooting

### Check Service Status
```bash
sudo systemctl status usb-gadget pidrive-web usb-sync usb-detect
```

### Check Mount Status
```bash
mount | grep shared
ls -la /mnt/shared
```

### Check USB Gadget
```bash
lsmod | grep g_mass_storage
cat /sys/module/g_mass_storage/parameters/file
```

### Check Web Interface
```bash
curl http://localhost:3000/api/files
netstat -tlnp | grep 3000
```

### View Logs
```bash
sudo journalctl -u pidrive-web -f
sudo journalctl -u usb-detect -f
sudo journalctl -u usb-sync -f
```

## Cloning/Deployment

To create multiple PiDrives:

1. **Create Image**: `sudo dd if=/dev/diskX of=pidrive-master.img bs=1m`
2. **Deploy**: `sudo dd if=pidrive-master.img of=/dev/diskX bs=1m`
3. **Customize**: Change hostname, WiFi settings per device
4. **Fresh Drive**: Optionally clear virtual drive for each deployment

## Performance Notes

- **Sync Frequency**: USB detection every 3 seconds, web refresh every 1 second
- **File Size Limit**: 32GB total, no individual file limits
- **Concurrent Access**: Multiple devices can access simultaneously
- **Reliability**: Auto-recovery from mount failures and service crashes

## Security Considerations

- **SMB Access**: Guest access (no authentication)
- **Web Interface**: No authentication required
- **Network**: Accessible to any device on same network
- **USB**: Physical access provides full drive access

This system prioritizes ease of use over security and is intended for trusted environments.
