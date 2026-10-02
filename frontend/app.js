const API_URL = 'http://localhost:5000';

const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const filesList = document.getElementById('filesList');
const emptyState = document.getElementById('emptyState');

// Format bytes to human readable size
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Fetch and display all files
async function loadFiles() {
  try {
    const response = await fetch(`${API_URL}/files`);
    const files = await response.json();
    
    filesList.innerHTML = '';
    
    if (files.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      files.forEach(file => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
          <td><strong>${file.fileName}</strong><br><small style="color:#888;">${file.fileId}</small></td>
          <td>${formatBytes(file.fileSize)}</td>
          <td>
            <button class="btn action" onclick="downloadFile('${file.fileId}', '${file.fileName}')">Download</button>
            <button class="btn danger" onclick="deleteFile('${file.fileId}')">Delete</button>
          </td>
        `;
        filesList.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error fetching files:', error);
  }
}

// Handle File Upload
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (fileInput.files.length === 0) return;
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  
  uploadBtn.disabled = true;
  uploadBtn.innerText = 'Uploading...';
  uploadStatus.innerText = 'Please wait, uploading to cluster...';
  
  try {
    const response = await fetch(`${API_URL}/files/upload`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      uploadStatus.innerText = '✅ File uploaded successfully!';
      uploadStatus.style.color = 'green';
      fileInput.value = ''; // clear input
      loadFiles(); // refresh list
    } else {
      uploadStatus.innerText = `❌ Error: ${result.error || 'Upload failed'}`;
      uploadStatus.style.color = 'red';
    }
  } catch (error) {
    uploadStatus.innerText = `❌ Network Error: Could not reach the server.`;
    uploadStatus.style.color = 'red';
    console.error('Upload error:', error);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerText = 'Upload';
    
    // clear success message after a few seconds
    setTimeout(() => {
      if(uploadStatus.innerText.includes('✅')) uploadStatus.innerText = '';
    }, 4000);
  }
});

// Download File (Triggers browser download via hidden link)
window.downloadFile = (fileId, fileName) => {
  const downloadUrl = `${API_URL}/files/${fileId}/download`;
  
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName; 
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Delete File
window.deleteFile = async (fileId) => {
  if (!confirm('Are you sure you want to delete this file across the entire cluster?')) return;
  
  try {
    const response = await fetch(`${API_URL}/files/${fileId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    if (result.success) {
      loadFiles(); // refresh list
    } else {
      alert(`Error deleting file: ${result.error}`);
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Network error while deleting.');
  }
};

// Initial load
loadFiles();
