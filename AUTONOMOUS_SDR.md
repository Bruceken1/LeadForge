# LeadForge Autonomous AI SDR — v2.0

A fully autonomous 24/7 AI Sales Development Representative for East African businesses.

## What's New in v2.0

### 1. Multi-Agent Architecture (7 Agents)
| Agent | Role |
|---|---|
| `research_agent` | Finds leads via Google Maps + buy signals + web crawling |
| `qualifier_agent` | Scores leads 0-100 against your ICP |
| `personalization_agent` | Writes adaptive, hyper-personalized sequences |
| `executor_agent` | Sends email/WhatsApp, manages follow-up sequences |
| `reply_handler_agent` | Reads inbox, handles objections, routes to booking |
| `meeting_booker_agent` | Proposes times, handles back-and-forth, books calendar |
| `optimizer_agent` | Tracks metrics, refines ICP weights, improves targeting |

### 2. Always-On Lead Generation
- Set your ICP once at `/autonomous` → ICP Setup
- AI automatically runs every **30 minutes**
- Buy signals monitored every **2–6 hours**:
  - New Kenya business registrations
  - Funding/expansion news
  - New Google Maps listings (new businesses = buying signal)
- Leads with buy signals get a **+15–25 ICP score boost**

### 3. Autonomous Reply Handling
- Inbox checked every **10 minutes**
- Replies classified: Interested / Objection / Meeting / Unsubscribe
- Objection handling: Price → ROI reframe | Timing → future check-in | Competitor → unique differentiator
- Opt-outs detected by keyword scan and processed **immediately**

### 4. Automatic Meeting Booking
- Connects to Google Calendar / Outlook / Calendly
- Proposes 3 specific time slots in replies (EAT timezone)
- Handles back-and-forth rescheduling (up to 3 rounds, then Calendly fallback)
- Sends .ics calendar invites with agenda
- Reminders sent 24h and 1h before

### 5. Adaptive Multi-Channel Sequences
- Sequences are **dynamic** — next step chosen based on reply/engagement
- Email + WhatsApp channels, switched automatically on bounce
- Max 4 touches per lead before moving to long-term nurture (90-day pause)

### 6. Self-Learning Optimization
- Tracks: open rate, reply rate, meeting rate, win rate per campaign/segment
- After 50+ sends: analyzes top 20% leads, identifies winning ICP patterns
- Proposes ICP weight adjustments (require human approval before applying)
- Flags underperforming campaigns automatically

### 7. CRM Integration
| CRM | Config |
|---|---|
| HubSpot | `HUBSPOT_ACCESS_TOKEN` |
| Salesforce | `SALESFORCE_CLIENT_ID` + `SALESFORCE_CLIENT_SECRET` |
| Pipedrive | `PIPEDRIVE_API_TOKEN` |
| Built-in | No config needed (default) |

Bi-directional sync: leads auto-created, stages auto-updated, meetings logged.

### 8. Kenya DPA 2019 Compliance
- Every email includes a compliant opt-out footer (Art. 26)
- Suppression list checked before **every** send
- Opt-outs processed within 24 hours (legally required)
- Data retention: leads anonymized after 365 days (Art. 31)
- Full audit log of all data access and processing actions (Art. 35)
- Suppression list and compliance report available at `/api/compliance/`

## Quick Start

```bash
# 1. Copy and fill in your environment variables
cp .env.example .env
nano .env  # Fill in GROQ_API_KEY, DATABASE_URL, RESEND_API_KEY at minimum

# 2. Run with Docker (recommended)
cd docker && docker-compose up -d

# 3. Or run locally
pip install -r requirements.txt
python -m uvicorn api.main:app --reload

# 4. Open the dashboard
open http://localhost:5173/autonomous
```

## Minimum Required Variables

```env
GROQ_API_KEY=gsk_...        # Free at console.groq.com
DATABASE_URL=postgresql://...
RESEND_API_KEY=re_...        # Free tier: resend.com
LEADENGINE_API_URL=https://...
SENDER_EMAIL=you@yourdomain.com
```

## Human Oversight

Visit `/autonomous` → **Overview** tab for:
- Real-time notifications
- Approval queue (high-value leads, ICP changes)
- Upcoming meetings booked by the AI
- Campaign launch controls

The AI runs fully autonomously but always flags high-value leads (ICP ≥85, 100+ reviews)
for human approval before sending.

## Webhooks

| Endpoint | Purpose |
|---|---|
| `POST /api/webhooks/email-reply` | Resend/SendGrid inbound reply hook |
| `POST /api/webhooks/calendly` | Calendly booking confirmation |

## Compliance

Registered data processors in Kenya must register with the Data Protection Commissioner:
- **DPC Kenya**: https://dpc.go.ke
- Registration form: https://dpc.go.ke/registration/

Your LeadForge system logs all data processing activities as required by Art. 35.
