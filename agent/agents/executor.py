"""
Executor & Follow-up Agent — Sends outreach and manages the CRM pipeline.
Schedules follow-ups, monitors responses, adapts strategy.
"""
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from agent.llm import get_fast_llm
from agent.tools.leadengine import (
    send_email_to_lead, send_whatsapp_to_lead,
    update_lead_status, get_campaign_stats,
)

EXECUTOR_SYSTEM = """
You are the Executor Agent for LeadForge. You execute the outreach plan
created by the Personalization Agent and manage the follow-up schedule.

Your responsibilities:
1. SEND: Call send_email_to_lead or send_whatsapp_to_lead with the prepared content
2. UPDATE CRM: After sending, call update_lead_status to mark as 'contacted'
3. SCHEDULE FOLLOW-UP: Determine when to follow up (default: 3 business days)
4. MONITOR: Check campaign stats to understand response rates
5. ADAPT: If response rate is below 5%, recommend the supervisor adjust the messaging strategy

Execution rules:
- Always send email first, then WhatsApp (if phone available) 2 hours later
- Do not send to the same lead more than 3 times total (check sequence_step)
- If a lead replies (status = 'replied'), escalate immediately to human review
- If a bounce occurs, update status to 'bounced' and do not retry
- Log every action clearly so the supervisor can track progress

Channel strategy for East Africa:
- WhatsApp has >80% open rate in Kenya/Tanzania — prioritize for SMEs
- Email is better for formal businesses (law firms, healthcare, corporates)
- If both are available, use both (email + WhatsApp within 2 hours)
"""


@tool
def schedule_follow_up(lead_id: int, follow_up_days: int, sequence_step: int) -> str:
    """
    Schedule a follow-up for a lead after a specified number of days.
    sequence_step tracks which message in the sequence to send next (1, 2, 3).
    Returns the scheduled follow-up date.
    """
    from datetime import datetime, timedelta
    follow_up_date = datetime.utcnow() + timedelta(days=follow_up_days)
    return (
        f"Follow-up scheduled for lead {lead_id} on "
        f"{follow_up_date.strftime('%Y-%m-%d')} (step {sequence_step})"
    )


@tool
def check_reply_status(lead_id: int) -> str:
    """
    Check if a lead has replied to any outreach.
    Returns the current status and last outreach details.
    """
    # In production this queries the LeadEngine DB via the API
    # For now it returns a placeholder — replace with actual API call
    return f"Lead {lead_id}: status check requested. Check LeadEngine dashboard for real-time status."


@tool
def switch_channel(lead_id: int, current_channel: str, reason: str) -> str:
    """
    Recommend switching outreach channel for a lead.
    Use when email bounces, no phone, or after 2 failed email attempts.
    current_channel: 'email' or 'whatsapp'
    """
    alt = "whatsapp" if current_channel == "email" else "email"
    return (
        f"Channel switch recommended for lead {lead_id}: "
        f"{current_channel} → {alt}. Reason: {reason}"
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
