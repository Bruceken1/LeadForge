#!/bin/bash
# LeadForge Agent — Vultr VM Deployment Script
# Run as root on a fresh Ubuntu 24.04 Vultr VM

set -e
echo "🚀 Deploying LeadForge Agent..."

# 1. Install Docker
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
fi

# 2. Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
  apt-get install -y docker-compose-plugin
fi

# 3. Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  Edit .env with your API keys before continuing"
  echo "   nano .env"
  exit 1
fi

# 4. Start services
docker compose -f docker/docker-compose.yml up -d --build

echo ""
echo "✅ LeadForge Agent is running!"
echo "   API: http://$(curl -s ifconfig.me):8000"
echo "   Health: http://$(curl -s ifconfig.me):8000/health"
echo ""
echo "Next: Set VITE_AGENT_API_URL=http://$(curl -s ifconfig.me):8000 in your LeadEngine .env"
