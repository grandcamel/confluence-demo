# Search Scenario

This walkthrough demonstrates CQL (Confluence Query Language) search operations.

## Step 1: Basic Space Search

```
Search for all pages in CDEMO space
```

This uses CQL: `space = "CDEMO" AND type = page`

## Step 2: Search by Label

```
Find pages with the label 'api' in CDEMO
```

CQL: `label = "api" AND space = "CDEMO"`

The API Reference page has this label.

## Step 3: Text Search

```
Search for pages containing 'authentication' in CDEMO
```

Text search finds pages with the specified term in their content.

## Step 4: Multiple Labels

```
Find all pages labeled 'technical' in CDEMO
```

This should find API Reference and Architecture Diagram pages.

## Step 5: Specific Label Search

```
Search for pages with label 'planning' in CDEMO
```

Finds the Q1 Planning page.

## Step 6: Time-Based Search

```
Find pages modified in the last 7 days in CDEMO
```

CQL: `space = "CDEMO" AND lastModified > now("-7d")`

## Step 7: Ancestor Search

```
Search for pages under Product Documentation in CDEMO
```

Finds all child pages of Product Documentation using ancestor queries.

## Step 8: Release Label Search

```
Find pages with label 'release' in CDEMO
```

Finds Release Notes v2.0.

## Step 9: Content Search

```
Search for pages mentioning 'microservices' in CDEMO
```

Finds Architecture Diagram which describes microservices architecture.

## Step 10: Export Results

```
Export the search results for 'label = demo' to CSV
```

Exports search results to CSV format for external use.

## CQL Quick Reference

| Query | Description |
|-------|-------------|
| `space = "KEY"` | Pages in space |
| `type = page` | Pages only (not blog) |
| `type = blogpost` | Blog posts only |
| `label = "name"` | Pages with label |
| `text ~ "term"` | Text search |
| `ancestor = pageId` | Child pages |
| `lastModified > now("-7d")` | Recent changes |
| `creator = currentUser()` | My pages |

## What You Learned

- Basic CQL queries
- Label-based searching
- Text content search
- Time-based filters
- Ancestor queries
- Exporting results

## Next Steps

Try the hierarchy scenario: `cat /workspace/scenarios/hierarchy.md`
