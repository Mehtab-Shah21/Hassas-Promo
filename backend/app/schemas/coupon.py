from datetime import date

from pydantic import BaseModel

from app.models.coupon import DiscountType


class CouponBase(BaseModel):
    code: str
    discount_type: DiscountType
    value: float
    is_active: bool = True
    valid_from: date | None = None
    valid_to: date | None = None
    max_uses: int | None = None


class CouponCreate(CouponBase):
    pass


class CouponUpdate(BaseModel):
    code: str | None = None
    discount_type: DiscountType | None = None
    value: float | None = None
    is_active: bool | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    max_uses: int | None = None


class CouponResponse(CouponBase):
    id: int
    business_id: int
    times_used: int

    model_config = {"from_attributes": True}
