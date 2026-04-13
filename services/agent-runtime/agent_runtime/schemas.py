"""Pydantic response models for OpenAPI schema generation."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(examples=["ok"])


class ReadyResponse(BaseModel):
    status: str = Field(examples=["ok"])
    agents: int = Field(description="Number of loaded agents", examples=[3])


class ReloadResponse(BaseModel):
    count: int = Field(description="Number of agents after reload", examples=[3])
    slugs: list[str] = Field(description="Slugs of loaded agents", examples=[["escohotado", "bastos"]])


class ErrorDetail(BaseModel):
    code: str = Field(examples=["AUTH_INVALID_SECRET"])
    message: str = Field(examples=["Invalid internal secret"])
    details: dict[str, object] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorDetail
