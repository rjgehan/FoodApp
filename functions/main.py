from firebase_functions import https_fn
from firebase_admin import initialize_app

from structures.recipie import Recipe

# initialize Firebase Admin
initialize_app()


@https_fn.on_request()
def hello(req: https_fn.Request) -> https_fn.Response:
    return https_fn.Response("Hello from Firebase API")


@https_fn.on_request()
def create_recipe(req: https_fn.Request) -> https_fn.Response:
    payload = req.get_json(silent=True)

    if isinstance(payload, list):
        recipe = Recipe.from_list(payload)
    elif isinstance(payload, dict):
        recipe = Recipe.from_dict(payload)
    else:
        return https_fn.Response("Send JSON list or object", status=400)

    return https_fn.Response(recipe.name, status=200)
