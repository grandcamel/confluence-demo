#!/usr/bin/env python3
"""
Seed Demo Data Script

Creates a demo space with sample pages, labels, and content for
the Confluence Assistant Skills demo.

Usage:
    python seed_demo_data.py

Environment Variables:
    CONFLUENCE_SITE_URL: Confluence Cloud URL
    CONFLUENCE_EMAIL: Account email
    CONFLUENCE_API_TOKEN: API token
    DEMO_SPACE_KEY: Space key to create (default: CDEMO)
    DEMO_SPACE_NAME: Space name (default: Confluence Demo Space)
"""

import json
import os
import sys

from confluence_base import ConfluenceClient, ConfluenceConfig, require_config

# Additional configuration
SPACE_NAME = os.environ.get("DEMO_SPACE_NAME", "Confluence Demo Space")

# Demo content configuration
DEMO_PAGES = [
    {
        "title": "Product Documentation",
        "labels": ["demo", "docs", "root"],
        "body": "# Product Documentation\n\nWelcome to our product documentation. This space contains all technical and user documentation.",
        "children": [
            {
                "title": "API Reference",
                "labels": ["demo", "api", "technical"],
                "body": "# API Reference\n\n## Overview\n\nThis document describes our REST API endpoints.\n\n## Authentication\n\nAll API requests require Bearer token authentication.\n\n## Endpoints\n\n- `GET /api/v1/users` - List users\n- `POST /api/v1/users` - Create user\n- `GET /api/v1/products` - List products"
            },
            {
                "title": "Getting Started Guide",
                "labels": ["demo", "guide", "onboarding"],
                "body": "# Getting Started\n\n## Prerequisites\n\n- Node.js 18+\n- npm or yarn\n\n## Installation\n\n```bash\nnpm install our-product\n```\n\n## Quick Start\n\n1. Initialize the project\n2. Configure settings\n3. Run the application"
            },
            {
                "title": "Release Notes v2.0",
                "labels": ["demo", "release", "v2"],
                "body": "# Release Notes v2.0\n\n## New Features\n\n- Dark mode support\n- Improved search\n- New API endpoints\n\n## Bug Fixes\n\n- Fixed login issues\n- Resolved performance problems\n\n## Breaking Changes\n\n- Removed deprecated endpoints"
            }
        ]
    },
    {
        "title": "Team Resources",
        "labels": ["demo", "team", "root"],
        "body": "# Team Resources\n\nCentral hub for team documentation, meeting notes, and planning.",
        "children": [
            {
                "title": "Meeting Notes Template",
                "labels": ["demo", "template", "meetings"],
                "body": "# Meeting Notes\n\n**Date:** [Date]\n**Attendees:** [List]\n\n## Agenda\n\n1. Item 1\n2. Item 2\n\n## Discussion\n\n[Notes here]\n\n## Action Items\n\n- [ ] Task 1 - Owner\n- [ ] Task 2 - Owner"
            },
            {
                "title": "Q1 Planning",
                "labels": ["demo", "planning", "q1"],
                "body": "# Q1 Planning\n\n## Goals\n\n1. Launch new feature\n2. Improve performance by 20%\n3. Reduce support tickets\n\n## Timeline\n\n- January: Design phase\n- February: Development\n- March: Testing and launch"
            },
            {
                "title": "Architecture Diagram",
                "labels": ["demo", "architecture", "technical"],
                "body": "# System Architecture\n\n## Overview\n\nOur system uses a microservices architecture.\n\n## Components\n\n- **API Gateway**: Routes requests\n- **Auth Service**: Handles authentication\n- **Core Service**: Business logic\n- **Database**: PostgreSQL"
            }
        ]
    }
]


def markdown_to_adf(markdown_text):
    """Convert simple markdown to ADF format."""
    # Simple conversion - just create a paragraph with the text
    # In production, use a proper markdown-to-ADF converter
    paragraphs = markdown_text.split("\n\n")
    content = []

    for para in paragraphs:
        if para.startswith("# "):
            content.append({
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": para[2:]}]
            })
        elif para.startswith("## "):
            content.append({
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": para[3:]}]
            })
        elif para.startswith("```"):
            lines = para.split("\n")
            code = "\n".join(lines[1:-1]) if len(lines) > 2 else ""
            content.append({
                "type": "codeBlock",
                "attrs": {"language": "bash"},
                "content": [{"type": "text", "text": code}]
            })
        elif para.startswith("- "):
            items = para.split("\n")
            list_items = []
            for item in items:
                if item.startswith("- "):
                    list_items.append({
                        "type": "listItem",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": item[2:]}]
                        }]
                    })
            content.append({
                "type": "bulletList",
                "content": list_items
            })
        elif para.strip():
            content.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": para}]
            })

    return {
        "type": "doc",
        "version": 1,
        "content": content if content else [{"type": "paragraph", "content": []}]
    }


def create_space(client: ConfluenceClient, config: ConfluenceConfig):
    """Create the demo space."""
    payload = {
        "key": config.space_key,
        "name": SPACE_NAME,
        "description": {
            "plain": {
                "value": "Demo space for Confluence Assistant Skills",
                "representation": "plain"
            }
        }
    }

    response = client.post("/wiki/api/v2/spaces", json=payload)

    if response.status_code == 200:
        print(f"Created space: {config.space_key}")
        return response.json()
    elif response.status_code == 409:
        print(f"Space {config.space_key} already exists")
        return client.get_space()
    else:
        print(f"Failed to create space: {response.status_code}")
        print(response.text)
        return None


def create_page(client: ConfluenceClient, space_id, title, body, parent_id=None, labels=None):
    """Create a page in the space."""
    adf_body = markdown_to_adf(body)

    payload = {
        "spaceId": space_id,
        "status": "current",
        "title": title,
        "body": {
            "representation": "atlas_doc_format",
            "value": json.dumps(adf_body)
        }
    }

    if parent_id:
        payload["parentId"] = parent_id

    response = client.post("/wiki/api/v2/pages", json=payload)

    if response.status_code == 200:
        page = response.json()
        print(f"  Created page: {title} (ID: {page['id']})")

        # Add labels if specified
        if labels:
            add_labels(client, page["id"], labels)

        return page
    else:
        print(f"  Failed to create page '{title}': {response.status_code}")
        print(f"  {response.text}")
        return None


def add_labels(client: ConfluenceClient, page_id, labels):
    """Add labels to a page."""
    for label in labels:
        payload = {"name": label}
        response = client.post(f"/wiki/api/v2/pages/{page_id}/labels", json=payload)

        if response.status_code == 200:
            print(f"    Added label: {label}")
        elif response.status_code != 400:  # 400 usually means label exists
            print(f"    Failed to add label '{label}': {response.status_code}")


def create_demo_content(client: ConfluenceClient, space_id):
    """Create all demo pages and content."""
    print("\nCreating demo content...")

    for page_config in DEMO_PAGES:
        # Create root page
        page = create_page(
            client,
            space_id,
            page_config["title"],
            page_config["body"],
            labels=page_config.get("labels")
        )

        if page and "children" in page_config:
            # Create child pages
            for child_config in page_config["children"]:
                create_page(
                    client,
                    space_id,
                    child_config["title"],
                    child_config["body"],
                    parent_id=page["id"],
                    labels=child_config.get("labels")
                )


def main():
    """Main entry point."""
    print("Confluence Demo Data Seeder")
    print("=" * 40)

    # Validate and get configuration
    config = require_config()
    client = ConfluenceClient(config)

    print(f"Site: {config.site_url}")
    print(f"Space: {config.space_key} ({SPACE_NAME})")

    # Check if space exists
    existing_space = client.get_space()
    if existing_space:
        print(f"\nSpace {config.space_key} already exists (ID: {existing_space['id']})")
        space = existing_space
    else:
        # Create space
        space = create_space(client, config)
        if not space:
            print("Failed to create space")
            sys.exit(1)

    # Create demo content
    create_demo_content(client, space["id"])

    print("\nDemo data seeding complete!")
    print(f"Visit: {config.site_url}/wiki/spaces/{config.space_key}")


if __name__ == "__main__":
    main()
