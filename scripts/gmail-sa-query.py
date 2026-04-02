#!/usr/bin/env python3
"""Query Gmail using service account impersonation.
Usage: python3 gmail-sa-query.py <email> <query> <max_results>
"""
import sys, json, urllib.request
from google.oauth2 import service_account
from google.auth.transport.requests import Request
import os

SA_KEY = os.path.expanduser('~/.config/gws/service-account-ac.json')
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

email = sys.argv[1]
query = sys.argv[2]
max_results = int(sys.argv[3]) if len(sys.argv) > 3 else 20

creds = service_account.Credentials.from_service_account_file(
    SA_KEY, scopes=SCOPES, subject=email
)
creds.refresh(Request())

import urllib.parse
url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages?{urllib.parse.urlencode({'q': query, 'maxResults': max_results})}"
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {creds.token}'})
with urllib.request.urlopen(req, timeout=20) as r:
    data = json.loads(r.read().decode())
    print(json.dumps(data))
