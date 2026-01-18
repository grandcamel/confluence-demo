#!/usr/bin/env python3
"""
Cleanup Demo Sandbox Script

Removes user-created content while preserving seed data.
Pages with the 'demo' label are preserved.

Usage:
    python cleanup_demo_sandbox.py

Environment Variables:
    CONFLUENCE_SITE_URL: Confluence Cloud URL
    CONFLUENCE_EMAIL: Account email
    CONFLUENCE_API_TOKEN: API token
    DEMO_SPACE_KEY: Space key (default: CDEMO)
    DEMO_PRESERVE_LABEL: Label for preserved content (default: demo)
"""

import os
import sys

import requests
from requests.auth import HTTPBasicAuth

# Configuration from environment
SITE_URL = os.environ.get("CONFLUENCE_SITE_URL", "").rstrip("/")
EMAIL = os.environ.get("CONFLUENCE_EMAIL", "")
API_TOKEN = os.environ.get("CONFLUENCE_API_TOKEN", "")
SPACE_KEY = os.environ.get("DEMO_SPACE_KEY", "CDEMO")
PRESERVE_LABEL = os.environ.get("DEMO_PRESERVE_LABEL", "demo")


def get_auth():
    """Get HTTP Basic Auth."""
    return HTTPBasicAuth(EMAIL, API_TOKEN)


def get_space_id():
    """Get the space ID for the demo space."""
    url = f"{SITE_URL}/wiki/api/v2/spaces"
    params = {"keys": SPACE_KEY}

    response = requests.get(url, auth=get_auth(), params=params)
    if response.status_code == 200:
        data = response.json()
        if data.get("results"):
            return data["results"][0]["id"]
    return None


def get_page_labels(page_id):
    """Get labels for a page."""
    url = f"{SITE_URL}/wiki/api/v2/pages/{page_id}/labels"

    response = requests.get(url, auth=get_auth())
    if response.status_code == 200:
        data = response.json()
        return [label["name"] for label in data.get("results", [])]
    return []


def get_all_pages(space_id):
    """Get all pages in the space."""
    pages = []
    url = f"{SITE_URL}/wiki/api/v2/spaces/{space_id}/pages"
    params = {"limit": 100}

    while url:
        response = requests.get(url, auth=get_auth(), params=params)
        if response.status_code != 200:
            print(f"Failed to get pages: {response.status_code}")
            break

        data = response.json()
        pages.extend(data.get("results", []))

        # Handle pagination
        links = data.get("_links", {})
        url = links.get("next")
        if url:
            url = f"{SITE_URL}{url}"
            params = {}  # Next URL includes params

    return pages


def delete_page(page_id):
    """Delete a page."""
    url = f"{SITE_URL}/wiki/api/v2/pages/{page_id}"

    response = requests.delete(url, auth=get_auth())
    return response.status_code in [200, 204]


def delete_comments(page_id):
    """Delete all comments from a page."""
    # Get footer comments
    url = f"{SITE_URL}/wiki/api/v2/pages/{page_id}/footer-comments"

    response = requests.get(url, auth=get_auth())
    if response.status_code != 200:
        return

    data = response.json()
    for comment in data.get("results", []):
        comment_id = comment["id"]
        delete_url = f"{SITE_URL}/wiki/api/v2/footer-comments/{comment_id}"
        requests.delete(delete_url, auth=get_auth())
        print(f"    Deleted comment: {comment_id}")


def cleanup_sandbox():
    """Clean up the demo sandbox."""
    print("Confluence Demo Sandbox Cleanup")
    print("=" * 40)

    # Validate configuration
    if not all([SITE_URL, EMAIL, API_TOKEN]):
        print("Error: Missing required environment variables")
        sys.exit(1)

    print(f"Site: {SITE_URL}")
    print(f"Space: {SPACE_KEY}")
    print(f"Preserving pages with label: {PRESERVE_LABEL}")

    # Get space ID
    space_id = get_space_id()
    if not space_id:
        print(f"\nSpace {SPACE_KEY} not found")
        sys.exit(1)

    print(f"\nSpace ID: {space_id}")

    # Get all pages
    pages = get_all_pages(space_id)
    print(f"Found {len(pages)} pages")

    # Categorize pages
    preserved = []
    to_delete = []

    for page in pages:
        labels = get_page_labels(page["id"])
        if PRESERVE_LABEL in labels:
            preserved.append(page)
            # Clean up comments on preserved pages
            print(f"  Preserving: {page['title']}")
            delete_comments(page["id"])
        else:
            to_delete.append(page)

    print(f"\nPages to preserve: {len(preserved)}")
    print(f"Pages to delete: {len(to_delete)}")

    # Delete non-preserved pages (children first)
    # Sort by depth (more slashes in path = deeper)
    to_delete_sorted = sorted(
        to_delete,
        key=lambda p: p.get("_links", {}).get("webui", "").count("/"),
        reverse=True
    )

    deleted_count = 0
    for page in to_delete_sorted:
        print(f"  Deleting: {page['title']} (ID: {page['id']})")
        if delete_page(page["id"]):
            deleted_count += 1
        else:
            print(f"    Failed to delete {page['title']}")

    print("\nCleanup complete!")
    print(f"  Deleted: {deleted_count} pages")
    print(f"  Preserved: {len(preserved)} pages")


def main():
    """Main entry point."""
    try:
        cleanup_sandbox()
    except Exception as e:
        print(f"Error during cleanup: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
