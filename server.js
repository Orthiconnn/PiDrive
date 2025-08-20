const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Mount point for the shared drive
const MOUNT_POINT = '/mnt/shared';
const SHARED_IMG = '/home/orthicon/shared.img';

// Ensure mount point exists and mount the shared image with proper exfat offset
function ensureSharedDriveMount() {
  if (!fs.existsSync(MOUNT_POINT)) {
    fs.mkdirSync(MOUNT_POINT, { recursive: true });
  }
  
  exec(`sudo mount -t exfat -o loop,offset=210763776,uid=1000,gid=1000 ${SHARED_IMG} ${MOUNT_POINT}`, (error) => {
    if (error) {
      console.log('Mount may already exist or failed:', error.message);
      // Try to unmount and remount if failed
      exec(`sudo umount ${MOUNT_POINT} 2>/dev/null && sudo mount -t exfat -o loop,offset=210763776,uid=1000,gid=1000 ${SHARED_IMG} ${MOUNT_POINT}`, (retryError) => {
        if (retryError) {
          console.error('Failed to mount shared drive:', retryError.message);
        } else {
          console.log('Shared drive remounted successfully');
        }
      });
    } else {
      console.log('Shared drive mounted successfully');
    }
  });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MOUNT_POINT);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// API Routes

// Get file list
app.get('/api/files', (req, res) => {
  try {
    const requestedPath = req.query.path || '';
    const fullPath = path.join(MOUNT_POINT, requestedPath);
    
    // Security check: ensure path is within mount point
    if (!fullPath.startsWith(MOUNT_POINT)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    // Check if directory exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    
    // Check if it's actually a directory
    if (!fs.statSync(fullPath).isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    
    const files = fs.readdirSync(fullPath).map(filename => {
      const filepath = path.join(fullPath, filename);
      const stats = fs.statSync(filepath);
      return {
        name: filename,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });
    res.json(files);
  } catch (error) {
    console.error('Error reading files:', error);
    res.status(500).json({ error: 'Failed to read files: ' + error.message });
  }
});

// Upload files
app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    const requestedPath = req.query.path || '';
    const targetPath = path.join(MOUNT_POINT, requestedPath);
    
    // Security check: ensure path is within mount point
    if (!targetPath.startsWith(MOUNT_POINT)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    // Ensure target directory exists
    if (!fs.existsSync(targetPath)) {
      return res.status(400).json({ error: 'Target directory does not exist' });
    }
    
    // Move uploaded files to the correct directory
    req.files.forEach(file => {
      const oldPath = file.path;
      const newPath = path.join(targetPath, file.filename);
      fs.renameSync(oldPath, newPath);
    });
    
    const uploadedFiles = req.files.map(file => ({
      name: file.filename,
      size: file.size
    }));
    
    // Force filesystem sync before triggering USB reload
    exec('sync', () => {
      fs.writeFileSync('/tmp/sync_needed', '');
    });
    
    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Download file
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(MOUNT_POINT, filename);
  
  if (fs.existsSync(filepath)) {
    res.download(filepath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Delete file
app.delete('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const requestedPath = req.query.path || '';
  const filepath = path.join(MOUNT_POINT, requestedPath, filename);
  
  // Security check: ensure path is within mount point
  if (!filepath.startsWith(MOUNT_POINT)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  try {
    if (fs.statSync(filepath).isDirectory()) {
      fs.rmSync(filepath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filepath);
    }
    
    // Force filesystem sync before triggering USB reload
    exec('sync', () => {
      fs.writeFileSync('/tmp/sync_needed', '');
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file: ' + error.message });
  }
});

// Rename file
app.put('/api/files/:filename', (req, res) => {
  const oldFilename = req.params.filename;
  const { newName } = req.body;
  const requestedPath = req.query.path || '';
  const oldPath = path.join(MOUNT_POINT, requestedPath, oldFilename);
  const newPath = path.join(MOUNT_POINT, requestedPath, newName);
  
  // Security check: ensure paths are within mount point
  if (!oldPath.startsWith(MOUNT_POINT) || !newPath.startsWith(MOUNT_POINT)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  try {
    if (fs.existsSync(newPath)) {
      return res.status(400).json({ error: 'File with that name already exists' });
    }
    
    fs.renameSync(oldPath, newPath);
    
    // Force filesystem sync before triggering USB reload
    exec('sync', () => {
      fs.writeFileSync('/tmp/sync_needed', '');
    });
    
    res.json({ success: true, newName });
  } catch (error) {
    console.error('Rename error:', error);
    res.status(500).json({ error: 'Failed to rename file: ' + error.message });
  }
});

// Manual refresh endpoint
app.post('/api/refresh', (req, res) => {
  try {
    // Force remount to pick up external changes
    exec(`sudo umount ${MOUNT_POINT} 2>/dev/null; sudo mount -t exfat -o loop,offset=210763776,uid=1000,gid=1000 ${SHARED_IMG} ${MOUNT_POINT}`, (error) => {
      if (error) {
        res.status(500).json({ error: 'Failed to refresh mount' });
      } else {
        res.json({ success: true });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// Serve React app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
ensureSharedDriveMount();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PiDrive server running on http://0.0.0.0:${PORT}`);
});
