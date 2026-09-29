from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router
from app.scheduler.jobs import start_scheduler, stop_scheduler
from app.utils.logging import logger
from app.database.session import init_firebase
from fastapi.responses import JSONResponse
import sys
from contextlib import asynccontextmanager
from google.api_core.exceptions import GoogleAPICallError, RetryError

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CampusPulse API...")
    init_firebase()
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("CampusPulse API shutdown complete.")

app = FastAPI(
    title="CampusPulse API",
    description="Smart College Workflow & Event Management System API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

from google.api_core.exceptions import GoogleAPICallError, RetryError, ResourceExhausted

@app.exception_handler(GoogleAPICallError)
async def google_api_exception_handler(request: Request, exc: GoogleAPICallError):
    logger.warning(f"Google API Error on {request.url.path}: {exc}")
    is_quota = isinstance(exc, ResourceExhausted) or "429" in str(exc) or "Quota exceeded" in str(exc)

    # 1. Isolate authentication requests
    if "/auth/" in request.url.path:
        detail_msg = "Authentication service temporarily unavailable. Please try again shortly." if is_quota else "Authentication service error. Please try again."
        return JSONResponse(
            status_code=503,
            content={"detail": detail_msg, "message": detail_msg}
        )

    # 2. Isolate notification requests so they never crash the dashboard
    if "/notifications" in request.url.path:
        from app.api.v1.notifications import DEFAULT_NOTIFICATIONS
        return JSONResponse(
            status_code=200,
            content=DEFAULT_NOTIFICATIONS
        )

    msg = "Database quota limit reached. Please try again shortly." if is_quota else "Service temporarily unavailable due to backend failure."
    return JSONResponse(
        status_code=503,
        content={"message": msg, "detail": msg}
    )

@app.exception_handler(RetryError)
async def google_retry_exception_handler(request: Request, exc: RetryError):
    logger.warning(f"Google API Retry Error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=503,
        content={"message": "Service temporarily unavailable. Please try again shortly.", "detail": "Service temporarily unavailable. Please try again shortly."}
    )

@app.get("/")
async def root():
    return {"message": "Welcome to CampusPulse API"}
