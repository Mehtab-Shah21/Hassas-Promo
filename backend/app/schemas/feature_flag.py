from pydantic import BaseModel


class FeatureFlagResponse(BaseModel):
    id: int
    business_id: int | None
    key: str
    enabled: bool
    label: str

    model_config = {"from_attributes": True}


class FeatureFlagUpdate(BaseModel):
    enabled: bool
