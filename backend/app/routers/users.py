from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.business import Business
from app.models.employee import Employee
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/users", tags=["users"])

# Permission matrix (enforced here, not just hidden in the UI):
#   - superadmin: full control over every account, including other admins
#     and superadmins (but never itself — see the self-deactivation guard
#     below). Not tied to a company; can create/edit a user in EITHER
#     company by specifying business_id.
#   - admin: can create/edit/deactivate employee-role accounts only, and
#     only within their OWN company (current_user.business_id) — they can
#     never see, target, or assign a user into the other company. Can't
#     touch an admin/superadmin *target* account at all, and can't set a
#     user's role to anything above employee — "runs the business
#     day-to-day, can't manage other admins."
#   - employee: no access to this router at all (blocked by require_admin).
#
# A target user in a different company than current_user's is treated as
# not found (404), not forbidden (403) — a company admin should not be able
# to distinguish "doesn't exist" from "exists in the other company" per the
# isolation requirement that they not even know the other company exists.
ELEVATED_ROLES = (UserRole.admin, UserRole.superadmin)


def _assert_can_manage_target(current_user: User, target_role: UserRole) -> None:
    if current_user.role == UserRole.superadmin:
        return
    if target_role in ELEVATED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can manage admin or superadmin accounts",
        )


def _assert_can_assign_role(current_user: User, role: UserRole) -> None:
    if current_user.role == UserRole.superadmin:
        return
    if role in ELEVATED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can grant admin or superadmin access",
        )


def _get_in_scope_user(db: Session, current_user: User, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user or (current_user.role != UserRole.superadmin and user.business_id != current_user.business_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    q = db.query(User)
    if current_user.role != UserRole.superadmin:
        q = q.filter(User.business_id == current_user.business_id)
    return q.order_by(User.id).all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    _assert_can_assign_role(current_user, payload.role)

    if current_user.role == UserRole.superadmin:
        if payload.role == UserRole.superadmin:
            target_business_id = None
        else:
            if payload.business_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="business_id is required for admin/employee accounts",
                )
            if not db.get(Business, payload.business_id):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Business not found")
            target_business_id = payload.business_id
    else:
        # A plain admin can only ever create accounts in their own
        # company — any business_id sent by the client is ignored, never
        # trusted, matching require_active_business_id's own rule.
        target_business_id = current_user.business_id

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already in use")
    if payload.email and db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
    if payload.employee_id is not None:
        if db.query(User).filter(User.employee_id == payload.employee_id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee is already linked to a user account"
            )
        employee = db.get(Employee, payload.employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")
        if target_business_id is not None and employee.business_id != target_business_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee belongs to a different company"
            )

    user = User(
        username=payload.username,
        first_name=payload.first_name,
        last_name=payload.last_name,
        display_name=payload.display_name or f"{payload.first_name} {payload.last_name or ''}".strip(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        employee_id=payload.employee_id,
        business_id=target_business_id,
        avatar_color=payload.avatar_color,
        phone_code=payload.phone_code,
        phone=payload.phone,
    )
    db.add(user)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=target_business_id, action="create",
        entity_type="user", entity_id=user.id,
        description=f"Created user {user.username} ({user.role.value})",
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    user = _get_in_scope_user(db, current_user, user_id)
    _assert_can_manage_target(current_user, user.role)

    data = payload.model_dump(exclude_unset=True)
    if "role" in data and data["role"] is not None:
        _assert_can_assign_role(current_user, UserRole(data["role"]))
    if "business_id" in data and current_user.role != UserRole.superadmin:
        # A plain admin can never move a user between companies (or see
        # the concept of "another company" at all) — drop the field
        # silently rather than trusting it, same as on create.
        data.pop("business_id")
    if "business_id" in data and data["business_id"] is not None and not db.get(Business, data["business_id"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Business not found")
    if data.get("is_active") is False and user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't deactivate your own account")
    if "username" in data and data["username"] != user.username:
        if db.query(User).filter(User.username == data["username"], User.id != user_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already in use")
    if data.get("email") and data["email"] != user.email:
        if db.query(User).filter(User.email == data["email"], User.id != user_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
    if "employee_id" in data and data["employee_id"] is not None and data["employee_id"] != user.employee_id:
        if db.query(User).filter(User.employee_id == data["employee_id"], User.id != user_id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee is already linked to a user account"
            )
        employee = db.get(Employee, data["employee_id"])
        effective_business_id = data.get("business_id", user.business_id)
        if employee and effective_business_id is not None and employee.business_id != effective_business_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee belongs to a different company"
            )

    # Promoting to superadmin always clears the company (they span both);
    # demoting a superadmin to admin/employee requires a company be given.
    new_role = UserRole(data["role"]) if "role" in data and data["role"] is not None else user.role
    if new_role == UserRole.superadmin:
        data["business_id"] = None
    elif user.role == UserRole.superadmin and "role" in data and data.get("business_id") is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="business_id is required when demoting a superadmin to admin/employee",
        )

    role_changed = "role" in data and data["role"] != user.role
    password = data.pop("password", None)
    if password:
        user.password_hash = hash_password(password)
    for field, value in data.items():
        setattr(user, field, value)
    if role_changed:
        description = f"Changed {user.username}'s role to {user.role.value}"
    elif password:
        description = f"Reset password for user {user.username}"
    else:
        description = f"Updated user {user.username}"
    write_audit_log(
        db, user_id=current_user.id, business_id=user.business_id, action="update",
        entity_type="user", entity_id=user.id, description=description,
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    user = _get_in_scope_user(db, current_user, user_id)
    _assert_can_manage_target(current_user, user.role)
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't deactivate your own account")

    user.is_active = False
    write_audit_log(
        db, user_id=current_user.id, business_id=user.business_id, action="delete",
        entity_type="user", entity_id=user.id, description=f"Deactivated user {user.username}",
    )
    db.commit()
