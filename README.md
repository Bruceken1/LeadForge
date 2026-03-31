# LeadForge Agent
## Autonomous SDR — Multi-Agent Sales System for East African Businesses
**Powered by LangGraph × Vultr Serverless Inference × Dime Solutions LeadEngine**

---

## What it does

LeadForge takes your LeadEngine from a smart tool into a fully autonomous sales team member.
You give it a campaign goal and an ICP. It handles everything else:

```
YOU: "Find hotel owners in Mombasa who need better online visibility"
     ↓
SUPERVISOR  →  plans the workflow, routes tasks, handles errors
     ↓
RESEARCH    →  scrapes Google Maps, browses their websites, finds decision makers
     ↓
QUALIFIER   →  scores each lead 0-100 against your ICP, rejects weak ones
     ↓
PERSONALIZER →  writes a unique email + WhatsApp for each lead (city/industry aware)
     ↓
EXECUTOR    →  sends via Resend + Twilio, updates CRM, schedules follow-ups
     ↓
YOU: receive a summary — "12 leads found, 8 qualified, 8 emails + WhatsApp sent"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            LeadForge Agent (Vultr VM)                │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │   LangGraph Supervisor (Mixtral 8x7B)        │     │
│  │   • Creates plan per campaign                │     │
│  │   • Routes to sub-agents                     │     │
│  │   • Error recovery + reflection              │     │
│  │   • Human-in-the-loop for high-value leads   │     │
│  └──────────────┬──────────────────────────────┘     │
│      ┌──────────┼──────────────────┐                  │
│      ▼          ▼          ▼       ▼                  │
│  Research   Qualifier  Personalizer  Executor          │
│  (Mistral)  (Mistral)  (Mixtral)   (Mistral)          │
│                                                       │
│  PostgreSQL + pgvector (lead memory + RAG)            │
└──────────────────────────────┬──────────────────────┘
                               │ tools
                               ▼
              ┌────────────────────────────┐
              │  LeadEngine Worker (CF)    │
              │  • scrape_google_maps()    │
              │  • enrich_lead_email()     │
              │  • send_email()            │
              │  • send_whatsapp()         │
              │  • update_crm_stage()      │
              └────────────────────────────┘
```

## LLM — 100% Open Source via Vultr Serverless Inference

```python
from langchain_openai import ChatOpenAI

# Vultr exposes an OpenAI-compatible endpoint — zero config changes needed
llm = ChatOpenAI(
    model           = "mistralai/Mixtral-8x7B-Instruct-v0.1",
    openai_api_key  = VULTR_API_KEY,
    openai_api_base = "https://api.vultrinference.com/v1",
)
```

| Agent | Model | Why |
|---|---|---|
| Supervisor | Mixtral 8x7B | Complex reasoning, planning, reflection |
| Research | Mixtral 8x7B | Summarising website content, extracting insights |
| Qualifier | Mistral 7B | Fast classification, scoring decisions |
| Personalizer | Mixtral 8x7B | Creative writing, tone matching |
| Executor | Mistral 7B | Structured tool use, routing |

---

## API keys needed

| Key | Where | Required |
|---|---|---|
| `VULTR_SERVERLESS_INFERENCE_API_KEY` | vultr.com → AI/ML → Serverless Inference | **Yes** |
| `DATABASE_URL` | auto-configured via Docker | **Yes** |
| `SERPAPI_KEY` | serpapi.com (for news search) | Optional |

The LeadEngine Worker handles all other keys (Resend, Twilio, Apollo, etc.)
The agent calls those tools via the LeadEngine API — no keys stored on the Vultr VM.

---

## Deploy on Vultr

### 1. Create VM
- vultr.com → Deploy → Cloud Compute → Ubuntu 24.04
- Recommended: $12/mo (2 vCPU, 4 GB RAM) minimum
- Enable: SSH key

### 2. Get Vultr Serverless Inference key
- vultr.com → AI/ML → Serverless Inference → Create API Key

### 3. Deploy
```bash
ssh root@YOUR_VULTR_IP
git clone https://github.com/YOUR/leadforge-agent
cd leadforge-agent
cp .env.example .env
nano .env   # Add VULTR_SERVERLESS_INFERENCE_API_KEY
bash deploy.sh
```

### 4. (Optional) Production nginx
```bash
apt install -y nginx
cp docker/nginx.conf /etc/nginx/sites-available/leadforge
# Edit nginx.conf — replace YOUR_VULTR_IP
ln -s /etc/nginx/sites-available/leadforge /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

### 5. Connect to LeadEngine
See `INTEGRATION.md` for step-by-step instructions to add the Agent dashboard
to your existing LeadEngine React frontend.

---

## Human-in-the-loop

When the Qualifier scores a lead >= 85 with 100+ reviews, the Supervisor
signals `HIGH_VALUE`. The executor pauses. The frontend shows an approval panel:

```
⚠️ High-Value Lead Detected
   Nairobi Java House — ICP score: 91/100
   Rating: 4.6 (847 reviews) | Email: manager@javahousekenya.com
   [Approve outreach] [Reject]
```

LangGraph's SSE stream sends `type: "paused"` to the frontend.
On approval, the agent resumes from the exact checkpoint.

---

## Hackathon checklist

- [x] Multi-agent architecture (5 agents: Supervisor + 4 specialists)
- [x] Open-source LLMs only (Mistral 7B + Mixtral 8x7B via Vultr)
- [x] Deployed on Vultr VM (FastAPI + PostgreSQL)
- [x] Vultr Serverless Inference for all LLM calls
- [x] RAG memory (pgvector — past successful campaigns)
- [x] Human-in-the-loop (LangGraph checkpoints + SSE approval UI)
- [x] Real enterprise tools (Resend email, Twilio WhatsApp, CRM updates)
- [x] Real East African data (Google Maps + SerpApi)
- [x] Streaming UI (Server-Sent Events live agent feed)
- [x] Production web app (not a demo — fully integrated with LeadEngine SaaS)
