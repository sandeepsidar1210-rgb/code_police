# Self-Healing Agent - Setup Guide

## Overview

The Self-Healing Agent automatically detects, fixes, and tests bugs in GitHub repositories. It uses a **fork-based workflow with graceful fallback** to work with both public and private repositories.

## GitHub Token Setup

### Step 1: Create a Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal Access Tokens (classic)](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Protocol Zero Self-Healing Bot")
4. Select the appropriate scopes:

### Required Token Scopes

**Option A: Fork-Based Workflow (Recommended for Public Repos)**
```
✓ public_repo    - Create forks and PRs on public repositories
```

**Option B: Direct Access Workflow (For Private Repos or Write Access)**
```
✓ repo           - Full repository access (includes fork creation)
  ✓ repo:status
  ✓ repo_deployment
  ✓ public_repo
  ✓ repo:invite
  ✓ security_events
```

### Step 2: Add Token to .env

```bash
GITHUB_BOT_TOKEN=ghp_your_token_here
```

## How It Works

### Fork-Based Workflow (Default)
1. ✅ **Fork** the target repository under the bot account
2. ✅ **Clone** the fork (bot has full write access)
3. ✅ **Create** a branch following RIFT 2026 conventions
4. ✅ **Fix** bugs automatically with AI
5. ✅ **Push** commits to the fork
6. ✅ **Create PR** from fork → original repository

### Fallback Workflow (When Forking Fails)
1. ⚠️ Fork fails (403 error - token lacks permissions)
2. ✅ **Clone** the original repository directly
3. ✅ **Create** a branch following RIFT 2026 conventions
4. ✅ **Fix** bugs automatically with AI
5. ✅ **Push** commits to the original repository
6. ✅ **Create PR** from branch → original repository (same repo)

## Error Handling

The system gracefully handles various scenarios:

### 403 Fork Error
**Cause:** Token lacks `public_repo` or `repo` scope  
**Solution:** System falls back to direct repository operations  
**User Action:** Update token scopes if you want fork-based workflow

### 404 Not Found
**Cause:** Repository doesn't exist or is private without access  
**Solution:** Verify repository URL and token permissions

### Authentication Failed
**Cause:** `GITHUB_BOT_TOKEN` is missing or invalid  
**Solution:** Verify token is set correctly in `.env` file

## Troubleshooting

### "Fork failed (403): Resource not accessible by personal access token"

This is **not a fatal error**. The system will:
1. Log the fork failure
2. Automatically fall back to direct repo operations
3. Continue with the healing process

To enable fork-based workflow:
1. Go to GitHub Settings → Developer settings
2. Update your token to include `public_repo` scope
3. Update `GITHUB_BOT_TOKEN` in your `.env` file

### "Failed to push: Authentication failed"

Your token needs write access:
1. For public repos: Ensure you have `public_repo` scope
2. For private repos: Ensure you have `repo` scope
3. Verify the token hasn't expired

## Best Practices

1. **Use Fork-Based Workflow for Public Repos**
   - Cleaner separation of concerns
   - No risk of accidentally modifying original repo
   - Standard open-source contribution workflow

2. **Use Direct Workflow for Private Repos**
   - Requires `repo` scope
   - Bot must be a collaborator on the repository

3. **Token Security**
   - Never commit tokens to version control
   - Use `.env` files (already in `.gitignore`)
   - Rotate tokens periodically
   - Use fine-grained tokens when possible

## Branch Naming Convention

Following RIFT 2026 guidelines:
```
TECH_CHAOS_ANURAG_MISHRA_AI_Fix
```

Rules:
- All UPPERCASE
- Underscores only (no hyphens)
- Team name + Leader name + `_AI_Fix` suffix

## Commit Message Format

```
[AI-AGENT] Fix 3 bug(s) - attempt 2/5
```

All commits are prefixed with `[AI-AGENT]` for easy identification.

## On-Chain Attestation (Optional)

If blockchain attestation is enabled, each fix is recorded on-chain with:
- Bug category and location
- Fix description
- Commit SHA
- Test results before/after
- Etherscan transaction link

Enable via `ENABLE_ATTESTATION=true` in `.env`
