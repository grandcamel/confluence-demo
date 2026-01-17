# Page Management Scenario

This walkthrough demonstrates core Confluence page operations using natural language.

## Step 1: View Existing Pages

```
Show me all pages in the CDEMO space
```

You should see a list of pre-seeded pages including Product Documentation, Team Resources, and their child pages.

## Step 2: Get Page Details

```
What's in the API Reference page?
```

The API Reference page contains documentation about REST API endpoints. Claude will show you its content.

## Step 3: Create a New Page

```
Create a new page under Product Documentation called "User Guide" with content: This guide helps new users get started with our product.
```

This creates a new page under Product Documentation. Note the page ID returned.

## Step 4: View the New Page

```
Show me the details of the User Guide page we just created
```

## Step 5: Update the Page

```
Update the User Guide page to add: ## Getting Help\n\nContact support at support@example.com
```

This appends new content to the page.

## Step 6: View Another Page

```
Get the page with ID from the Getting Started Guide
```

The Getting Started Guide contains prerequisites and installation instructions.

## Step 7: Check Release Notes

```
Show me the Release Notes v2.0 page
```

This page documents new features like dark mode support.

## Step 8: Create a Blog Post

```
Create a blog post in CDEMO: Weekly Update - We've released new features this week
```

Blog posts are different from regular pages and appear in the blog section.

## Step 9: List Blog Posts

```
List all blog posts in CDEMO
```

## Step 10: Delete the Test Page

```
Delete the User Guide page we created
```

## What You Learned

- Listing pages in a space
- Viewing page content
- Creating pages with parent relationships
- Updating page content
- Creating and listing blog posts
- Deleting pages

## Next Steps

Try the search scenario: `cat /workspace/scenarios/search.md`
