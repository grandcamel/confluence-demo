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
import time
from functools import wraps

import requests
from requests.auth import HTTPBasicAuth

# Retry configuration
DEFAULT_MAX_RETRIES = 3
DEFAULT_BASE_DELAY = 1.0  # seconds
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def retry_on_failure(max_retries: int = DEFAULT_MAX_RETRIES, base_delay: float = DEFAULT_BASE_DELAY):
    """
    Decorator for retrying API calls with exponential backoff.

    Handles:
    - 429 Too Many Requests (rate limiting)
    - 5xx Server errors (transient failures)
    - Connection errors

    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries (doubles each attempt)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    response = func(*args, **kwargs)
                    if response.status_code not in RETRYABLE_STATUS_CODES:
                        return response

                    # Retryable status code
                    if attempt < max_retries:
                        delay = base_delay * (2 ** attempt)
                        # Respect Retry-After header if present
                        if response.status_code == 429:
                            retry_after = response.headers.get("Retry-After")
                            if retry_after:
                                delay = max(delay, float(retry_after))
                        print(f"  Retry {attempt + 1}/{max_retries} after {delay:.1f}s (status {response.status_code})")
                        time.sleep(delay)
                    else:
                        return response

                except requests.exceptions.ConnectionError as e:
                    last_exception = e
                    if attempt < max_retries:
                        delay = base_delay * (2 ** attempt)
                        print(f"  Retry {attempt + 1}/{max_retries} after {delay:.1f}s (connection error)")
                        time.sleep(delay)
                    else:
                        raise
                except requests.exceptions.Timeout as e:
                    last_exception = e
                    if attempt < max_retries:
                        delay = base_delay * (2 ** attempt)
                        print(f"  Retry {attempt + 1}/{max_retries} after {delay:.1f}s (timeout)")
                        time.sleep(delay)
                    else:
                        raise

            # Should not reach here, but just in case
            if last_exception:
                raise last_exception
            raise RuntimeError("Retry loop completed without result")

        return wrapper
    return decorator


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

    @retry_on_failure()
    def get(self, endpoint: str, params: dict | None = None) -> requests.Response:
        """Make GET request to Confluence API with automatic retry."""
        url = f"{self.config.site_url}{endpoint}"
        return requests.get(url, auth=self.auth, params=params, timeout=30)

    @retry_on_failure()
    def post(self, endpoint: str, json: dict | None = None) -> requests.Response:
        """Make POST request to Confluence API with automatic retry."""
        url = f"{self.config.site_url}{endpoint}"
        return requests.post(url, auth=self.auth, json=json, timeout=30)

    @retry_on_failure()
    def delete(self, endpoint: str) -> requests.Response:
        """Make DELETE request to Confluence API with automatic retry."""
        url = f"{self.config.site_url}{endpoint}"
        return requests.delete(url, auth=self.auth, timeout=30)

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
