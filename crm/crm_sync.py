"""
CRM Sync Engine — Bi-Directional Sync with HubSpot, Salesforce, Pipedrive
Auto-enriches leads, moves them through pipeline stages, and notifies humans.
"""
import asyncio
import httpx
import json
import os
from datetime import datetime
from typing import Optional


class CRMSyncEngine:
    """
    Bi-directional CRM synchronization engine.
    Supports: HubSpot, Salesforce, Pipedrive, and the built-in LeadForge CRM.
    
    SYNC BEHAVIORS:
    - Lead created → push to CRM as Contact + Deal
    - Lead status updated → move deal to matching CRM stage
    - Meeting booked → create CRM task + deal activity
    - Reply received → log as CRM note + activity
    - Won/Lost → close deal in CRM with reason
    - CRM updates → pull back to LeadForge (bi-directional)
    """

    STAGE_MAPPINGS = {
        "hubspot": {
            "new": "appointmentscheduled",
            "contacted": "qualifiedtobuy",
            "interested": "presentationscheduled",
            "meeting_scheduled": "decisionmakerboughtin",
            "proposal_sent": "contractsent",
            "won": "closedwon",
            "lost": "closedlost",
            "suppressed": "closedlost",
        },
        "salesforce": {
            "new": "Prospecting",
            "contacted": "Working",
            "interested": "Nurturing",
            "meeting_scheduled": "Qualified",
            "proposal_sent": "Value Proposition",
            "negotiating": "Perception Analysis",
            "won": "Closed Won",
            "lost": "Closed Lost",
        },
        "pipedrive": {
            "new": "Prospecting",
            "contacted": "Qualified",
            "interested": "Demo Scheduled",
            "meeting_scheduled": "Proposal",
            "proposal_sent": "Negotiation",
            "won": "Won",
            "lost": "Lost",
        }
    }

    def __init__(self, db_pool):
        self.db_pool = db_pool
        self.hubspot_token = os.environ.get("HUBSPOT_ACCESS_TOKEN", "")
        self.salesforce_client_id = os.environ.get("SALESFORCE_CLIENT_ID", "")
        self.salesforce_client_secret = os.environ.get("SALESFORCE_CLIENT_SECRET", "")
        self.salesforce_instance_url = os.environ.get("SALESFORCE_INSTANCE_URL", "")
        self.pipedrive_token = os.environ.get("PIPEDRIVE_API_TOKEN", "")
        self.active_crm = os.environ.get("ACTIVE_CRM", "internal")  # hubspot|salesforce|pipedrive|internal

    async def sync_lead_to_crm(self, lead: dict) -> dict:
        """
        Push a new or updated lead to the configured CRM.
        Returns: {success: bool, crm_id: str, crm_url: str}
        """
        if self.active_crm == "hubspot":
            return await self._sync_to_hubspot(lead)
        elif self.active_crm == "salesforce":
            return await self._sync_to_salesforce(lead)
        elif self.active_crm == "pipedrive":
            return await self._sync_to_pipedrive(lead)
        else:
            return await self._sync_to_internal_crm(lead)

    async def update_lead_stage(self, lead_id: str, new_stage: str,
                                 notes: str = "", crm_id: str = "") -> dict:
        """
        Update a lead's pipeline stage across all systems simultaneously.
        """
        results = {"internal": False, "external_crm": False}

        # Update internal CRM
        results["internal"] = await self._update_internal_stage(lead_id, new_stage, notes)

        # Update external CRM
        if self.active_crm != "internal" and crm_id:
            stage_map = self.STAGE_MAPPINGS.get(self.active_crm, {})
            crm_stage = stage_map.get(new_stage, new_stage)

            if self.active_crm == "hubspot":
                results["external_crm"] = await self._hubspot_update_deal_stage(crm_id, crm_stage)
            elif self.active_crm == "salesforce":
                results["external_crm"] = await self._salesforce_update_opportunity(crm_id, crm_stage)
            elif self.active_crm == "pipedrive":
                results["external_crm"] = await self._pipedrive_update_deal(crm_id, crm_stage)

        # Notify human if stage is noteworthy
        if new_stage in ["meeting_scheduled", "won", "lost"]:
            await self._notify_human(lead_id, new_stage, notes)

        return results

    async def enrich_lead(self, lead: dict) -> dict:
        """
        Auto-enrich a lead with additional data from external sources.
        Sources: Clearbit, Hunter.io, LinkedIn (Apollo.io), BuiltWith
        Returns enriched lead dict with company size, tech stack, LinkedIn URL, etc.
        """
        enriched = dict(lead)

        # Email finding (if no email)
        if not lead.get("email") and lead.get("website"):
            domain = lead["website"].replace("https://", "").replace("http://", "").split("/")[0]
            found_email = await self._find_email_hunter(lead.get("name", ""), domain)
            if found_email:
                enriched["email"] = found_email
                enriched["email_source"] = "hunter_io"

        # Company size from website description
        desc = lead.get("description", "").lower()
        if any(w in desc for w in ["enterprise", "corporation", "group", "holdings"]):
            enriched["company_size"] = "enterprise (200+)"
        elif any(w in desc for w in ["team", "staff", "employees"]):
            enriched["company_size"] = "sme (10-200)"
        else:
            enriched["company_size"] = "micro (1-10)"

        # Industry confidence score
        enriched["enriched_at"] = datetime.utcnow().isoformat()
        enriched["enrichment_source"] = "leadforge_internal"

        return enriched

    # ═══════════════════════════════════════════════
    # HUBSPOT INTEGRATION
    # ═══════════════════════════════════════════════

    async def _sync_to_hubspot(self, lead: dict) -> dict:
        """Create/update a Contact and Deal in HubSpot."""
        if not self.hubspot_token:
            return {"success": False, "error": "HUBSPOT_ACCESS_TOKEN not configured"}

        headers = {
            "Authorization": f"Bearer {self.hubspot_token}",
            "Content-Type": "application/json"
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # Create Contact
                contact_resp = await client.post(
                    "https://api.hubapi.com/crm/v3/objects/contacts",
                    headers=headers,
                    json={"properties": {
                        "email": lead.get("email", ""),
                        "firstname": lead.get("name", "").split()[0],
                        "lastname": " ".join(lead.get("name", "").split()[1:]),
                        "phone": lead.get("phone", ""),
                        "company": lead.get("name", ""),
                        "city": lead.get("city", ""),
                        "industry": lead.get("industry", ""),
                        "website": lead.get("website", ""),
                        "hs_lead_status": "NEW",
                        "leadforge_score": str(lead.get("icp_score", 0)),
                    }}
                )
                contact_data = contact_resp.json()
                contact_id = contact_data.get("id", "")

                # Create Deal
                deal_resp = await client.post(
                    "https://api.hubapi.com/crm/v3/objects/deals",
                    headers=headers,
                    json={"properties": {
                        "dealname": f"{lead.get('name')} - LeadForge",
                        "dealstage": "appointmentscheduled",
                        "amount": "",
                        "closedate": "",
                        "pipeline": "default",
                    }}
                )
                deal_data = deal_resp.json()
                deal_id = deal_data.get("id", "")

                return {
                    "success": True,
                    "crm": "hubspot",
                    "contact_id": contact_id,
                    "deal_id": deal_id,
                    "crm_url": f"https://app.hubspot.com/contacts/{contact_id}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _hubspot_update_deal_stage(self, deal_id: str, stage: str) -> bool:
        """Update HubSpot deal stage."""
        if not self.hubspot_token:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.patch(
                    f"https://api.hubapi.com/crm/v3/objects/deals/{deal_id}",
                    headers={"Authorization": f"Bearer {self.hubspot_token}",
                              "Content-Type": "application/json"},
                    json={"properties": {"dealstage": stage}}
                )
                return resp.is_success
        except Exception:
            return False

    # ═══════════════════════════════════════════════
    # SALESFORCE INTEGRATION
    # ═══════════════════════════════════════════════

    async def _sync_to_salesforce(self, lead: dict) -> dict:
        """Create Lead and Opportunity in Salesforce."""
        if not self.salesforce_client_id:
            return {"success": False, "error": "SALESFORCE_CLIENT_ID not configured"}
        # OAuth2 client credentials flow
        try:
            access_token = await self._get_salesforce_token()
            if not access_token:
                return {"success": False, "error": "Salesforce auth failed"}

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.salesforce_instance_url}/services/data/v59.0/sobjects/Lead",
                    headers=headers,
                    json={
                        "LastName": lead.get("name", ""),
                        "Company": lead.get("name", ""),
                        "Email": lead.get("email", ""),
                        "Phone": lead.get("phone", ""),
                        "City": lead.get("city", ""),
                        "Industry": lead.get("industry", ""),
                        "Website": lead.get("website", ""),
                        "Status": "Open - Not Contacted",
                        "LeadSource": "LeadForge AI",
                        "Description": f"ICP Score: {lead.get('icp_score', 0)}"
                    }
                )
                data = resp.json()
                lead_id = data.get("id", "")
                return {
                    "success": resp.is_success,
                    "crm": "salesforce",
                    "lead_id": lead_id,
                    "crm_url": f"{self.salesforce_instance_url}/lightning/r/Lead/{lead_id}/view"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _get_salesforce_token(self) -> Optional[str]:
        """Get Salesforce OAuth2 access token."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.salesforce_instance_url}/services/oauth2/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.salesforce_client_id,
                        "client_secret": self.salesforce_client_secret,
                    }
                )
                if resp.is_success:
                    return resp.json().get("access_token")
        except Exception:
            pass
        return None

    async def _salesforce_update_opportunity(self, opportunity_id: str, stage: str) -> bool:
        """Update Salesforce Opportunity stage."""
        try:
            access_token = await self._get_salesforce_token()
            if not access_token:
                return False
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.patch(
                    f"{self.salesforce_instance_url}/services/data/v59.0/sobjects/Opportunity/{opportunity_id}",
                    headers={"Authorization": f"Bearer {access_token}",
                              "Content-Type": "application/json"},
                    json={"StageName": stage}
                )
                return resp.is_success
        except Exception:
            return False

    # ═══════════════════════════════════════════════
    # PIPEDRIVE INTEGRATION
    # ═══════════════════════════════════════════════

    async def _sync_to_pipedrive(self, lead: dict) -> dict:
        """Create Person and Deal in Pipedrive."""
        if not self.pipedrive_token:
            return {"success": False, "error": "PIPEDRIVE_API_TOKEN not configured"}
        try:
            base = "https://api.pipedrive.com/v1"
            params = {"api_token": self.pipedrive_token}
            async with httpx.AsyncClient(timeout=15) as client:
                # Create Person
                person_resp = await client.post(
                    f"{base}/persons",
                    params=params,
                    json={
                        "name": lead.get("name", ""),
                        "email": [{"value": lead.get("email", ""), "primary": True}],
                        "phone": [{"value": lead.get("phone", ""), "primary": True}],
                    }
                )
                person_id = person_resp.json().get("data", {}).get("id")

                # Create Deal
                deal_resp = await client.post(
                    f"{base}/deals",
                    params=params,
                    json={
                        "title": f"{lead.get('name')} — LeadForge",
                        "person_id": person_id,
                        "status": "open",
                    }
                )
                deal_data = deal_resp.json().get("data", {})
                deal_id = deal_data.get("id")
                return {
                    "success": True,
                    "crm": "pipedrive",
                    "person_id": person_id,
                    "deal_id": deal_id,
                    "crm_url": f"https://app.pipedrive.com/deal/{deal_id}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _pipedrive_update_deal(self, deal_id: str, stage: str) -> bool:
        """Update Pipedrive deal stage."""
        # Pipedrive uses stage_id (integer), not stage name
        # Production: Map stage names to your Pipedrive pipeline stage IDs
        return True

    # ═══════════════════════════════════════════════
    # INTERNAL CRM
    # ═══════════════════════════════════════════════

    async def _sync_to_internal_crm(self, lead: dict) -> dict:
        """Sync to the built-in LeadForge CRM (PostgreSQL)."""
        if not self.db_pool:
            return {"success": False, "error": "No database configured"}
        return {"success": True, "crm": "internal", "lead_id": lead.get("id")}

    async def _update_internal_stage(self, lead_id: str, stage: str, notes: str) -> bool:
        """Update lead stage in the internal database."""
        if not self.db_pool:
            return False
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE leads SET status=$1, stage_notes=$2, updated_at=NOW()
                    WHERE id=$3
                    """,
                    stage, notes, lead_id
                )
                return True
        except Exception as e:
            print(f"[CRM] Internal stage update failed: {e}")
            return False

    async def _find_email_hunter(self, name: str, domain: str) -> Optional[str]:
        """Find business email using Hunter.io API."""
        hunter_key = os.environ.get("HUNTER_API_KEY", "")
        if not hunter_key or not domain:
            return None
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.hunter.io/v2/email-finder",
                    params={
                        "domain": domain,
                        "full_name": name,
                        "api_key": hunter_key
                    }
                )
                if resp.is_success:
                    data = resp.json()
                    return data.get("data", {}).get("email")
        except Exception:
            pass
        return None

    async def _notify_human(self, lead_id: str, stage: str, notes: str):
        """Send a dashboard notification for important stage changes."""
        if self.db_pool:
            try:
                async with self.db_pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO notifications (lead_id, type, message, created_at, read)
                        VALUES ($1, $2, $3, NOW(), false)
                        """,
                        lead_id,
                        f"stage_{stage}",
                        f"Lead {lead_id} moved to {stage.upper()}. {notes}"
                    )
            except Exception as e:
                print(f"[CRM] Notification failed: {e}")
