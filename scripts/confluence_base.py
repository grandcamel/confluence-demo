#!/usr/bin/env python3
"""
Confluence API Base Module

Shared utilities for Confluence API scripts including authentication,
configuration, and common operations.

Environment Variables:
    CONFLUENCE_SITE_URL: Confluence Cloud URL
    CONFLUENCE_EMAIL: Account email
    CONFLUENCE_API_TOKEN: API token
    DEMO_SPACE_KEY: Space key (default: CDEMO)
"""

import os
import sys

import requests
from requests.auth import HTTPBasicAuth


class ConfluenceConfig:
    """Configuration loaded from environment variables."""

    def __init__(self):
        self.site_url = os.environ.get("CONFLUENCE_SITE_URL", "").rstrip("/")
        self.email = os.environ.get("CONFLUENCE_EMAIL", "")
        self.api_token = os.environ.get("CONFLUENCE_API_TOKEN", "")
        self.space_key = os.environ.get("DEMO_SPACE_KEY", "CDEMO")

    def validate(self) -> bool:
        """Validate required configuration is present."""
        return all([self.site_url, self.email, self.api_token])

    def print_status(self):
        """Print configuration status for debugging."""
        print(f"  CONFLUENCE_SITE_URL: {'set' if self.site_url else 'missing'}")
        print(f"  CONFLUENCE_EMAIL: {'set' if self.email else 'missing'}")
        print(f"  CONFLUENCE_API_TOKEN: {'set' if self.api_token else 'missing'}")


class ConfluenceClient:
    """Simple Confluence API client with common operations."""

    def __init__(self, config: ConfluenceConfig | None = None):
        self.config = config or ConfluenceConfig()
        self._auth = HTTPBasicAuth(self.config.email, self.config.api_token)

    @property
    def auth(self) -> HTTPBasicAuth:
        """Get HTTP Basic Auth for requests."""
        return self._auth

    def get(self, endpoint: str, params: dict | None = None) -> requests.Response:
        """Make GET request to Confluence API."""
        url = f"{self.config.site_url}{endpoint}"
        return requests.get(url, auth=self.auth, params=params)

    def post(self, endpoint: str, json: dict | None = None) -> requests.Response:
        """Make POST request to Confluence API."""
        url = f"{self.config.site_url}{endpoint}"
        return requests.post(url, auth=self.auth, json=json)

    def delete(self, endpoint: str) -> requests.Response:
        """Make DELETE request to Confluence API."""
        url = f"{self.config.site_url}{endpoint}"
        return requests.delete(url, auth=self.auth)

    def get_space(self, space_key: str | None = None) -> dict | None:
        """Get space by key. Returns space dict or None if not found."""
        key = space_key or self.config.space_key
        response = self.get("/wiki/api/v2/spaces", params={"keys": key})

        if response.status_code == 200:
            data = response.json()
            if data.get("results"):
                return data["results"][0]
        return None

    def get_space_id(self, space_key: str | None = None) -> str | None:
        """Get space ID by key. Returns ID string or None if not found."""
        space = self.get_space(space_key)
        return space["id"] if space else None


def require_config(config: ConfluenceConfig | None = None) -> ConfluenceConfig:
    """Validate configuration and exit if invalid."""
    cfg = config or ConfluenceConfig()
    if not cfg.validate():
        print("Error: Missing required environment variables")
        cfg.print_status()
        sys.exit(1)
    return cfg
