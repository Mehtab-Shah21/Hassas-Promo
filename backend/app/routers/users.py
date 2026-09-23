from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_active_business_id, require_admin
from app.core.security import hash_password
from app.models.employee import Employee
from app.models.user import User, UserRole
from app.schemas.user import PasswordReset, UserCreate, UserResponse, UserUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/users", tags=["users"])

# Permission matrix (enforced here, not just hidden in the UI):
#   - system owner (User.is_system_owner — the software vendor's account):
#     full control over every account, and the only one that can create a
#     superadmin, edit/deactivate one, or reset a superadmin's password. It is
#     how the vendor sets up the client's first superadmin, and recovers it if
#     the client forgets that password.
#   - superadmin: manages admin and employee accounts across every company,
#     including resetting their passwords. Can't create, touch or reset
#     another superadmin, and can't see the system owner at all. Not tied to a
#     company; creates/edits a user in whichever company is currently active
#     (X-Business-Id) — there is no separate "assign to company X" field.
#   - admin: can create/edit/deactivate manager- and employee-role accounts,
#     and only within their OWN company (current_user.business_id) — they can
#     never see, target, or assign a user into the other company. Can't
#     touch an admin/superadmin *target* account at all, and can't set a
#     user's role to admin or above.
#   - manager: no access to this router at all (blocked by require_admin) —
#     manager is an operational role (see core/deps.MANAGER_ROLES), not an
#     account-administration one. Can't change anyone else's password, and
#     can't change their own here either (routers/auth.py).
#   - employee: same as manager — no access to this router, and can't change
#     their own password either (routers/auth.py).
#
# Nobody manages their own account here — own password changes go through
# /api/auth/change-password, which checks the current password.
#
# A target the caller may not see — a user in another company, or the system
# owner — is treated as not found (404), not forbidden (403), so its existence
# isn't disclosed.
ELEVATED_ROLES = (UserRole.admin, UserRole.superadmin)


def _assert_can_manage_target(current_user: User, target_role: UserRole) -> None:
    if current_user.is_system_owner:
        return
    if current_user.role == UserRole.superadmin:
        if target_role == UserRole.superadmin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the system owner can manage superadmin accounts",
            )
        return
    if target_role in ELEVATED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can manage admin or superadmin accounts",
        )


def _assert_can_assign_role(current_user: User, role: UserRole) -> None:
    if current_user.is_system_owner:
        return
    if role == UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the system owner can grant superadmin access",
        )
    if current_user.role == UserRole.superadmin:
        return
    if role in ELEVATED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can grant admin access",
        )


def _get_in_scope_user(db: Session, current_user: User, user_id: int) -> User:
    user = db.get(User, user_id)
    hidden_owner = user is not None and user.is_system_owner and not current_user.is_system_owner
    other_company = (
        user is not None
        and current_user.role != UserRole.superadmin
        and user.business_id != current_user.business_id
    )
    if not user or hidden_owner or other_company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    q = db.query(User)
    if not current_user.is_system_owner:
        q = q.filter(User.is_system_owner.is_(False))
    if current_user.role != UserRole.superadmin:
        q = q.filter(User.business_id == current_user.business_id)
    return q.order_by(User.id).all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    active_business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    _assert_can_assign_role(current_user, payload.role)

    # The account's company is always wherever the caller currently has
    # active (never a client-supplied business_id) — a superadmin creating
    # a company-scoped account must first switch the business switcher to
    # that company, exactly like adding a customer or service. A superadmin
    # account itself spans every company, so it gets none.
    target_business_id = None if payload.role == UserRole.superadmin else active_business_id

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already in use")
    if payload.email and db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    # Staff records are created in Employees, never here -- this module
    # administers logins only. All this does is optionally point the new
    # login at a person who already exists.
    employee_id = payload.employee_id
    if employee_id is not None:
        if db.query(User).filter(User.employee_id == employee_id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee is already linked to a user account"
            )
        employee = db.get(Employee, employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")
        if target_business_id is not None and employee.business_id != target_business_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="That employee belongs to a different company"
            )

    # No name is asked for: it's the linked staff member's name, or the
    # username for a login with no staff record (an admin-only account).
    linked_employee = db.get(Employee, employee_id) if employee_id is not None else None
    person_name = (linked_employee.name if linked_employee else None) or payload.username
    first_name = payload.first_name or person_name

    user = User(
        username=payload.username,
        first_name=first_name,
        last_name=payload.last_name,
        display_name=payload.display_name or (
            f"{first_name} {payload.last_name}".strip() if payload.first_name else person_name
        ),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        employee_id=employee_id,
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
    active_business_id: int = Depends(require_active_business_id),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    user = _get_in_scope_user(db, current_user, user_id)
    _assert_can_manage_target(current_user, user.role)

    data = payload.model_dump(exclude_unset=True)
    if data.get("password") and user.id == current_user.id:
        # Setting your own password here would skip the current-password check.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Change your own password from Settings > Security",
        )
    if user.is_system_owner and "role" in data and data["role"] not in (None, UserRole.superadmin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The system owner must stay a superadmin")
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

    # Promoting to superadmin always clears the company (they span both);
    # demoting a superadmin to admin/employee assigns whichever company the
    # caller currently has active — there's no business_id field to pass
    # in, so "demote this superadmin into IIM" means switching the business
    # switcher to IIM first, same as every other business-scoped action.
    new_role = UserRole(data["role"]) if "role" in data and data["role"] is not None else user.role
    role_changed = "role" in data and data["role"] != user.role
    if new_role == UserRole.superadmin:
        data["business_id"] = None
    elif user.role == UserRole.superadmin and role_changed:
        data["business_id"] = active_business_id

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
    password = data.pop("password", None)
    if password:
        user.password_hash = hash_password(password)
    for field, value in data.items():
        setattr(user, field, value)

    # A login's displayed name follows who it belongs to: linking (or
    # re-linking) a staff record adopts that person's name, unlinking falls
    # back to the username. Only when the caller didn't set a name explicitly.
    name_given = any(k in data for k in ("first_name", "last_name", "display_name"))
    if not name_given and ("employee_id" in data or "username" in data):
        linked = db.get(Employee, user.employee_id) if user.employee_id is not None else None
        person_name = linked.name if linked else user.username
        user.first_name = person_name
        user.last_name = None
        user.display_name = person_name
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


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    payload: PasswordReset,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Set a new password for someone who has forgotten theirs.

    No current password is needed — that's the point — so who may do this
    follows the same matrix as editing the account: the system owner for a
    superadmin, a superadmin for admins and employees, a company admin for its
    own employees.
    """
    user = _get_in_scope_user(db, current_user, user_id)
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Change your own password from Settings > Security",
        )
    _assert_can_manage_target(current_user, user.role)

    user.password_hash = hash_password(payload.new_password)
    write_audit_log(
        db, user_id=current_user.id, business_id=user.business_id, action="update",
        entity_type="user", entity_id=user.id, description=f"Reset password for user {user.username}",
    )
    db.commit()
