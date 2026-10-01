# 🚀 WedSnap Production Deployment Guide

This guide walks you through deploying your **AI Wedding Photo Retrieval Platform** into production.

---

## 🏛️ Architecture Breakdown

Before choosing where to host, here is how WedSnap's components interact:

```text
┌────────────────────────────────────────────────────────┐
│                   GUESTS & PHOTOGRAPHERS               │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS (Port 443)
                            ▼
┌────────────────────────────────────────────────────────┐
│          REVERSE PROXY / CDN (Cloudflare / Nginx)       │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              │ / (Static assets)         │ /api/* & /uploads/*
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│     WEB FRONTEND          │ │      NODE.JS API         │
│  (React 18 + Vite SPA)    │ │   (Express + diskDb)     │
│  Port: 80 / 5174          │ │   Port: 5000             │
└───────────────────────────┘ └───────────┬──────────────┘
                                          │
                                          │ Internal RPC (Port 8000)
                                          ▼
                              ┌──────────────────────────┐
                              │   PYTHON AI MICROSERVICE │
                              │   (YuNet + ArcFace 512D) │
                              │   Port: 8000             │
                              └──────────────────────────┘
```

Because WedSnap uses **YuNet face detection** and **ArcFace ResNet-50 512D deep neural embeddings** running on C++ native runtimes (`onnxruntime` + `cv2`), the AI microservice cannot run on standard serverless edge functions like Vercel Functions (which have 250MB size caps and 10s cold-start limits).

---

## 🏆 Where Can You Deploy? (Comparison)

| Hosting Provider | Monthly Cost | Ease of Setup | Performance | Recommended For |
|---|---|---|---|---|
| **Option 1: Cloud VPS (Hetzner / DigitalOcean / Linode)** | **$5 – $10/mo** | ⭐⭐⭐⭐ (Docker) | ⭐⭐⭐⭐⭐ (Fastest, 0 cold starts) | **Most Recommended (Best Value & Control)** |
| **Option 2: Railway.app / Render.com** | **$7 – $15/mo** | ⭐⭐⭐⭐⭐ (Git Push) | ⭐⭐⭐⭐ (Very Good) | **Zero-DevOps (No Linux terminal required)** |
| **Option 3: Hybrid (Vercel + Railway + Cloudflare R2)** | **$5 – $12/mo** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (Global CDN Edge) | **Maximum global scalability** |

---

# 🛠️ OPTION 1: Cloud VPS with Docker Compose (Recommended)

This is the standard, most cost-effective production deployment for AI vision platforms. All services run on one server with zero network latency between the Node API and Python AI service.

### Recommended VPS Specifications:
- **Provider:** [Hetzner Cloud](https://www.hetzner.com/cloud) (CPX21 - 3 vCPU, 4GB RAM for ~€7/mo) or [DigitalOcean](https://www.digitalocean.com) (Basic Droplet 2 vCPU, 4GB RAM for $12/mo).
- **OS:** Ubuntu 22.04 LTS or 24.04 LTS.

---

### Step 1: Connect to your VPS
From your local terminal (PowerShell or macOS/Linux):
```bash
ssh root@<YOUR_SERVER_IP>
```

---

### Step 2: Install Docker & Docker Compose
Run on your server:
```bash
# Update packages
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verify Docker
docker --version
docker compose version
```

---

### Step 3: Clone Your Codebase & Copy Models
```bash
# Clone your repository
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git /opt/wedsnap
cd /opt/wedsnap

# Verify models are present in /opt/wedsnap/models/
ls -lh models/
# You should see:
# - face_detection_yunet_2023mar.onnx
# - face_recognition_arcface_r50_512d.onnx
```

> **Note:** If models were not committed to Git due to file size, copy them directly using `scp`:
> ```bash
> # Run from your Windows terminal:
> scp -r models root@<YOUR_SERVER_IP>:/opt/wedsnap/
> ```

---

### Step 4: Configure Production Environment Variables
Create your production `.env` file:
```bash
cp .env.production.example .env
nano .env
```
Fill in:
```ini
APP_URL=https://photos.yourdomain.com
PORT=5000
NODE_ENV=production
JWT_SECRET=super_secure_random_production_secret_key_99381
AI_SERVICE_URL=http://ai-service:8000
```
*(Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit nano)*.

---

### Step 5: Launch with Docker Compose
Run:
```bash
docker compose up -d --build
```
Check container status:
```bash
docker compose ps
docker compose logs -f
```
Your entire application is now running live!
- Web frontend on port `80`
- Node API on port `5000`
- Python ArcFace AI on port `8000`

---

### Step 6: Set Up Free Automatic HTTPS (SSL) with Caddy or Certbot
To get a green padlock (`https://`) on your domain:

#### Simple Method with Caddy (Automatic SSL):
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy -y
```

Edit `/etc/caddy/Caddyfile`:
```caddy
photos.yourdomain.com {
    reverse_proxy localhost:80
}
```

Restart Caddy:
```bash
systemctl restart caddy
```
Caddy will automatically issue and renew a free Let's Encrypt SSL certificate!

---

# 🚂 OPTION 2: Railway.app (Zero-DevOps Setup)

If you don't want to manage a Linux server or terminal, **Railway** can deploy each component directly from your GitHub repository.

### Step 1: Create a Project on Railway
1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub Repo**.
3. Select your repository.

### Step 2: Set Up Service 1 — Python AI Microservice
1. Click **+ Add Service** → **GitHub Repo**.
2. Settings:
   - Root directory: `/`
   - Dockerfile path: `apps/ai-service/Dockerfile`
   - Port: `8000`
   - Environment Variables:
     - `MODELS_DIR=/models`
3. Add a Persistent Volume mounted to `/models` and upload the ONNX files.

### Step 3: Set Up Service 2 — Node API Server
1. Click **+ Add Service** → **GitHub Repo**.
2. Settings:
   - Dockerfile path: `Dockerfile.api`
   - Port: `5000`
   - Environment Variables:
     - `NODE_ENV=production`
     - `JWT_SECRET=your_secret_key`
     - `AI_SERVICE_URL=http://${{ai-service.RAILWAY_PRIVATE_DOMAIN}}:8000`
3. Add a Persistent Volume mounted to `/app/uploads` and `/app/data`.

### Step 4: Set Up Service 3 — Web Frontend
1. Click **+ Add Service** → **GitHub Repo**.
2. Settings:
   - Dockerfile path: `Dockerfile.web`
   - Port: `80`
   - Environment Variables:
     - `VITE_API_URL=https://api.yourdomain.com/api/v1`
3. Attach your custom domain in the **Networking** tab.

---

# ☁️ OPTION 3: Hybrid (Vercel Frontend + VPS Backend)

For ultra-fast global CDN speeds:
1. **Frontend:** Deploy `apps/web` on **Vercel**
   - Root Directory: `apps/web`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Environment Variable: `VITE_API_URL=https://api.yourdomain.com/api/v1`
2. **Backend & AI:** Deploy on a VPS or Railway using `Dockerfile.api` and `apps/ai-service/Dockerfile`.

---

## 🔒 Production Data Persistence & Backups

WedSnap stores state on disk:
- **Database:** `data/wednap_db.json` (Events, photos, 512D face embeddings)
- **Photos:** `uploads/`

### Automated Daily Backup Script:
Run on your server via `crontab -e`:
```bash
# Backup every night at 2:00 AM to a compressed archive
0 2 * * * tar -czf /backups/wedsnap_$(date +\%F).tar.gz /opt/wedsnap/data /opt/wedsnap/uploads
```
Alternatively, for unlimited photo storage, integrate an S3-compatible service like **Cloudflare R2** (10GB free, $0 egress fees) or **AWS S3**.
