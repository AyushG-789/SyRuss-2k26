"""POST /plan endpoint for multimodal journey planning. SPEC.md §10."""
from __future__ import annotations

from fastapi import APIRouter

from app.routing.aware import plan_aware
from app.routing.baseline import plan_baseline
from app.routing.tidy import tidy_rejected
from app.schemas import PlanRequest, PlanResponse

router = APIRouter(tags=["plan"])


@router.post("/plan", response_model=PlanResponse)
def plan_journey(request: PlanRequest) -> PlanResponse:
    """Calculate multimodal route options for a traveller."""
    # baseline = schedule-only (what a normal app shows); aware = uses Pakka Check's live events (A5).
    plan = plan_aware(request.traveller) if request.mode == "aware" else plan_baseline(request.traveller)
    return plan.model_copy(update={"rejected": tidy_rejected(plan.rejected)})
