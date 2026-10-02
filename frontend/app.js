const API_URL = 'http://localhost:5000';

// Auth Elements
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const logoutBtn = document.getElementById('logoutBtn');
const authForm = document.getElementById('authForm');
const authStatus = document.getElementById('authStatus');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');

// App Elements
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const filesList = document.getElementById('filesList');
const emptyState = document.getElementById('emptyState');

let isLoginMode = true;

// Utility: Check if logged in
function getToken() {
  return localStorage.getItem('replicora_token');
}

// Utility: Format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Check initial Auth State
function checkAuthState() {
  const token = getToken();
  if (token) {
    authSection.style.display = 'none';
    appSection.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    loadFiles(); // Only fetch files if logged in
  } else {
    authSection.style.display = 'block';
    appSection.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
}

// Auth Tabs Toggle
tabLogin.addEventListener('click', () => {
  isLoginMode = true;
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  authSubmitBtn.innerText = 'Login';
  authStatus.innerText = '';
});

tabRegister.addEventListener('click', () => {
  isLoginMode = false;
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  authSubmitBtn.innerText = 'Register';
  authStatus.innerText = '';
});

// Handle Login / Register
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
  const username = usernameInput.value;
  const password = passwordInput.value;
  
  authSubmitBtn.disabled = true;
  authStatus.innerText = 'Please wait...';
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const result = await response.json();
    
    if (result.success) {
      localStorage.setItem('replicora_token', result.token);
      usernameInput.value = '';
      passwordInput.value = '';
      authStatus.innerText = ''; // <-- Fix: clear the text so it doesn't linger!
      checkAuthState(); // Swap to App UI
    } else {
      authStatus.innerText = `❌ Error: ${result.error}`;
      authStatus.style.color = 'red';
    }
  } catch (error) {
    authStatus.innerText = '❌ Network Error';
    authStatus.style.color = 'red';
  } finally {
    authSubmitBtn.disabled = false;
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('replicora_token');
  checkAuthState();
});

// Fetch and display all files
async function loadFiles() {
  try {
    const response = await fetch(`${API_URL}/files`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('replicora_token');
      checkAuthState();
      return;
    }

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
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      uploadStatus.innerText = '✅ File uploaded successfully!';
      uploadStatus.style.color = 'green';
      fileInput.value = ''; 
      loadFiles(); 
    } else {
      uploadStatus.innerText = `❌ Error: ${result.error || 'Upload failed'}`;
      uploadStatus.style.color = 'red';
    }
  } catch (error) {
    uploadStatus.innerText = `❌ Network Error`;
    uploadStatus.style.color = 'red';
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerText = 'Upload';
    setTimeout(() => { if(uploadStatus.innerText.includes('✅')) uploadStatus.innerText = ''; }, 4000);
  }
});

// Download File via Fetch to inject Auth Header, then create object URL
window.downloadFile = async (fileId, fileName) => {
  try {
    const response = await fetch(`${API_URL}/files/${fileId}/download`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (!response.ok) throw new Error('Download failed');
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch(error) {
    alert("Error downloading file.");
  }
};

// Delete File
window.deleteFile = async (fileId) => {
  if (!confirm('Are you sure you want to delete this file across the entire cluster?')) return;
  try {
    const response = await fetch(`${API_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const result = await response.json();
    if (result.success) {
      loadFiles(); 
    } else {
      alert(`Error deleting file: ${result.error}`);
    }
  } catch (error) {
    alert('Network error while deleting.');
  }
};

// Initialize
checkAuthState();
