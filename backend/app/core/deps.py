from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.business import Business
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


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
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
    db: Session = Depends(get_db),
) -> int:
    if business_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Business-Id header is required",
        )
    if current_user.role != UserRole.admin:
        # IIM is admin-only in full, per CLAUDE.md's permissions matrix —
        # every business-scoped router depends on this function, so this is
        # the one place that check needs to live rather than repeated in
        # each router. Identified by name, matching the same convention
        # seed.py and the frontend's business switcher already use — there
        # is no dedicated is_iim/kind column on Business.
        business = db.get(Business, business_id)
        if business is not None and business.name == "IIM":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The IIM business is restricted to admins",
            )
    return business_id
