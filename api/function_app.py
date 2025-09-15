import azure.functions as func
import json
import os
import requests
from urllib.parse import urlencode

app = func.FunctionApp()

PLANNR_CLIENT_ID = os.environ.get('PLANNR_CLIENT_ID')
PLANNR_CLIENT_SECRET = os.environ.get('PLANNR_CLIENT_SECRET')
PLANNR_TOKEN_URL = 'https://api.plannrcrm.com/oauth/token'
PLANNR_API_BASE = 'https://api.plannrcrm.com/api/v1'

def json_response(data, status=200, headers=None):
    return func.HttpResponse(
        json.dumps(data),
        status_code=status,
        mimetype="application/json",
        headers=headers or {}
    )

def error_wrap(upstream):
    resp_json, resp_text = None, None
    if upstream.content:
        try:
            resp_json = upstream.json()
        except Exception:
            resp_text = upstream.text
    return {
        "error": "Upstream call failed",
        "status": upstream.status_code,
        "upstream_json": resp_json,
        "upstream_text": resp_text
    }

@app.route(route="oauth/token", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def oauth_token_exchange(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
        code = body.get("code")
        redirect_uri = body.get("redirect_uri")
        if not code or not redirect_uri:
            return json_response({"error": "Missing code or redirect_uri"}, 400)

        data = {
            "grant_type": "authorization_code",
            "client_id": PLANNR_CLIENT_ID,
            "client_secret": PLANNR_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "code": code
        }

        r = requests.post(
            PLANNR_TOKEN_URL,
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
            data=urlencode(data)
        )
        if r.status_code == 200:
            return json_response(r.json(), 200)
        return json_response(error_wrap(r), r.status_code)

    except Exception as e:
        return json_response({"error": f"Token exchange error: {str(e)}"}, 500)

@app.route(route="oauth/refresh", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def oauth_refresh_token(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
        refresh_token = body.get("refresh_token")
        if not refresh_token:
            return json_response({"error": "Missing refresh_token"}, 400)

        data = {
            "grant_type": "refresh_token",
            "client_id": PLANNR_CLIENT_ID,
            "client_secret": PLANNR_CLIENT_SECRET,
            "refresh_token": refresh_token
        }

        r = requests.post(
            PLANNR_TOKEN_URL,
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
            data=urlencode(data)
        )
        if r.status_code == 200:
            return json_response(r.json(), 200)
        return json_response(error_wrap(r), r.status_code)

    except Exception as e:
        return json_response({"error": f"Token refresh error: {str(e)}"}, 500)

@app.route(route="proxy", methods=["GET", "POST"], auth_level=func.AuthLevel.ANONYMOUS)
def plannr_proxy(req: func.HttpRequest) -> func.HttpResponse:
    try:
        auth_header = req.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return json_response({"error": "Missing or invalid Authorization header"}, 401)

        access_token = auth_header.replace("Bearer ", "")
        endpoint = req.params.get("endpoint", "logins")
        api_url = f"{PLANNR_API_BASE}/{endpoint}"

        if req.method == "GET":
            r = requests.get(
                api_url,
                headers={"Accept": "application/json", "Authorization": f"Bearer {access_token}"},
                params=dict(req.params)
            )
        else:
            body = req.get_json() if req.get_body() else {}
            r = requests.post(
                api_url,
                headers={"Accept": "application/json", "Content-Type": "application/json",
                         "Authorization": f"Bearer {access_token}"},
                json=body
            )

        if r.content:
            try:
                return json_response(r.json(), r.status_code)
            except Exception:
                return func.HttpResponse(r.text, status_code=r.status_code, mimetype="application/json")
        return json_response({}, r.status_code)

    except Exception as e:
        return json_response({"error": f"Proxy error: {str(e)}"}, 500)

@app.route(route="get-clients", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_clients(req: func.HttpRequest) -> func.HttpResponse:
    try:
        auth_header = req.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return json_response({"error": "Missing or invalid Authorization header"}, 401)

        access_token = auth_header.replace("Bearer ", "")
        search_query = req.params.get("search", "")
        limit = req.params.get("limit", "20")

        api_url = f"{PLANNR_API_BASE}/client"
        params = {"limit": limit}
        if search_query:
            params["search"] = search_query

        r = requests.get(
            api_url,
            headers={"Accept": "application/json", "Authorization": f"Bearer {access_token}"},
            params=params
        )

        if r.content:
            try:
                return json_response(r.json(), r.status_code)
            except Exception:
                return func.HttpResponse(r.text, status_code=r.status_code, mimetype="application/json")
        return json_response({}, r.status_code)

    except Exception as e:
        return json_response({"error": f"Get clients error: {str(e)}"}, 500)
