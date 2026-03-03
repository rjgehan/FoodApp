from firebase_functions import https_fn
from firebase_admin import initialize_app

# initialize Firebase Admin
initialize_app()

@https_fn.on_request()
def hello(req: https_fn.Request) -> https_fn.Response:
    return https_fn.Response("Hello from Firebase API")