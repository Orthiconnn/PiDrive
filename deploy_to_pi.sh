#!/bin/bash

# PiDrive Deployment Script
# Transfers updated files from macOS to Pi Zero and restarts services

PI_HOST="pidrive.local"
PI_USER="orthicon"

echo "======================================"
echo "PiDrive Deployment Script"
echo "======================================"
echo ""

# Check if we can reach the Pi
echo "Checking connection to Pi at $PI_HOST..."
if ! ping -c 1 $PI_HOST &> /dev/null; then
    echo "❌ Cannot reach $PI_HOST. Please check:"
    echo "   - Pi is powered on"
    echo "   - Connected to same network"
    echo "   - Hostname is correct (try IP address instead)"
    exit 1
fi
echo "✅ Pi is reachable"
echo ""

# Transfer files
echo "Transferring files to Pi..."
echo ""

# 1. Transfer updated web interface
echo "1. Copying index.html to Pi..."
scp index.html ${PI_USER}@${PI_HOST}:/home/orthicon/pidrive-server/
if [ $? -eq 0 ]; then
    echo "   ✅ index.html transferred"
else
    echo "   ❌ Failed to transfer index.html"
    exit 1
fi

# 2. Transfer SMB detection script
echo "2. Copying detect_smb_changes.sh to Pi..."
scp detect_smb_changes.sh ${PI_USER}@${PI_HOST}:/home/orthicon/
if [ $? -eq 0 ]; then
    echo "   ✅ detect_smb_changes.sh transferred"
else
    echo "   ❌ Failed to transfer detect_smb_changes.sh"
    exit 1
fi

# 3. Transfer service file
echo "3. Copying smb-detect.service to Pi..."
scp smb-detect.service ${PI_USER}@${PI_HOST}:/tmp/
if [ $? -eq 0 ]; then
    echo "   ✅ smb-detect.service transferred"
else
    echo "   ❌ Failed to transfer smb-detect.service"
    exit 1
fi

echo ""
echo "======================================"
echo "Setting up services on Pi..."
echo "======================================"
echo ""

# Execute setup commands on Pi
ssh ${PI_USER}@${PI_HOST} << 'EOF'
echo "Making SMB detection script executable..."
chmod +x /home/orthicon/detect_smb_changes.sh

echo "Installing SMB detection service..."
sudo mv /tmp/smb-detect.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable smb-detect.service
sudo systemctl start smb-detect.service

echo "Restarting web server..."
sudo systemctl restart pidrive-web.service

echo ""
echo "Checking service status..."
echo "======================================"
sudo systemctl status pidrive-web --no-pager | head -n 5
echo ""
sudo systemctl status smb-detect --no-pager | head -n 5
echo ""
sudo systemctl status usb-gadget --no-pager | head -n 5
EOF

echo ""
echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "You can now test the system:"
echo "1. Web Interface: http://${PI_HOST}:3000"
echo "2. SMB Share: smb://${PI_HOST}"
echo "3. USB: Connect Pi to computer via USB"
echo ""
echo "To monitor logs:"
echo "  ssh ${PI_USER}@${PI_HOST} 'sudo journalctl -u smb-detect -f'"
