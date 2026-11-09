# Replicora: Distributed File Storage System

[![Node.js](https://img.shields.io/badge/Node.js-18+-68a063?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?style=flat-square&logo=docker)](https://www.docker.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0-47a248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![Consistent Hashing](https://img.shields.io/badge/Algorithm-Consistent%20Hashing-ff6f00?style=flat-square)](https://en.wikipedia.org/wiki/Consistent_hashing)

A production-grade, fault-tolerant **Distributed File Storage System** inspired by Google File System (GFS) and Amazon Dynamo. Built on a microservices architecture using **Node.js**, **Express**, **MongoDB**, and **Docker**.

Replicora acts as a multi-tenant cloud storage engine. It splits large files into discrete 4MB chunks, deterministically routes and replicates them across an isolated cluster of independent storage nodes using a **Consistent Hashing Ring with Virtual Nodes**, verifies cryptographic integrity via SHA-256 checksums, and implements automatic failover and transactional rollbacks.

---

## ✨ System Capabilities

* **Consistent Hashing Ring (Phase 3):** Replaces naive modulo round-robin with a 32-bit circular hash ring using **150 virtual nodes per physical storage node**. When cluster topology changes, only $\approx 1/N$ of keys are remapped rather than reshuffling the entire cluster.
* **Automatic Replica Failover:** If the primary replica storage node crashes or suffers network degradation during download, the coordinator seamlessly falls back to secondary replicas on the ring.
* **Transactional Rollback:** If an upload fails on any replica mid-stream, the coordinator initiates an immediate cluster-wide rollback, unlinking partial chunks from all disks to prevent orphaned data.
* **Zero-RAM Streaming:** Uses Node.js pipelines to stream binary data directly to disk, keeping memory consumption constant at $O(1)$ regardless of file size.
* **Multi-Tenancy & Security:** Cryptographic password hashing (`bcrypt`) and stateless JWT authorization (`jsonwebtoken`). Chunks and files are strictly isolated per tenant.
* **Dockerized Cluster:** 6 interconnected containers orchestrated via `docker-compose` on a private bridge network.
* **Observability & Cluster Management APIs:** Inspect ring topography, trace key assignments, and dynamically add/remove nodes at runtime.
* **Modern Web Dashboard:** Responsive HTML/CSS/JS interface supporting drag-and-drop uploads, live authentication state, and direct downloads.

---

## 🏗️ System Architecture

```mermaid
graph TD
    %% Styling
    classDef default fill:#f9f9f9,stroke:#333,stroke-width:2px;
    classDef service fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef storage fill:#efebe9,stroke:#5d4037,stroke-width:2px;
    classDef database fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef ui fill:#fff3e0,stroke:#f57c00,stroke-width:2px;

    Client["Web Client / Frontend UI<br/>(Port 8080)"]:::ui
    
    subgraph "Metadata Coordinator (Port 5000)"
        Auth["JWT Auth Guard"]:::service
        MS["File Service"]:::service
        Chunker["Chunker & Streamer"]:::service
        Ring["Consistent Hash Ring<br/>(150 vnodes/node)"]:::service
    end
    
    MongoDB[("MongoDB 6.0<br/>(Port 27017)")]:::database
    
    subgraph "Private Storage Cluster (replicora-network)"
        Node1[("Storage Node 1<br/>Port 5001")]:::storage
        Node2[("Storage Node 2<br/>Port 5002")]:::storage
        Node3[("Storage Node 3<br/>Port 5003")]:::storage
    end
    
    %% Relationships
    Client <-->|POST /auth/login| Auth
    Client <-->|REST API + Bearer Token| MS
    Auth <--> MongoDB
    MS <--> Chunker
    Chunker -->|O(log(N*V)) Ring Lookup| Ring
    Chunker <-->|Store File & Chunk Metadata| MongoDB
    Chunker -->|Write / Read Replicas (Failover)| Node1
    Chunker -->|Write / Read Replicas (Failover)| Node2
    Chunker -->|Write / Read Replicas (Failover)| Node3
```

---

## 🔬 Consistent Hashing Deep Dive

### The Problem with Naive Modulo Round-Robin
In traditional modulo-based distribution, chunk target nodes are calculated as:

$$\text{Node Index} = \text{chunkIndex} \pmod N$$

When the cluster scales from $N$ to $N+1$ nodes (or when a node fails), the denominator changes for **every calculation**. This triggers the **Modulo Catastrophe**:

$$\text{Keys Reshuffled} = \frac{N - 1}{N} \approx 75\% - 99\%$$

In persistent storage systems, this would require saturating network bandwidth to migrate almost all data across hard drives.

### The Replicora Hash Ring
Replicora maps both **Storage Nodes** and **Chunk IDs** onto a 32-bit circular keyspace ($0$ to $2^{32} - 1$):

```
                       [ Node 1 ] (token: 1,020,400)
                      /          \
                     /   Chunk X  \
                    /  (token: 1.5M)\
                   /        |        \
                  /         v         \
       [ Node 3 ] ------- Clockwise -> [ Node 2 ]
    (token: 3,450,000)              (token: 2,100,000)
```

1. **Virtual Nodes (vnodes = 150):** Each physical node is hashed 150 times around the ring (`node-1#vnode-0`, `node-1#vnode-1`, etc.). This eliminates statistical clustering and ensures a uniform $\approx 33.3\%$ storage distribution across 3 nodes.
2. **Binary Search Lookup:** Locating the owner node on the ring uses bisect-right binary search in $O(\log(N \times V))$ time.
3. **Multi-Replica Walk:** For `REPLICATION_FACTOR = 2`, the coordinator walks clockwise along the ring to collect the first 2 **distinct physical nodes**, automatically skipping overlapping virtual nodes.

### Empirical Benchmark (10,000 Keys)
Validated using [`metadata-service/tests/testHashRing.js`](file:///d:/viswajith/PROJECTS-INTERN/storage/metadata-service/tests/testHashRing.js):

| Metric | Modulo Strategy | Replicora Consistent Hashing |
| :--- | :--- | :--- |
| **Node 1 Share** | 33.33% | **32.38%** (Uniform) |
| **Node 2 Share** | 33.33% | **35.21%** (Uniform) |
| **Node 3 Share** | 33.33% | **32.41%** (Uniform) |
| **Keys Remapped when Node 4 is Added** | **~75.0%** (Massive Cache Thrashing) | **28.45%** ($\approx \frac{1}{N+1}$) |
| **Key Movement Destination** | Scrambled across all nodes | **100% of moved keys went directly to Node 4** |

---

## 📁 Project Structure

```
storage/
├── docker-compose.yml              # Cluster orchestrator (6 containers)
├── frontend/                       # Static UI & Nginx reverse proxy
│   ├── index.html                  # Cloud drive single-page interface
│   ├── style.css                   # Custom responsive styling
│   └── app.js                      # Auth management & chunk streaming client
├── common/                         # Shared constants & helpers
├── metadata-service/               # Coordinator Node (Port 5000)
│   ├── controllers/                # Auth & File API controllers
│   ├── middlewares/                # JWT verification & Multer disk buffer
│   ├── models/                     # User, File, and Chunk MongoDB schemas
│   ├── routes/                     # /auth, /files, and /cluster routes
│   ├── services/                   # Chunker, FileService, and ReplicaSelection
│   ├── utils/                      # HashRing engine & SHA-256 checksums
│   └── tests/                      # HashRing & ReplicaSelection test suites
└── storage-node/                   # Worker Node Service (Ports 5001, 5002, 5003)
    ├── controllers/                # Chunk read, write, and delete controllers
    └── routes/                     # /chunks endpoints
```

---

## 🚀 Quickstart

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### 1. Launch the Cluster
From the root directory, execute:
```bash
docker-compose up -d --build
```
This boots 6 containerized services:
1. `replicora-mongo`: MongoDB metadata database (`27017`)
2. `replicora-storage-1`: Storage Node 1 (`5001`)
3. `replicora-storage-2`: Storage Node 2 (`5002`)
4. `replicora-storage-3`: Storage Node 3 (`5003`)
5. `replicora-metadata`: Coordinator Service (`5000`)
6. `replicora-frontend`: Nginx Web Server (`8080`)

### 2. Access the Application
Open your browser and navigate to:
**[http://localhost:8080](http://localhost:8080)**

1. Register a new user account.
2. Sign in to retrieve your JWT session token.
3. Drag-and-drop or upload files to watch Replicora chunk, hash, and distribute your data.

### 3. Run the Consistent Hashing Test Suite
To execute the automated hash ring benchmarks and replica integration tests:
```bash
cd metadata-service
npm run test:ring
```

### 4. Teardown
To cleanly stop and preserve volume data:
```bash
docker-compose down
```

---

## 📡 API Reference

### 1. Authentication (Public)

#### `POST /auth/register`
Create a new tenant account.
```json
{
  "username": "alex",
  "password": "securepassword123"
}
```

#### `POST /auth/login`
Authenticate and obtain a Bearer JWT token.
```json
{
  "username": "alex",
  "password": "securepassword123"
}
```
**Response:**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "userId": "...", "username": "alex" }
}
```

---

### 2. File Operations (Requires Bearer Token)

Pass the header `Authorization: Bearer <your_jwt_token>` for all `/files` requests.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/files/upload` | Upload a file (`multipart/form-data`, field: `file`). Splits, hashes, and replicates chunks. |
| `GET` | `/files` | List all files owned by the authenticated tenant. |
| `GET` | `/files/:fileId/download` | Reassembles chunks, verifies SHA-256 integrity, with automatic replica failover. |
| `DELETE` | `/files/:fileId` | Cascade-deletes all chunk replicas across all storage nodes and cleans metadata. |

---

### 3. Cluster Observability & Management

#### `GET /cluster/ring-status`
Inspect physical nodes, total virtual nodes, and ring distribution.
```bash
curl http://localhost:5000/cluster/ring-status
```
**Sample Response:**
```json
{
  "status": "success",
  "replicationFactor": 2,
  "ring": {
    "totalPhysicalNodes": 3,
    "totalVirtualNodes": 450,
    "vnodesPerNode": 150,
    "physicalNodes": [
      { "id": "node-1", "url": "http://storage-node-1:5001" },
      { "id": "node-2", "url": "http://storage-node-2:5002" },
      { "id": "node-3", "url": "http://storage-node-3:5003" }
    ],
    "distribution": { "node-1": 150, "node-2": 150, "node-3": 150 }
  }
}
```

#### `GET /cluster/ring-lookup?key=<chunkIdOrKey>`
Query deterministic node placement for any key.
```bash
curl "http://localhost:5000/cluster/ring-lookup?key=chunk-789a"
```

#### `POST /cluster/nodes`
Dynamically register a new storage node into the Hash Ring without restarting the coordinator.
```bash
curl -X POST http://localhost:5000/cluster/nodes \
  -H "Content-Type: application/json" \
  -d '{"id": "node-4", "url": "http://storage-node-4:5004"}'
```

#### `DELETE /cluster/nodes/:nodeId`
Dynamically decommission a storage node from the Hash Ring.
```bash
curl -X DELETE http://localhost:5000/cluster/nodes/node-4
```

---

## 🛡️ Security & Network Isolation

The Storage Nodes (`node-1`, `node-2`, `node-3`) are **not exposed** to the host network or public internet. They communicate strictly over the internal Docker network (`replicora-network`). 

* **Defense in Depth:** Direct client requests cannot reach raw storage drives or bypass the coordinator.
* **Authentication Gate:** Only requests verified by the JWT Auth Guard on the Metadata Service can trigger chunk reads, writes, or deletions.
* **Cryptographic Integrity:** Every downloaded chunk is verified against its stored SHA-256 checksum to protect against bit rot and disk corruption.
