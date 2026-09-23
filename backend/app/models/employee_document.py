from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class EmployeeDocument(TimestampMixin, Base):
    """An extra file attached to an employee, beyond the Emirates ID and
    passport scans (which have their own dedicated columns on Employee).
    Anything else -- a driving license, a work permit, a certificate -- is
    just a name plus a file, and an employee can have any number of them."""

    __tablename__ = "employee_documents"

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False, index=True)
    # Whatever the person naming it calls it -- "License", "Visa page", "NOC letter".
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
