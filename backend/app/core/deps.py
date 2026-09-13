from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.feature_flag import FeatureFlag
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exception
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_role(*roles: UserRole):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return dependency


ADMIN_ROLES = (UserRole.admin, UserRole.superadmin)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Admin-or-above — superadmin is a superset of admin everywhere in the
    app except the Users module itself, which enforces the finer
    admin-vs-superadmin split inline (see routers/users.py)."""
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin privileges required",
        )
    return current_user


def get_active_business_id(x_business_id: int | None = Header(default=None)) -> int | None:
    """Every scoped request sends the active business via the X-Business-Id header."""
    return x_business_id


def get_client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def require_active_business_id(
    business_id: int | None = Depends(get_active_business_id),
    current_user: User = Depends(get_current_user),
) -> int:
    """The single central place a request's effective business is resolved.

    Every business-scoped router depends on this function (rather than
    trusting the X-Business-Id header directly), so this is the one place
    per-company isolation needs to be enforced.

    - Superadmin spans every company: the header is required and honored
      as-is (they own the business switcher).
    - Everyone else (admin, employee) belongs to exactly ONE company,
      fixed server-side on their own user row. Their effective business_id
      is ALWAYS current_user.business_id — never client-supplied. If they
      send a header naming a different company, that's a deliberate
      cross-company access attempt and is rejected with 403, not silently
      served or silently corrected.
    """
    if current_user.role == UserRole.superadmin:
        if business_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Business-Id header is required",
            )
        return business_id

    if current_user.business_id is None:
        # Should not happen once every non-superadmin has been migrated to
        # a company — fail closed rather than guess.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not assigned to a company. Contact an administrator.",
        )
    if business_id is not None and business_id != current_user.business_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to that company",
        )
    return current_user.business_id


def require_module_enabled(key: str):
    """Router-level gate for an optional module: attach via
    `APIRouter(..., dependencies=[Depends(require_module_enabled("coupons"))])`
    so every endpoint on that router 403s once the module is toggled off for
    the active business — the flag can no longer be bypassed by calling the
    API directly, only the sidebar/UI was checking it before. No row for
    this (business_id, key) defaults to enabled, matching the frontend's own
    `isEnabled` default.
    """

    def dependency(
        business_id: int = Depends(require_active_business_id),
        db: Session = Depends(get_db),
    ) -> None:
        flag = (
            db.query(FeatureFlag)
            .filter(FeatureFlag.business_id == business_id, FeatureFlag.key == key)
            .first()
        )
        if flag is not None and not flag.enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"The {flag.label} module is disabled for this business",
            )

    return dependency
