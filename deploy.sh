#!/bin/bash
# LeadForge Agent — Railway Deployment
# Railway deploys automatically from GitHub. This script is for local dev only.
#
# To deploy to Railway:
#   1. Push this repo to GitHub
#   2. Go to railway.app → New Project → Deploy from GitHub repo
#   3. Add a PostgreSQL database service
#   4. Set environment variables (see .env.example)
#   Railway handles everything else via railway.toml + docker/Dockerfile

set -e

if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Created .env — add your GROQ_API_KEY and DATABASE_URL before running"
  exit 1
fi

echo "Starting LeadForge Agent locally..."
uvicorn api.main:app --reload --port "${PORT:-8000}"
