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

from confluence_base import ConfluenceClient, require_config

# Additional configuration
PRESERVE_LABEL = os.environ.get("DEMO_PRESERVE_LABEL", "demo")


def get_page_labels(client: ConfluenceClient, page_id):
    """Get labels for a page."""
    response = client.get(f"/wiki/api/v2/pages/{page_id}/labels")
    if response.status_code == 200:
        data = response.json()
        return [label["name"] for label in data.get("results", [])]
    return []


def get_all_pages(client: ConfluenceClient, space_id):
    """Get all pages in the space."""
    pages = []
    endpoint = f"/wiki/api/v2/spaces/{space_id}/pages"
    params = {"limit": 100}

    while endpoint:
        response = client.get(endpoint, params=params)
        if response.status_code != 200:
            print(f"Failed to get pages: {response.status_code}")
            break

        data = response.json()
        pages.extend(data.get("results", []))

        # Handle pagination
        links = data.get("_links", {})
        next_link = links.get("next")
        if next_link:
            endpoint = next_link
            params = {}  # Next URL includes params
        else:
            endpoint = None

    return pages


def delete_page(client: ConfluenceClient, page_id):
    """Delete a page."""
    response = client.delete(f"/wiki/api/v2/pages/{page_id}")
    return response.status_code in [200, 204]


def delete_comments(client: ConfluenceClient, page_id):
    """Delete all comments from a page."""
    response = client.get(f"/wiki/api/v2/pages/{page_id}/footer-comments")
    if response.status_code != 200:
        return

    data = response.json()
    for comment in data.get("results", []):
        comment_id = comment["id"]
        client.delete(f"/wiki/api/v2/footer-comments/{comment_id}")
        print(f"    Deleted comment: {comment_id}")


def cleanup_sandbox():
    """Clean up the demo sandbox."""
    print("Confluence Demo Sandbox Cleanup")
    print("=" * 40)

    # Validate and get configuration
    config = require_config()
    client = ConfluenceClient(config)

    print(f"Site: {config.site_url}")
    print(f"Space: {config.space_key}")
    print(f"Preserving pages with label: {PRESERVE_LABEL}")

    # Get space ID
    space_id = client.get_space_id()
    if not space_id:
        print(f"\nSpace {config.space_key} not found")
        sys.exit(1)

    print(f"\nSpace ID: {space_id}")

    # Get all pages
    pages = get_all_pages(client, space_id)
    print(f"Found {len(pages)} pages")

    # Categorize pages
    preserved = []
    to_delete = []

    for page in pages:
        labels = get_page_labels(client, page["id"])
        if PRESERVE_LABEL in labels:
            preserved.append(page)
            # Clean up comments on preserved pages
            print(f"  Preserving: {page['title']}")
            delete_comments(client, page["id"])
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
        if delete_page(client, page["id"]):
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
