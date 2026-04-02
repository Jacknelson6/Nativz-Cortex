#!/usr/bin/env python3
"""Fetch a Gmail message using service account impersonation.
Usage: python3 gmail-sa-get.py <email> <message_id>
"""
import sys, json, urllib.request, os
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SA_KEY = os.path.expanduser('~/.config/gws/service-account-ac.json')
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

email = sys.argv[1]
msg_id = sys.argv[2]

creds = service_account.Credentials.from_service_account_file(
    SA_KEY, scopes=SCOPES, subject=email
)
creds.refresh(Request())

url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full"
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {creds.token}'})
with urllib.request.urlopen(req, timeout=20) as r:
    print(r.read().decode())
