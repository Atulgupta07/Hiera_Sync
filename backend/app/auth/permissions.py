from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from google.cloud.firestore import Client
from google.cloud.firestore_v1.base_query import FieldFilter
from google.api_core.exceptions import GoogleAPICallError, ResourceExhausted
from app.auth.jwt import verify_token
from app.database.session import get_db
from app.models.models import User, RoleEnum
from app.utils.cache import user_cache
from app.utils.logging import logger

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Client = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token, credentials_exception)
    
    # 1. Check in-memory user cache to avoid redundant Firestore reads on every authenticated request
    cached_user = user_cache.get(token_data.email)
    if cached_user is not None:
        return cached_user

    # 2. Query Firestore with limit(1)
    try:
        users_ref = db.collection('users')
        query = users_ref.where(filter=FieldFilter('email', '==', token_data.email)).limit(1).stream()
        users = list(query)
    except (ResourceExhausted, GoogleAPICallError) as e:
        logger.warning(f"Firestore quota reached during user authentication check: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable. Please try again shortly."
        )
    
    if not users:
        raise credentials_exception
    
    user_dict = users[0].to_dict()
    user_id = user_dict.get("id", users[0].id)

    # Auto-sync/heal: If user status is PENDING, check if their join request was Approved
    if user_dict.get("status") == "PENDING":
        try:
            requests_ref = db.collection('join_requests')
            req_query = requests_ref.where(filter=FieldFilter('faculty_id', '==', user_id)).where(filter=FieldFilter('status', '==', 'Approved')).limit(1).stream()
            approved_reqs = list(req_query)
            if approved_reqs:
                req_data = approved_reqs[0].to_dict()
                dept_id = req_data.get('department_id')
                user_dict["status"] = "ACTIVE"
                if dept_id:
                    user_dict["department_id"] = dept_id
                # Persist active status back to users document in Firestore
                users_ref.document(user_id).update({
                    "status": "ACTIVE",
                    "department_id": user_dict["department_id"]
                })
        except Exception as e:
            logger.warning(f"Auto-sync join request check error: {e}")

    user_obj = User(**user_dict)
    # Cache user for 60 seconds
    user_cache.set(token_data.email, user_obj, ttl=60)
    return user_obj

def get_current_active_user(current_user: User = Depends(get_current_user)):
    if current_user.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def check_role(required_roles: list[RoleEnum]):
    def role_checker(current_user: User = Depends(get_current_active_user)):
        if current_user.role not in required_roles:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return current_user
    return role_checker
