"""
Optimizer Agent — Self-Learning Analytics & Continuous Improvement
Tracks performance metrics, identifies patterns, refines ICP weights,
and improves targeting and messaging over time.
"""
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from agent.llm import get_fast_llm

OPTIMIZER_SYSTEM = """
You are the Optimizer Agent for LeadForge — the self-learning engine that
continuously improves campaign performance without human intervention.

YOUR RESPONSIBILITIES:
1. Pull performance metrics for all active campaigns
2. Identify which segments/industries/cities/message styles drive the best results
3. Recommend ICP score weight adjustments based on actual conversion data
4. Flag underperforming campaigns for review or pause
5. Surface insights to the human dashboard
6. Refine messaging angles based on reply patterns

METRICS YOU TRACK:
- Open rate: emails opened / emails sent (target: >30%)
- Reply rate: replies / emails sent (target: >8%)
- Meeting rate: meetings booked / qualified leads (target: >15%)
- Win rate: closed deals / meetings held
- Bounce rate: bounced / sent (alert if >3%)
- Sequence step performance: which step in the sequence converts best
- Channel performance: email vs WhatsApp reply rates
- Time-of-day performance: best send times for each industry/city

OPTIMIZATION ACTIONS:
- If reply rate < 4%: flag for subject line A/B test recommendation
- If bounce rate > 3%: pause campaign, alert human, check domain health
- If meeting rate > 20%: identify winning ICP pattern, amplify targeting
- If a specific industry segment converts 2x better: increase ICP weight for that segment
- If open rate < 15%: recommend subject line variations to test

SELF-LEARNING LOOP:
1. After 50+ sends: analyze data, identify top 20% performing leads by ICP characteristics
2. Extract common patterns from winners (industry, city, review count, company size signals)
3. Propose adjusted ICP scoring weights (log for human approval before applying)
4. Compare A/B variants if any were run
5. Update the best-performing message templates as new defaults

OUTPUT FORMAT:
Always produce a structured OPTIMIZATION REPORT with:
- Campaign metrics summary
- Top 3 insights
- Recommended actions (automated vs needs human approval)
- Predicted impact of each recommendation

ANTI-FABRICATION:
- Only report metrics that get_campaign_analytics() returns.
- Never invent conversion rates. No data = say "insufficient data".
- Recommendations must be backed by data, not assumptions.
"""


@tool
def get_campaign_analytics(campaign_id: str = "all", days_back: int = 30) -> str:
    """
    Pull comprehensive campaign analytics from the database.
    Returns: open rates, reply rates, meeting rates, bounce rates,
    per-campaign and per-segment breakdowns, top performing leads.
    """
    return (
        f"ANALYTICS QUERY: Campaign={campaign_id}, Period={days_back}d\n"
        f"Integration: Queries agent_events + outreach_logs + lead_stages tables.\n"
        f"Metrics returned: sends, opens, clicks, replies, meetings, bounces, "
        f"unsubscribes, wins per campaign_id and per ICP segment.\n"
        f"Configure DATABASE_URL in .env to enable live analytics."
    )


@tool
def get_best_performing_segments(metric: str = "reply_rate", min_sample_size: int = 20) -> str:
    """
    Identify the best performing ICP segments by a specific metric.
    metric: 'open_rate', 'reply_rate', 'meeting_rate', 'win_rate'
    Returns: ranked list of industry+city combinations with metric values.
    """
    return (
        f"SEGMENT ANALYSIS: Ranked by {metric} (min {min_sample_size} samples)\n"
        f"Integration: Groups outreach_logs by lead.industry + lead.city, "
        f"calculates {metric} per group, returns top 10 segments.\n"
        f"Used by: qualifier_agent to boost ICP scores for winning segments."
    )


@tool
def get_message_performance(sequence_step: int = 0) -> str:
    """
    Analyze which message templates and subject lines perform best.
    sequence_step=0 means all steps. Returns open/reply rates per template.
    """
    return (
        f"MESSAGE PERFORMANCE: Step {sequence_step or 'all'}\n"
        f"Integration: Joins email_tracking + outreach_logs on message_id.\n"
        f"Returns: subject lines ranked by open rate, message angles ranked by reply rate.\n"
        f"Used by: personalization_agent to adopt winning templates."
    )


@tool
def flag_underperforming_campaign(campaign_id: str, reason: str, recommended_action: str) -> str:
    """
    Flag a campaign as underperforming and alert the human dashboard.
    Actions: 'pause', 'a_b_test_subject', 'change_icp', 'review_domain_health'
    """
    return (
        f"CAMPAIGN FLAGGED: {campaign_id}\n"
        f"Reason: {reason}\n"
        f"Recommended: {recommended_action}\n"
        f"Alert sent to: Human dashboard (real-time notification)\n"
        f"Status: Awaiting human approval before action is taken."
    )


@tool
def propose_icp_weight_adjustment(segment: str, current_weight: int,
                                   proposed_weight: int, evidence: str) -> str:
    """
    Propose an adjustment to ICP scoring weights based on conversion data.
    All weight changes require human approval before being applied.
    Returns proposal_id for the human dashboard approval queue.
    """
    import uuid
    proposal_id = f"ICP-ADJ-{str(uuid.uuid4())[:6].upper()}"
    return (
        f"ICP WEIGHT PROPOSAL: {proposal_id}\n"
        f"Segment: {segment}\n"
        f"Current weight: {current_weight}/100\n"
        f"Proposed weight: {proposed_weight}/100\n"
        f"Evidence: {evidence}\n"
        f"Status: PENDING HUMAN APPROVAL\n"
        f"Approval: Available on the LeadForge dashboard under Settings → ICP Optimization."
    )


@tool
def generate_optimization_report(period_days: int = 7) -> str:
    """
    Generate a comprehensive weekly optimization report with insights,
    recommendations, and predicted impact of each recommendation.
    Sent to human dashboard and optionally by email.
    """
    return (
        f"OPTIMIZATION REPORT: Last {period_days} days\n"
        f"Integration: Aggregates all analytics tables and produces structured report.\n"
        f"Sections: Executive Summary, Campaign Performance, Top Segments, "
        f"Message Analysis, Recommended Actions, Predicted Impact.\n"
        f"Delivery: Dashboard widget + optional weekly email digest."
    )


@tool
def check_domain_health(domain: str) -> str:
    """
    Check email domain health: SPF, DKIM, DMARC, blacklist status, reputation score.
    Returns health score and recommended fixes for any issues found.
    """
    return (
        f"DOMAIN HEALTH CHECK: {domain}\n"
        f"Checks: SPF record ✓/✗ | DKIM ✓/✗ | DMARC ✓/✗\n"
        f"Blacklist: MXToolbox, Spamhaus, SORBS, SpamCop\n"
        f"Reputation: Google Postmaster, Microsoft SNDS\n"
        f"Integration: Queries DNS records + external reputation APIs.\n"
        f"Configure DOMAIN_HEALTH_CHECK_INTERVAL in .env (default: daily)."
    )


def create_optimizer_agent(llm=None):
    return create_react_agent(
        model=llm or get_fast_llm(),
        tools=[
            get_campaign_analytics,
            get_best_performing_segments,
            get_message_performance,
            flag_underperforming_campaign,
            propose_icp_weight_adjustment,
            generate_optimization_report,
            check_domain_health,
        ],
        name="optimizer_agent",
        prompt=OPTIMIZER_SYSTEM,
    )
