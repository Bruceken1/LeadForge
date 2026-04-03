"""
Executor Agent — Sends real emails and WhatsApp messages via LeadEngine tools.
"""
import os
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from agent.llm import get_fast_llm
from agent.tools.leadengine import (
    send_email_to_lead, send_whatsapp_to_lead,
    update_lead_status, get_campaign_stats,
)

EXECUTOR_SYSTEM = """
You are the Executor Agent for LeadForge. Your ONLY job is to send real emails and WhatsApp
messages by calling the send tools. You do not write, create or invent any content.

SENDER DETAILS — use these exact values for every send:
- sender_email: use the SENDER_EMAIL environment variable value, or "outreach@dime-solutions.co.ke"
- sender_name: use the SENDER_NAME environment variable value, or "Dimes Solutions"

MANDATORY WORKFLOW for each lead (in order):
1. Call send_email_to_lead() with:
   - recipient_email = the lead's email address
   - subject = the EMAIL SUBJECT from the personalizer
   - body = the EMAIL BODY from the personalizer
   - sender_email = (from above)
   - sender_name = (from above)
   Record the Message ID from the response. A Message ID = email was sent. No ID = not sent.

2. If the lead has a phone number, call send_whatsapp_to_lead() with:
   - phone = lead's phone number (with country code)
   - message = the WHATSAPP message from the personalizer
   Record the Message SID. A SID = WhatsApp sent. No SID = not sent.

3. Call update_lead_status(lead_id=<integer>, status="contacted")

4. Call schedule_follow_up(lead_id=<integer>, follow_up_days=3, sequence_step=2)

After ALL leads are done, call get_campaign_stats() then return EXACTLY this report:

=== EXECUTION REPORT ===
Emails sent: X  (list Message IDs)
WhatsApp sent: Y  (list Message SIDs)
Bounced: Z  (list lead names)
Follow-ups scheduled: W
High-value flagged: [names]
Campaign stats: [output of get_campaign_stats]
========================

ANTI-FABRICATION RULES (MANDATORY — never break these):
- NEVER invent, assume, or fabricate any data. Every piece of information must come from a tool response.
- NEVER write the EXECUTION REPORT before calling the send tools for every lead.
- If send_email_to_lead returns an error, report the error exactly. Do not pretend it succeeded.
- A Message ID or SID in the tool response is the ONLY proof of a real send.
- If a lead has no email, skip email and go straight to WhatsApp. Document this.
- If both email and phone are missing, call update_lead_status(status='new', notes='No contact info') and skip.
- NEVER call a send tool twice for the same lead.
- When the EXECUTION REPORT is complete, return it and stop. Do NOT call any handoff or transfer tool.
"""


@tool
def schedule_follow_up(lead_id: int, follow_up_days: int, sequence_step: int) -> str:
    """
    Schedule a follow-up for a lead.
    lead_id: integer from lead results.
    follow_up_days: number of days until follow-up.
    sequence_step: 1=initial, 2=first follow-up, 3=final follow-up.
    """
    from datetime import datetime, timedelta
    try:
        lead_id = int(lead_id)
    except (ValueError, TypeError):
        return f"Invalid lead_id '{lead_id}'."
    if sequence_step > 3:
        return f"Lead {lead_id}: max follow-up sequence reached. No further outreach."
    follow_up_date = datetime.utcnow() + timedelta(days=follow_up_days)
    labels = {1: "initial outreach", 2: "first follow-up", 3: "final follow-up"}
    return (
        f"Follow-up scheduled for lead {lead_id}: "
        f"{labels.get(sequence_step, f'step {sequence_step}')} "
        f"on {follow_up_date.strftime('%A, %d %b %Y')}."
    )


@tool
def switch_channel(lead_id: int, current_channel: str, reason: str) -> str:
    """
    Switch outreach channel when email bounces or phone is unavailable.
    current_channel: 'email' or 'whatsapp'
    """
    try:
        lead_id = int(lead_id)
    except (ValueError, TypeError):
        return f"Invalid lead_id '{lead_id}'."
    alt = "whatsapp" if current_channel.lower() == "email" else "email"
    action = (
        "call send_email_to_lead if email is available"
        if alt == "email"
        else "call send_whatsapp_to_lead if phone is available"
    )
    return f"Channel switch for lead {lead_id}: {current_channel} → {alt}. Reason: {reason}. Next: {action}."


def create_executor_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
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
