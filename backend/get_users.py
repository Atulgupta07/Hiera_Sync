from app.database.session import init_firebase, get_db

init_firebase()
db = get_db()
users = db.collection('users').stream()
print("--- USERS ---")
for u in users:
    data = u.to_dict()
    print(f"Email: {data.get('email')}, Role: {data.get('role')}, Status: {data.get('status')}")
