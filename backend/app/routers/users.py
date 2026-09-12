from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.employee import Employee
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/users", tags=["users"])

# Permission matrix (enforced here, not just hidden in the UI):
#   - superadmin: full control over every account, including other admins
#     and superadmins (but never itself — see the self-deactivation guard
#     below).
#   - admin: can create/edit/deactivate employee-role accounts only. Can't
#     touch an admin/superadmin *target* account at all, and can't set a
#     user's role to anything above employee — "runs the business
#     day-to-day, can't manage other admins."
#   - employee: no access to this router at all (blocked by require_admin).
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


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    return db.query(User).order_by(User.id).all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    _assert_can_assign_role(current_user, payload.role)
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already in use")
    if payload.email and db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
    if payload.employee_id is not None:
        if db.query(User).filter(User.employee_id == payload.employee_id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee is already linked to a user account"
            )
        if not db.get(Employee, payload.employee_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")

    user = User(
        username=payload.username,
        first_name=payload.first_name,
        last_name=payload.last_name,
        display_name=payload.display_name or f"{payload.first_name} {payload.last_name or ''}".strip(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        employee_id=payload.employee_id,
        avatar_color=payload.avatar_color,
        phone_code=payload.phone_code,
        phone=payload.phone,
    )
    db.add(user)
    db.flush()
    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="create",
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
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _assert_can_manage_target(current_user, user.role)

    data = payload.model_dump(exclude_unset=True)
    if "role" in data and data["role"] is not None:
        _assert_can_assign_role(current_user, UserRole(data["role"]))
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
        db, user_id=current_user.id, business_id=None, action="update",
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
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    _assert_can_manage_target(current_user, user.role)
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't deactivate your own account")

    user.is_active = False
    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="delete",
        entity_type="user", entity_id=user.id, description=f"Deactivated user {user.username}",
    )
    db.commit()
