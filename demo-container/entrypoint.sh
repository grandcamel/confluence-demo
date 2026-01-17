#!/bin/bash
# =============================================================================
# Confluence Demo Container Entrypoint
# =============================================================================
# Displays welcome message, verifies connections, and starts session timer.
# =============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# Session timeout (default: 60 minutes)
SESSION_TIMEOUT_MINUTES="${SESSION_TIMEOUT_MINUTES:-60}"
SESSION_TIMEOUT_SECONDS=$((SESSION_TIMEOUT_MINUTES * 60))

# Setup Claude authentication
# OAuth token requires .claude.json with hasCompletedOnboarding and bypassPermissionsModeAccepted
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    mkdir -p /home/devuser/.claude
    CLAUDE_JSON="/home/devuser/.claude/.claude.json"
    if [ -f "$CLAUDE_JSON" ]; then
        # Merge settings into existing file
        jq '. + {hasCompletedOnboarding: true, bypassPermissionsModeAccepted: true}' "$CLAUDE_JSON" > "${CLAUDE_JSON}.tmp" && mv "${CLAUDE_JSON}.tmp" "$CLAUDE_JSON"
    else
        # Create new file
        echo '{"hasCompletedOnboarding": true, "bypassPermissionsModeAccepted": true}' > "$CLAUDE_JSON"
    fi
    chmod 600 "$CLAUDE_JSON"
fi

# Display welcome message
clear
cat /etc/motd

# Verify Claude credentials
echo -e "${CYAN}Checking connections...${NC}"

if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo -e "  ${GREEN}✓${NC} Claude OAuth token configured"
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo -e "  ${GREEN}✓${NC} Claude API key configured"
else
    echo -e "  ${YELLOW}⚠${NC} No Claude credentials (set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)"
fi

# Verify Confluence connection
if [ -n "$CONFLUENCE_API_TOKEN" ] && [ -n "$CONFLUENCE_EMAIL" ] && [ -n "$CONFLUENCE_SITE_URL" ]; then
    echo -e "  ${GREEN}✓${NC} Confluence credentials configured"

    # Quick connectivity test
    if curl -sf -u "${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}" \
        "${CONFLUENCE_SITE_URL}/wiki/api/v2/spaces?limit=1" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Connected to $(echo $CONFLUENCE_SITE_URL | sed 's|https://||')"
    else
        echo -e "  ${YELLOW}⚠${NC} Confluence connection test failed (credentials may be invalid)"
    fi
else
    echo -e "  ${RED}✗${NC} Confluence credentials not configured"
fi

echo ""
echo -e "${CYAN}Session Info:${NC}"
echo -e "  Duration: ${SESSION_TIMEOUT_MINUTES} minutes"
echo -e "  Started:  $(date '+%H:%M:%S %Z')"
echo ""

# Start session timer in background
(
    # Warning at 5 minutes remaining
    warning_time=$((SESSION_TIMEOUT_SECONDS - 300))
    if [ $warning_time -gt 0 ]; then
        sleep $warning_time
        echo ""
        echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  ⏰ 5 MINUTES REMAINING - Your session will end soon          ║${NC}"
        echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        sleep 300
    else
        sleep $SESSION_TIMEOUT_SECONDS
    fi

    # Session timeout
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ⏱️  SESSION TIMEOUT - Your 1-hour demo has ended             ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║  Thank you for trying Confluence Assistant Skills!            ║${NC}"
    echo -e "${RED}║  Visit: github.com/grandcamel/confluence-assistant-skills     ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Give user a moment to see the message, then exit
    sleep 5
    kill -TERM $$ 2>/dev/null
) &

# Trap to clean up timer on exit
cleanup() {
    # Kill all background jobs
    jobs -p | xargs -r kill 2>/dev/null
}
trap cleanup EXIT

# Install Confluence Assistant Skills CLI from PyPI
echo -e "${CYAN}Installing Confluence Assistant Skills...${NC}"
if pip install --quiet --no-cache-dir confluence-assistant-skills 2>/dev/null; then
    CLI_VERSION=$(pip show confluence-assistant-skills 2>/dev/null | grep Version | cut -d' ' -f2)
    echo -e "  ${GREEN}✓${NC} confluence CLI v${CLI_VERSION} installed"
else
    echo -e "  ${YELLOW}⚠${NC} CLI installation failed"
fi

# Install Confluence Assistant Skills plugin from marketplace (clear all plugin cache first)
rm -rf ~/.claude/plugins 2>/dev/null || true
# Use main branch to get latest
claude plugin marketplace add https://github.com/grandcamel/confluence-assistant-skills.git#main >/dev/null 2>&1 || true
claude plugin install confluence-assistant-skills@confluence-assistant-skills-marketplace --scope user >/dev/null 2>&1 || true
# Verify installation
INSTALLED_VERSION=$(cat ~/.claude/plugins/cache/*/confluence-assistant-skills/*/.claude-plugin/plugin.json 2>/dev/null | jq -r '.version' | head -1)
if [ -n "$INSTALLED_VERSION" ]; then
    echo -e "  ${GREEN}✓${NC} Claude plugin v${INSTALLED_VERSION} ready"
else
    echo -e "  ${YELLOW}⚠${NC} Plugin installation failed (will retry on first use)"
fi
echo ""
echo -e "${YELLOW}Press Enter to continue...${NC}"
read -r

# =============================================================================
# Interactive Startup Menu
# =============================================================================

show_menu() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                 Confluence Assistant Demo                     ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    if [ "${ENABLE_AUTOPLAY:-false}" = "true" ]; then
        echo -e "${CYAN}║${NC}  ${GREEN}1)${NC} Auto-play Scenario ${YELLOW}(watch a live demo)${NC}                   ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}  ${GREEN}2)${NC} Run Scenario ${YELLOW}(Mock API - no Confluence calls)${NC}            ${CYAN}║${NC}"
    fi
    echo -e "${CYAN}║${NC}  ${GREEN}3)${NC} View Scenarios                                            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}4)${NC} Start Claude (interactive mode)                          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}5)${NC} Start Bash Shell                                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}q)${NC} Exit                                                     ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

show_scenarios_menu() {
    echo ""
    echo -e "${CYAN}Available Scenarios:${NC}"
    echo -e "  ${GREEN}1)${NC} Page Management    - Create, read, update, delete pages"
    echo -e "  ${GREEN}2)${NC} Search & CQL       - Find content, build queries"
    echo -e "  ${GREEN}3)${NC} Space Management   - Create and manage spaces"
    echo -e "  ${GREEN}4)${NC} Content Hierarchy  - Navigate page trees"
    echo -e "  ${GREEN}5)${NC} Observability      - Explore Grafana dashboards"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
}

view_scenario() {
    local file="$1"
    if [ -f "$file" ]; then
        clear
        # Use glow for beautiful markdown rendering
        glow -p "$file"
    else
        echo -e "${RED}Scenario file not found: $file${NC}"
        sleep 2
    fi
}

scenarios_loop() {
    while true; do
        clear
        cat /etc/motd
        show_scenarios_menu
        read -rp "Select scenario: " choice
        case $choice in
            1) view_scenario "/workspace/scenarios/page.md" ;;
            2) view_scenario "/workspace/scenarios/search.md" ;;
            3) view_scenario "/workspace/scenarios/space.md" ;;
            4) view_scenario "/workspace/scenarios/hierarchy.md" ;;
            5) view_scenario "/workspace/scenarios/observability.md" ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

show_autoplay_menu() {
    echo ""
    echo -e "${CYAN}Auto-play Scenarios:${NC}"
    echo -e "  ${GREEN}1)${NC} Page Management    - Create, read, update, delete pages"
    echo -e "  ${GREEN}2)${NC} Search & CQL       - Find content using natural language"
    echo -e "  ${GREEN}3)${NC} Space Management   - List and manage spaces"
    echo -e "  ${GREEN}4)${NC} Content Hierarchy  - Navigate and organize content"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
    echo -e "${YELLOW}Tip: Press Ctrl+C during auto-play to pause and take over${NC}"
    echo ""
}

autoplay_loop() {
    while true; do
        clear
        cat /etc/motd
        show_autoplay_menu
        read -rp "Select scenario to auto-play: " choice
        case $choice in
            1) /workspace/autoplay.sh page || true ;;
            2) /workspace/autoplay.sh search || true ;;
            3) /workspace/autoplay.sh space || true ;;
            4) /workspace/autoplay.sh hierarchy || true ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

show_mock_menu() {
    echo ""
    echo -e "${CYAN}Run Scenario with Mock API:${NC}"
    echo -e "${YELLOW}(Uses simulated Confluence responses - no real API calls)${NC}"
    echo ""
    echo -e "  ${GREEN}1)${NC} Page Management    - Create, read, update, delete pages"
    echo -e "  ${GREEN}2)${NC} Search & CQL       - Find content using natural language"
    echo -e "  ${GREEN}3)${NC} Space Management   - List and manage spaces"
    echo -e "  ${GREEN}4)${NC} Content Hierarchy  - Navigate and organize content"
    echo -e "  ${GREEN}b)${NC} Back to main menu"
    echo ""
}

mock_loop() {
    while true; do
        clear
        cat /etc/motd
        show_mock_menu
        read -rp "Select scenario to run with mock API: " choice
        case $choice in
            1) CONFLUENCE_MOCK_MODE=true /workspace/autoplay.sh page || true ;;
            2) CONFLUENCE_MOCK_MODE=true /workspace/autoplay.sh search || true ;;
            3) CONFLUENCE_MOCK_MODE=true /workspace/autoplay.sh space || true ;;
            4) CONFLUENCE_MOCK_MODE=true /workspace/autoplay.sh hierarchy || true ;;
            b|B) return ;;
            *) echo -e "${YELLOW}Invalid option${NC}"; sleep 1 ;;
        esac
    done
}

main_menu_loop() {
    while true; do
        clear
        cat /etc/motd
        show_menu
        read -rp "Select option: " choice
        case $choice in
            1)
                if [ "${ENABLE_AUTOPLAY:-false}" = "true" ]; then
                    autoplay_loop
                else
                    echo -e "${YELLOW}Invalid option${NC}"
                    sleep 1
                fi
                ;;
            2)
                if [ "${ENABLE_AUTOPLAY:-false}" = "true" ]; then
                    mock_loop
                else
                    echo -e "${YELLOW}Invalid option${NC}"
                    sleep 1
                fi
                ;;
            3)
                scenarios_loop
                ;;
            4)
                clear
                echo -e "${GREEN}Starting Claude in interactive mode...${NC}"
                echo -e "${YELLOW}Tip: Type 'exit' or press Ctrl+C to return to menu${NC}"
                if [ "${AUTOPLAY_DEBUG:-false}" = "true" ]; then
                    echo -e "${YELLOW}Debug mode enabled${NC}"
                    echo ""
                    claude --debug --dangerously-skip-permissions "Hello, Confluence!" || true
                else
                    echo ""
                    claude --dangerously-skip-permissions "Hello, Confluence!" || true
                fi
                ;;
            5)
                clear
                echo -e "${GREEN}Starting Bash shell...${NC}"
                echo -e "${YELLOW}Tip: Type 'exit' to return to menu${NC}"
                if [ "${AUTOPLAY_DEBUG:-false}" = "true" ]; then
                    echo -e "${YELLOW}     Run 'claude --debug --dangerously-skip-permissions' to start Claude${NC}"
                else
                    echo -e "${YELLOW}     Run 'claude --dangerously-skip-permissions' to start Claude${NC}"
                fi
                echo ""
                /bin/bash -l || true
                ;;
            q|Q)
                echo -e "${GREEN}Goodbye! Thanks for trying Confluence Assistant Skills.${NC}"
                exit 0
                ;;
            *)
                echo -e "${YELLOW}Invalid option${NC}"
                sleep 1
                ;;
        esac
    done
}

# Start the interactive menu
main_menu_loop
