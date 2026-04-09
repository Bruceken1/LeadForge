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
You are the Executor Agent for LeadForge. You ACTUALLY SEND emails and WhatsApp messages by calling tools.

CRITICAL RULES:
- You MUST call send_email_to_lead() and send_whatsapp_to_lead() for EVERY lead.
- NEVER write a report without first calling the send tools.
- If you do not call the tools, nothing gets sent. The tools are the only way to send.

SENDER DETAILS (use these exact values):
- sender_email: use the SENDER_EMAIL env var, or "outreach@dime-solutions.co.ke" as fallback
- sender_name: use the SENDER_NAME env var, or "Dimes Solutions" as fallback

STEP BY STEP for each lead:
1. Extract from the personalizer output: lead name, email, phone, subject, body, whatsapp message.
2. Call send_email_to_lead(
       recipient_email=<their email>,
       subject=<email subject from personalizer>,
       body=<email body from personalizer>,
       sender_email="outreach@dime-solutions.co.ke",
       sender_name="Dimes Solutions"
   )
3. If they have a phone number, call send_whatsapp_to_lead(
       phone=<their phone with country code>,
       message=<whatsapp message from personalizer>
   )
4. Call update_lead_status(lead_id=<their id>, status="contacted")
5. Call schedule_follow_up(lead_id=<their id>, follow_up_days=3, sequence_step=2)

After ALL leads are processed, call get_campaign_stats() then return:

=== EXECUTION REPORT ===
Emails sent: X
WhatsApp messages sent: Y
Bounced: Z
Follow-ups scheduled: W
High-value leads paused for review: [names if any]
Campaign stats: [output from get_campaign_stats]
========================

IMPORTANT: The execution report must only be written AFTER you have called the send tools.
If send_email_to_lead returns a Message ID, the email was sent. Include those IDs in your log.

ANTI-FABRICATION RULES (MANDATORY — never break these):
- NEVER invent, assume, or fabricate any data. Every piece of information you use must come from a tool call result.
- NEVER write a summary, report, or status update before calling the required tools.
- If a tool returns an error, report the error exactly. Do not pretend it succeeded.
- If you do not have a required piece of data (e.g. email address, lead_id), call the appropriate tool to get it. Do not guess.
- A Message ID or SID in the tool response is proof of a real action. No ID = nothing happened.
- If you cannot complete a step because data is missing, say exactly what is missing and stop. Do not fabricate a workaround.
"""


@tool
def schedule_follow_up(lead_id: int, follow_up_days: int, sequence_step: int) -> str:
    """
    Schedule a follow-up for a lead after a specified number of days.
    sequence_step tracks which message in the sequence to send next (1=first, 2=follow-up, 3=final).
    Returns the scheduled follow-up date and step details.
    """
    from datetime import datetime, timedelta
    if sequence_step > 3:
        return f"Lead {lead_id}: maximum follow-up sequence reached (step {sequence_step}). No further outreach."
    follow_up_date = datetime.utcnow() + timedelta(days=follow_up_days)
    day_label = follow_up_date.strftime("%A, %d %b %Y")
    step_labels = {1: "initial outreach", 2: "first follow-up", 3: "final follow-up"}
    step_desc = step_labels.get(sequence_step, f"step {sequence_step}")
    return (
        f"Follow-up scheduled for lead {lead_id}: "
        f"{step_desc} on {day_label} ({follow_up_days} business days from now)."
    )


@tool
def check_reply_status(lead_id: int) -> str:
    """
    Check if a lead has replied to any outreach.
    Returns the current status and recommended next action.
    In production this queries the LeadEngine DB — currently returns a check reminder.
    """
    return (
        f"Lead {lead_id}: reply status check triggered. "
        f"Check the LeadEngine dashboard or call get_leads(status='replied') "
        f"to see if this lead has responded. If status='replied', escalate to human review."
    )


@tool
def switch_channel(lead_id: int, current_channel: str, reason: str) -> str:
    """
    Switch the outreach channel for a lead.
    Use when: email bounces, phone unavailable, or 2+ failed email attempts.
    current_channel: 'email' or 'whatsapp'
    Returns the recommended alternative channel and action.
    """
    alt = "whatsapp" if current_channel.lower() == "email" else "email"
    action_map = {
        "whatsapp": "send via send_email_to_lead if email is available",
        "email": "send via send_whatsapp_to_lead if phone number is available",
    }
    action = action_map.get(alt, "verify contact details in LeadEngine")
    return (
        f"Channel switch for lead {lead_id}: {current_channel} → {alt}. "
        f"Reason: {reason}. "
        f"Next action: {action}."
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
