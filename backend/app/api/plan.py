"""POST /plan endpoint for multimodal journey planning. SPEC.md §10."""
from __future__ import annotations

from fastapi import APIRouter

from app.routing.baseline import plan_baseline
from app.routing.tidy import tidy_rejected
from app.schemas import PlanRequest, PlanResponse

router = APIRouter(tags=["plan"])


@router.post("/plan", response_model=PlanResponse)
def plan_journey(request: PlanRequest) -> PlanResponse:
    """Calculate multimodal route options for a traveller."""
    # Baseline schedule-only routing (Milestone 1).
    # Mode 'aware' will incorporate real-time disruption events in future milestones.
    plan = plan_baseline(request.traveller)
    return plan.model_copy(update={"rejected": tidy_rejected(plan.rejected)})
