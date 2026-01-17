# Bulk Operations Scenario

This walkthrough demonstrates bulk operations with dry-run support.

## Safety First

Bulk operations always support dry-run mode to preview changes before executing.

## Step 1: Dry-Run Bulk Label

```
Add the label 'reviewed' to all pages under Product Documentation - dry run first
```

Shows what pages would be labeled without making changes.

## Step 2: Count Affected Pages

```
How many pages would be affected by adding 'reviewed' to all pages in CDEMO?
```

Provides a count for planning.

## Step 3: Available Operations

```
List all bulk operations available for Confluence
```

Shows what bulk operations are supported.

## Step 4: Dry-Run Delete Preview

```
Show me what pages would be deleted if I removed all non-demo pages - dry run only
```

Previews destructive operations safely.

## Bulk Operations

| Operation | Description | Risk Level |
|-----------|-------------|------------|
| Bulk Label | Add labels to multiple pages | Low |
| Bulk Move | Move pages to new parent | Medium |
| Bulk Delete | Remove multiple pages | High |

## Safety Features

- **Dry-run mode**: Preview changes
- **Confirmation**: Require explicit approval
- **Rollback info**: Track what changed
- **Limits**: Batch size limits

## What You Learned

- Using dry-run mode
- Previewing bulk changes
- Understanding available operations
- Safety considerations

## Next Steps

Try the analytics scenario: `cat /workspace/scenarios/analytics.md`
