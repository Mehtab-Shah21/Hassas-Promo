from datetime import datetime

from pydantic import BaseModel


class BackupSettingsResponse(BaseModel):
    backup_folder: str | None

    model_config = {"from_attributes": True}


class BackupSettingsUpdate(BaseModel):
    backup_folder: str | None


class BackupFileInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


class RestoreRequest(BaseModel):
    filename: str
    confirm: bool = False
