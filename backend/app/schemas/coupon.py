from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.coupon import CouponKind, DiscountType

# code length mirrors app/models/coupon.py; value/max_uses get sanity floors
# so a coupon can never carry a negative discount or a zero/negative usage
# cap, and a "percent" coupon can never be created above 100% (the invoice/
# quotation totals already clamp the discount to the subtotal either way --
# see services/invoice_calc.py -- but a coupon that LOOKS like "500% off" on
# the Coupons list is confusing, unintended data, not a valid business state).


class CouponBase(BaseModel):
    code: str = Field(max_length=50)
    # Fixed at creation — CouponUpdate deliberately has no kind field.
    kind: CouponKind = CouponKind.discount
    discount_type: DiscountType
    value: float = Field(ge=0)
    is_active: bool = True
    valid_from: date | None = None
    valid_to: date | None = None
    max_uses: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _percent_within_100(self):
        if self.discount_type == DiscountType.percent and self.value > 100:
            raise ValueError("A percentage discount can't exceed 100%")
        return self


class CouponCreate(CouponBase):
    pass


class CouponUpdate(BaseModel):
    code: str | None = Field(default=None, max_length=50)
    discount_type: DiscountType | None = None
    value: float | None = Field(default=None, ge=0)
    is_active: bool | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    max_uses: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _percent_within_100(self):
        if self.discount_type == DiscountType.percent and self.value is not None and self.value > 100:
            raise ValueError("A percentage discount can't exceed 100%")
        return self


class CouponResponse(BaseModel):
    # See CustomerResponse in schemas/customer.py for why this is its own
    # class rather than CouponResponse(CouponBase) -- CouponBase's
    # length cap AND its ">100% is invalid" validator both belong to
    # input validation, not to reading back whatever is already stored.
    id: int
    business_id: int
    code: str
    kind: CouponKind
    discount_type: DiscountType
    value: float
    is_active: bool
    valid_from: date | None
    valid_to: date | None
    max_uses: int | None
    times_used: int
    banner_path: str | None = None

    model_config = {"from_attributes": True}
