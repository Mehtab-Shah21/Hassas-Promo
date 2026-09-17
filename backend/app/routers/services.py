from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_active_business_id, require_manager
from app.models.service import Service, ServiceCategory
from app.schemas.service import (
    PaginatedServices,
    ServiceCategoryCreate,
    ServiceCategoryResponse,
    ServiceCategoryUpdate,
    ServiceCreate,
    ServiceResponse,
    ServiceUpdate,
)
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api", tags=["services"])


# --- Categories ---


@router.get("/service-categories", response_model=list[ServiceCategoryResponse])
def list_categories(
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(ServiceCategory)
        .filter(ServiceCategory.business_id == business_id)
        .order_by(ServiceCategory.name)
        .all()
    )


@router.post("/service-categories", response_model=ServiceCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: ServiceCategoryCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    category = ServiceCategory(business_id=business_id, **payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/service-categories/{category_id}", response_model=ServiceCategoryResponse)
def update_category(
    category_id: int,
    payload: ServiceCategoryUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    category = db.get(ServiceCategory, category_id)
    if not category or category.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/service-categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_category(
    category_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    category = db.get(ServiceCategory, category_id)
    if not category or category.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    category.is_active = False
    db.commit()


# --- Services ---


@router.get("/services", response_model=PaginatedServices)
def list_services(
    business_id: int = Depends(require_active_business_id),
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    active_only: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Service).filter(Service.business_id == business_id)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Service.name.ilike(like), Service.code.ilike(like)))
    if category_id is not None:
        q = q.filter(Service.category_id == category_id)
    if active_only:
        q = q.filter(Service.is_active.is_(True))

    total = q.count()
    items = q.order_by(Service.name).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedServices(items=items, total=total, page=page, page_size=page_size)


@router.get("/services/{service_id}", response_model=ServiceResponse)
def get_service(
    service_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service = db.get(Service, service_id)
    if not service or service.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    return service


@router.post("/services", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    service = Service(business_id=business_id, **payload.model_dump())
    db.add(service)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="create",
        entity_type="service", entity_id=service.id, description=f"Created service {service.name}",
    )
    db.commit()
    db.refresh(service)
    return service


@router.patch("/services/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    service = db.get(Service, service_id)
    if not service or service.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="update",
        entity_type="service", entity_id=service.id, description=f"Updated service {service.name}",
    )
    db.commit()
    db.refresh(service)
    return service


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_service(
    service_id: int,
    business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_manager),
):
    service = db.get(Service, service_id)
    if not service or service.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
    service.is_active = False
    write_audit_log(
        db, user_id=current_user.id, business_id=business_id, action="delete",
        entity_type="service", entity_id=service.id, description=f"Deactivated service {service.name}",
    )
    db.commit()
