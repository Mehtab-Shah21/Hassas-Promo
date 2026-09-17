"""Seed initial data: Main + IIM businesses, one admin user, default feature flags.

Run with: python -m app.seed
Safe to re-run — skips anything that already exists.
"""

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.business import Business
from app.models.feature_flag import FeatureFlag
from app.models.user import User, UserRole

# Per-business module flags — each existing business gets its own row per
# key, so Main and IIM can be toggled independently. See "Modules" in
# Settings and core/deps.py's require_module_enabled().
DEFAULT_MODULE_FLAGS = [
    ("quotations", "Quotations"),
    ("coupons", "Coupons"),
    ("notifications", "Notifications"),
    ("attendance", "Attendance"),
    ("reconciliation", "Reconciliation"),
    ("reports", "Reports"),
    ("design_studio", "Design Studio"),
]
# Global, install-wide flags (business_id is NULL) — not a module within a
# business, so not part of the per-business set above.
DEFAULT_GLOBAL_FLAGS = [
    ("iim", "IIM Business"),
]


def seed() -> None:
    db = SessionLocal()
    try:
        if not db.query(Business).filter(Business.name == "Main").first():
            db.add(Business(name="Main", invoice_prefix="INV-", quotation_prefix="QTN-"))
        if not db.query(Business).filter(Business.name == "IIM").first():
            db.add(Business(name="IIM", invoice_prefix="IIM-INV-", quotation_prefix="IIM-QTN-"))
        db.commit()

        for key, label in DEFAULT_GLOBAL_FLAGS:
            if not db.query(FeatureFlag).filter(FeatureFlag.key == key, FeatureFlag.business_id.is_(None)).first():
                db.add(FeatureFlag(business_id=None, key=key, enabled=True, label=label))
        for business in db.query(Business).all():
            for key, label in DEFAULT_MODULE_FLAGS:
                if not db.query(FeatureFlag).filter(
                    FeatureFlag.key == key, FeatureFlag.business_id == business.id
                ).first():
                    db.add(FeatureFlag(business_id=business.id, key=key, enabled=True, label=label))
        db.commit()

        admin_username = "MS_Software_Solutions"
        admin_password = "Invoicing@Hassas_2026"
        # Installs seeded before the rename already have their base account
        # under the old "admin" username. This runs on every startup, so without
        # the legacy check it would add a second superadmin next to it.
        existing = db.query(User).filter(User.username.in_([admin_username, "admin"])).first()
        if not existing:
            db.add(
                User(
                    username=admin_username,
                    first_name="Admin",
                    last_name="User",
                    display_name="Admin",
                    email="admin@example.com",
                    password_hash=hash_password(admin_password),
                    role=UserRole.superadmin,
                    # The vendor account: creates the client's first
                    # superadmin and can reset superadmin passwords.
                    is_system_owner=True,
                    avatar_color="#4F46E5",
                )
            )
        db.commit()
        print("Seed complete.")
        print(f"  Admin login: {admin_username}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
