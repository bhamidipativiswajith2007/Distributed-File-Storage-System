# Distributed File Storage System (Phase 1)

A clean, modular, and robust distributed file storage system prototype built using Node.js, Express, MongoDB, and Mongoose. 

Phase 1 focuses on building a working end-to-end file upload, chunking, storage, and download/reassembly pipeline using a single storage node. Chunks are stored as binary files on local disk and metadata is tracked in MongoDB.

---

## 🏗️ Architecture Diagram

```mermaid
graph TD
    Client[Client / User]
    
    subgraph Metadata Service [Metadata Service - Port 5000]
        API[Express Router]
        Multer[Multer Middleware]
        TempFile[(Temp Disk Storage)]
        UploadSvc[Upload Service / Stream Chunker]
        DownloadSvc[Download Service / Verifier]
        DeleteSvc[Delete Service]
        Mongoose[Mongoose / MongoDB Client]
    end
    
    subgraph Storage Node [Storage Node - Port 5001]
        SN_API[Express Router]
        DiskIO[File System Writer/Reader]
    end
    
    MongoDB[(MongoDB Database)]
    DiskStorage[(Local Disk: storage-node/data/chunks/)]

    %% Connections
    Client -->|1. Upload File (Multipart)| API
    API -->|2. Save to Temp File| Multer
    Multer -->|3. Write| TempFile
    UploadSvc -->|4. Read Stream & Chunk| TempFile
    UploadSvc -->|5. Upload Chunks via Axios (PUT)| SN_API
    UploadSvc -.->|6. Delete Temp File| TempFile
    
    DownloadSvc -->|Get Chunks via Axios (GET)| SN_API
    DeleteSvc -->|Delete Chunks via Axios (DELETE)| SN_API
    
    SN_API -->|Read/Write Chunks| DiskIO
    DiskIO -->|Binary Files| DiskStorage
    
    UploadSvc -->|Save Metadata| Mongoose
    DownloadSvc -->|Query Metadata| Mongoose
    DeleteSvc -->|Remove Metadata| Mongoose
    Mongoose --> MongoDB
```

---

## 📁 Folder Structure

```
distributed-storage/
├── common/
│   └── constants.js             # Shared configuration defaults
├── metadata-service/
│   ├── config/
│   │   └── index.js             # Port, Mongo URI, chunk size configurations
│   ├── controllers/
│   │   └── fileController.js    # Express Controller for handling files HTTP req/res
│   ├── models/
│   │   ├── File.js              # Mongoose schema for files metadata
│   │   └── Chunk.js             # Mongoose schema for chunk mappings
│   ├── routes/
│   │   └── fileRoutes.js        # Express routes for files API
│   ├── services/
│   │   ├── chunkerService.js    # Logic for splitting file & sequential uploads
│   │   ├── storageNodeService.js# Axios HTTP wrappers for Storage Node requests
│   │   └── fileService.js       # Orchestrator for files and MongoDB transaction queries
│   ├── middlewares/
│   │   ├── upload.js            # Multer config with temporary storage
│   │   └── errorHandler.js      # Global error responses and size-limit handler
│   ├── utils/
│   │   └── hash.js              # Cryptographic helper for SHA-256 hashes
│   ├── server.js                # App entry point & MongoDB bootstrapper
│   └── .env                     # Configuration values
├── storage-node/
│   ├── config/
│   │   └── index.js             # Port and chunk file storage directory settings
│   ├── controllers/
│   │   └── chunkController.js   # Disk writer, streaming reader & delete operations
│   ├── routes/
│   │   └── chunkRoutes.js       # Express routes mapping chunk APIs
│   ├── middlewares/
│   │   └── errorHandler.js      # Simple error logger and response formats
│   ├── server.js                # Storage Node App entry point
│   └── .env                     # Configuration values
├── package.json                 # Monorepo workspaces definition
└── README.md
```

---

## 🔄 How Upload Works

1. **Client Request**: The client issues a `POST /files/upload` request containing multipart form data (with the file in a field named `file`).
2. **Multer Parsed & Buffered**: The file is parsed by `multer` and saved as a temporary file in `metadata-service/temp/uploads/`.
3. **Sequential Chunking**: The `chunkerService` reads the file sequentially by allocating a buffer of size `CHUNK_SIZE` (default 4MB) using file descriptors.
4. **ID and Cheksumming**: For each chunk, a unique UUID `chunkId` is generated, and a SHA-256 hash checksum is calculated over its binary buffer contents.
5. **Axios Streaming Upload**: The chunk buffer is sent via `Axios.put` to the Storage Node endpoint `PUT /chunks/:chunkId`.
6. **Error Rollback**: If *any* chunk upload fails during this cycle, the `chunkerService` initiates a cleanup, deleting all successfully uploaded chunks for this file from the Storage Node, then throws an error.
7. **Metadata Persistence**: After all chunks upload successfully, the metadata is saved in MongoDB (`File` and `Chunk` collections), and the temporary file is deleted from the `metadata-service` local storage.

---

## 📥 How Download Works

1. **Client Request**: The client requests `GET /files/:fileId/download`.
2. **Metadata Lookup**: The `metadata-service` fetches the file metadata from MongoDB and finds its associated chunks.
3. **Explicit Ordering**: Chunks are explicitly sorted by `chunkIndex` in ascending order.
4. **Sequentially Streamed & Verified**:
   - The `metadata-service` fetches each chunk sequentially from the Storage Node using `Axios.get` with `responseType: 'arraybuffer'`.
   - The SHA-256 hash of the downloaded chunk is computed and verified against the hash stored in MongoDB.
   - If the hash fails verification, the download process is aborted:
     - If no bytes were sent yet, a `500 Internal Server Error` is returned to the client.
     - If the stream is active, the connection is abruptly closed (`res.destroy()`) to prevent delivering corrupt data.
   - If the chunk is valid, it is streamed immediately to the response stream.

---

## 📋 API Documentation

### 💾 Storage Node (Port 5001)

#### 1. Upload Chunk
- **Method & Route**: `PUT /chunks/:chunkId`
- **Request Body**: Raw binary stream
- **Success Response**: `201 Created`
  ```json
  {
    "success": true,
    "message": "Chunk uploaded successfully"
  }
  ```

#### 2. Download Chunk
- **Method & Route**: `GET /chunks/:chunkId`
- **Success Response**: `200 OK` with binary octet-stream

#### 3. Delete Chunk
- **Method & Route**: `DELETE /chunks/:chunkId`
- **Success Responses**: 
  - `200 OK` (if deleted successfully)
    ```json
    {
      "success": true,
      "message": "Chunk deleted successfully"
    }
    ```
  - `404 Not Found` (if chunk did not exist)
    ```json
    {
      "success": false,
      "error": "Chunk not found"
    }
    ```

#### 4. Health Check
- **Method & Route**: `GET /health`
- **Success Response**: `200 OK`
  ```json
  {
    "status": "healthy"
  }
  ```

---

### 🗂️ Metadata Service (Port 5000)

#### 1. Upload File
- **Method & Route**: `POST /files/upload`
- **Headers**: `Content-Type: multipart/form-data`
- **Request Body**: File payload under form-key `file`
- **Success Response**: `201 Created`
  ```json
  {
    "success": true,
    "fileId": "65ef49a4-56b0-4db7-8b01-a1691c95b0ff"
  }
  ```
- **Error Response** (Size Exceeded): `400 Bad Request`
  ```json
  {
    "success": false,
    "error": "File upload rejected: exceeds maximum allowed size of 500MB."
  }
  ```

#### 2. Download File
- **Method & Route**: `GET /files/:fileId/download`
- **Success Response**: `200 OK` with headers `Content-Type: application/octet-stream` and `Content-Disposition: attachment; filename="<filename>"`

#### 3. List Files
- **Method & Route**: `GET /files`
- **Success Response**: `200 OK`
  ```json
  [
    {
      "fileId": "65ef49a4-56b0-4db7-8b01-a1691c95b0ff",
      "fileName": "lecture-notes.pdf",
      "fileSize": 10485760,
      "totalChunks": 3,
      "createdAt": "2026-07-07T00:00:00.000Z"
    }
  ]
  ```

#### 4. Delete File
- **Method & Route**: `DELETE /files/:fileId`
- **Success Response**: `200 OK`
  ```json
  {
    "success": true,
    "message": "File and all related chunks deleted successfully"
  }
  ```

---

## ⚙️ Environment Variables Reference

### Metadata Service `.env`
Create in `metadata-service/.env`:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/distributed_storage
STORAGE_NODE_URL=http://localhost:5001
CHUNK_SIZE=4194304
MAX_FILE_SIZE=524288000
```

### Storage Node `.env`
Create in `storage-node/.env`:
```env
PORT=5001
```

---

## 🚀 How to Run the Project

### Prerequisites
1. **Node.js**: Ensure Node.js (v18 or higher) is installed.
2. **MongoDB**: Have MongoDB running locally on the default port `27017` or update `MONGO_URI` in `metadata-service/.env`.

### Step 1: Install Dependencies
From the project root directory, run:
```bash
npm install
```

### Step 2: Running the Services

#### Run both services concurrently (Recommended):
From the project root directory:
```bash
npm run dev
```

#### Run services separately:
- **To start the Storage Node**:
  ```bash
  npm run dev:storage
  ```
- **To start the Metadata Service**:
  ```bash
  npm run dev:metadata
  ```
