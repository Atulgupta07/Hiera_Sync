import os

import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import HTTPException, status

from app.config.settings import settings
from app.utils.logging import logger

db = None


def init_firebase():
    global db

    if firebase_admin._apps:
        db = firestore.client()
        return

    try:
        if os.path.exists(settings.FIREBASE_PRIVATE_KEY_PATH):
            logger.info(
                f"Initializing Firebase using {settings.FIREBASE_PRIVATE_KEY_PATH}"
            )

            cred = credentials.Certificate(settings.FIREBASE_PRIVATE_KEY_PATH)
            project_id = getattr(cred, "project_id", None) or settings.FIREBASE_PROJECT_ID

            firebase_admin.initialize_app(
                cred,
                {
                    "projectId": project_id
                }
            )
        else:
            logger.warning(
                "Firebase credentials file not found. Using default credentials."
            )

            firebase_admin.initialize_app(
                options={
                    "projectId": settings.FIREBASE_PROJECT_ID
                }
            )

        db = firestore.client()
        logger.info("Firestore initialized successfully.")

    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        db = None
        raise


def get_db():
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firestore is not initialized."
        )

    return db