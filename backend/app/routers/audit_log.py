from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.schemas.audit_log import AuditLogResponse, PaginatedAuditLog
from app.services.csv_export import rows_to_csv_response

router = APIRouter(prefix="/api/audit-log", tags=["audit-log"])


def _build_query(
    db: Session,
    current_user: User,
    search: str | None,
    entity_type: str | None,
    action: str | None,
    date_from: date | None,
    date_to: date | None,
):
    q = db.query(AuditLog)
    if current_user.role != UserRole.superadmin:
        # A company admin must never see the other company's audit trail
        # (invoice numbers, customer names, etc. leak through descriptions)
        # — global entries (business_id NULL: superadmin-only actions like
        # cross-company user management or backups) are likewise not
        # theirs to see.
        q = q.filter(AuditLog.business_id == current_user.business_id)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if action:
        q = q.filter(AuditLog.action == action)
    if date_from:
        q = q.filter(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    if search:
        like = f"%{search}%"
        q = q.filter(AuditLog.description.ilike(like))
    return q


@router.get("", response_model=PaginatedAuditLog)
def list_audit_log(
    search: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    q = _build_query(db, current_user, search, entity_type, action, date_from, date_to)
    total = q.count()
    entries = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    user_names = {u.id: (u.display_name or u.username) for u in db.query(User).all()}
    items = [
        AuditLogResponse(
            id=e.id,
            created_at=e.created_at,
            business_id=e.business_id,
            user_id=e.user_id,
            user_name=user_names.get(e.user_id) if e.user_id else None,
            action=e.action,
            entity_type=e.entity_type,
            entity_id=e.entity_id,
            description=e.description,
            source_ip=e.source_ip,
        )
        for e in entries
    ]
    return PaginatedAuditLog(items=items, total=total, page=page, page_size=page_size)


@router.get("/export")
def export_audit_log(
    search: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    q = _build_query(db, current_user, search, entity_type, action, date_from, date_to)
    entries = q.order_by(AuditLog.created_at.desc()).limit(5000).all()
    user_names = {u.id: (u.display_name or u.username) for u in db.query(User).all()}
    rows = [
        {
            "created_at": e.created_at.isoformat(),
            "user": user_names.get(e.user_id, "") if e.user_id else "",
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id or "",
            "description": e.description or "",
            "source_ip": e.source_ip or "",
        }
        for e in entries
    ]
    return rows_to_csv_response(
        "audit_log.csv", ["created_at", "user", "action", "entity_type", "entity_id", "description", "source_ip"], rows
    )
