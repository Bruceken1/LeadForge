"""
Executor & Follow-up Agent — Sends outreach and manages the CRM pipeline.
"""
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from agent.llm import get_fast_llm
from agent.tools.leadengine import (
    send_email_to_lead, send_whatsapp_to_lead,
    update_lead_status, get_campaign_stats,
)

EXECUTOR_SYSTEM = """
You are the Executor Agent for LeadForge. You send outreach and manage the CRM pipeline.

WORKFLOW for each lead:
1. Determine channel order:
   - SMEs (restaurants, retail, hotels, cafes): WhatsApp FIRST, then email
   - Formal businesses (law firms, healthcare, corporate): Email FIRST, then WhatsApp
2. Call send_email_to_lead or send_whatsapp_to_lead with the personalizer's content.
3. Call update_lead_status with lead_id and status='contacted' after each successful send.
4. Call schedule_follow_up with lead_id to queue the next touch in 3 days.
5. After all sends, call get_campaign_stats() and return the EXECUTION REPORT.

RULES:
- Do not send to the same lead more than 3 times (check sequence_step).
- If send_email returns a bounce error, call update_lead_status with status='bounced' then call switch_channel.
- If a lead status is 'replied', call update_lead_status with status='meeting'.
- Log every action clearly.

Return an EXECUTION REPORT:
=== EXECUTION REPORT ===
Emails sent: X
WhatsApp sent: Y
Bounced: Z
Follow-ups scheduled: W
Campaign stats: [from get_campaign_stats]
========================
"""


@tool
def schedule_follow_up(lead_id: str, follow_up_days: str, sequence_step: str) -> str:
    """
    Schedule a follow-up for a lead after a specified number of days.
    lead_id: the lead's numeric id (pass as string or number, both work).
    follow_up_days: number of business days until follow-up (pass as string or number).
    sequence_step: which step in the sequence — 1=initial, 2=first follow-up, 3=final.
    """
    from datetime import datetime, timedelta
    try:
        step = int(sequence_step)
    except (ValueError, TypeError):
        step = 2

    if step > 3:
        return f"Lead {lead_id}: maximum follow-up sequence reached (step {step}). No further outreach."

    try:
        days = int(follow_up_days)
    except (ValueError, TypeError):
        days = 3

    follow_up_date = datetime.utcnow() + timedelta(days=days)
    day_label = follow_up_date.strftime("%A, %d %b %Y")
    step_labels = {1: "initial outreach", 2: "first follow-up", 3: "final follow-up"}
    return (
        f"Follow-up scheduled for lead {lead_id}: "
        f"{step_labels.get(step, f'step {step}')} on {day_label} ({days} days from now)."
    )


@tool
def check_reply_status(lead_id: str) -> str:
    """
    Check if a lead has replied to any outreach.
    lead_id: the lead's numeric id (pass as string or number, both work).
    """
    return (
        f"Lead {lead_id}: reply status check triggered. "
        f"Call get_leads(status='replied') to see if this lead has responded. "
        f"If found, call update_lead_status with status='meeting'."
    )


@tool
def switch_channel(lead_id: str, current_channel: str, reason: str) -> str:
    """
    Switch the outreach channel for a lead.
    lead_id: the lead's numeric id (pass as string or number, both work).
    current_channel: 'email' or 'whatsapp'.
    reason: why the channel is being switched.
    Use when email bounces or after 2 failed attempts on one channel.
    """
    alt = "whatsapp" if current_channel.lower() == "email" else "email"
    action_map = {
        "whatsapp": "send via send_email_to_lead if email is available",
        "email":    "send via send_whatsapp_to_lead if phone number is available",
    }
    return (
        f"Channel switch for lead {lead_id}: {current_channel} → {alt}. "
        f"Reason: {reason}. "
        f"Next action: {action_map.get(alt, 'verify contact details')}."
    )


def create_executor_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
        tools=[
            send_email_to_lead,
            send_whatsapp_to_lead,
            update_lead_status,
            get_campaign_stats,
            schedule_follow_up,
            check_reply_status,
            switch_channel,
        ],
        name="executor_agent",
        prompt=EXECUTOR_SYSTEM,
    )
