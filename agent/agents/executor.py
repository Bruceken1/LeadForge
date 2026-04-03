"""
Executor Agent — Sends real emails and WhatsApp messages via LeadEngine tools.
"""
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from agent.llm import get_smart_llm
from agent.tools.leadengine import (
    send_email_to_lead, send_whatsapp_to_lead,
    update_lead_status, get_campaign_stats,
)

EXECUTOR_SYSTEM = """\
You are the Executor Agent. You MUST call send_email_to_lead and send_whatsapp_to_lead
for every lead. Do not write a report until you have called the send tools.

SENDER DETAILS (use for every send):
- sender_email: use SENDER_EMAIL env var or "outreach@dime-solutions.co.ke"
- sender_name: use SENDER_NAME env var or "Dimes Solutions"

FOR EACH LEAD — call these tools in order:

1. send_email_to_lead(
     recipient_email=<lead email>,
     subject=<EMAIL_SUBJECT from personalizer>,
     body=<EMAIL_BODY from personalizer>,
     sender_email=<sender_email above>,
     sender_name=<sender_name above>
   )
   → note the Message ID returned

2. send_whatsapp_to_lead(
     phone=<lead phone with country code>,
     message=<WHATSAPP from personalizer>
   )
   → note the SID returned

3. update_lead_status(lead_id=<id>, status="contacted")

4. schedule_follow_up(lead_id=<id>, follow_up_days="3", sequence_step="2")

After ALL leads: call get_campaign_stats() then return:

=== EXECUTION REPORT ===
Emails sent: X (Message IDs: ...)
WhatsApp sent: Y (SIDs: ...)
Bounced: Z
Follow-ups scheduled: W
Campaign stats: [from get_campaign_stats]
========================

RULES:
- Call send_email_to_lead FIRST before writing anything.
- A Message ID = email sent. No ID = not sent. Never fabricate IDs.
- If email bounces, call update_lead_status with status="bounced" then try WhatsApp.
- HIGH_VALUE leads: send normally, note them in the report. Do not pause or restart.
- Return the report and stop. Do not call any transfer tool after the report.
"""


@tool
def schedule_follow_up(lead_id: str, follow_up_days: str, sequence_step: str) -> str:
    """
    Schedule a follow-up. lead_id, follow_up_days, sequence_step all accept strings or numbers.
    """
    from datetime import datetime, timedelta
    try:
        lid = int(lead_id)
        days = int(follow_up_days)
        step = int(sequence_step)
    except (ValueError, TypeError):
        return f"Invalid params: lead_id={lead_id}, days={follow_up_days}, step={sequence_step}"
    if step > 3:
        return f"Lead {lid}: max follow-up sequence reached."
    date = datetime.utcnow() + timedelta(days=days)
    labels = {1: "initial", 2: "first follow-up", 3: "final follow-up"}
    return f"Follow-up scheduled for lead {lid}: {labels.get(step, f'step {step}')} on {date.strftime('%d %b %Y')}."


@tool
def switch_channel(lead_id: str, current_channel: str, reason: str) -> str:
    """Switch outreach channel. current_channel: 'email' or 'whatsapp'."""
    alt = "whatsapp" if current_channel.lower() == "email" else "email"
    return f"Channel switch for lead {lead_id}: {current_channel} → {alt}. Reason: {reason}."


def create_executor_agent(llm=None):
    return create_react_agent(
        model=llm or get_smart_llm(),
        tools=[
            send_email_to_lead,
            send_whatsapp_to_lead,
            update_lead_status,
            get_campaign_stats,
            schedule_follow_up,
            switch_channel,
        ],
        name="executor_agent",
        prompt=EXECUTOR_SYSTEM,
    )
