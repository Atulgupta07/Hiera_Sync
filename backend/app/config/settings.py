from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "CampusFlow"
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "my-firebase-project")
    FIREBASE_PRIVATE_KEY_PATH: str = os.getenv("FIREBASE_PRIVATE_KEY_PATH", "firebase-credentials.json")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")


    class Config:
        env_file = ".env"

settings = Settings()
