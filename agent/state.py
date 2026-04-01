"""
LeadForge Agent — Shared State
"""
from typing import TypedDict, Annotated, Optional, List, Dict, Any
from langgraph.graph.message import add_messages


class LeadData(TypedDict, total=False):
    id:                  Optional[str]
    name:                str
    phone:               Optional[str]
    email:               Optional[str]
    website:             Optional[str]
    address:             Optional[str]
    city:                Optional[str]
    industry:            Optional[str]
    rating:              Optional[float]
    reviews:             Optional[int]
    description:         Optional[str]
    pain_points:         Optional[List[str]]
    decision_maker:      Optional[str]
    tech_stack:          Optional[List[str]]
    recent_news:         Optional[str]
    icp_score:           Optional[int]
    icp_reasons:         Optional[List[str]]
    qualified:           Optional[bool]
    disqualify_reason:   Optional[str]
    email_subject:       Optional[str]
    email_body:          Optional[str]
    whatsapp_body:       Optional[str]
    sequence_step:       Optional[int]
    email_sent:          Optional[bool]
    whatsapp_sent:       Optional[bool]
    message_id:          Optional[str]
    crm_stage:           Optional[str]
    follow_up_at:        Optional[str]


class AgentRunState(TypedDict):
    messages:             Annotated[list, add_messages]
    campaign_goal:        str
    icp:                  Dict[str, Any]
    leads:                List[LeadData]
    current_lead_idx:     int
    qualified_leads:      List[LeadData]
    rejected_leads:       List[LeadData]
    sent_count:           int
    next_agent:           Optional[str]
    human_review_needed:  bool
    error:                Optional[str]
    org_id:               str
    org_name:             str
    run_id:               str
    leadengine_api_url:   str
    leadengine_token:     str
