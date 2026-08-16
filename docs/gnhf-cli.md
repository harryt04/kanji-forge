gnhf "/Users/harry/Documents/git/kanji-forge/docs/gnhf-prompt.md" \
    --agent codex \
    --stop-when "/Users/harry/Documents/git/kanji-forge/docs/FEATURE-PARITY.md has no more features to implement" \
    --current-branch --push


    
    --max-iterations 40 \
    --max-tokens 5000000 \

gnhf "/Users/harry/Documents/git/kanji-forge/docs/gnhf-ux-prompt.md" \
    --agent codex \
    --stop-when '/Users/harry/Documents/git/kanji-forge/docs/ux-backlog.md has every item in Loops A-E marked [x] or [!]' \
    --current-branch --push \
    --max-iterations 40 \
    --max-tokens 5000000 \

# Browse Wall Workbench — the menubar redesign.
# Loop F must finish first: it builds the signed-in verification path this
# screen has never had. The auth-gated e2e specs skip themselves without
# NEXT_PUBLIC_API_URL, so export it (and keep the local Postgres +
# better-auth stack up) before starting, or every iteration verifies nothing.
NEXT_PUBLIC_API_URL=http://localhost:3000 \
gnhf "/Users/harry/Documents/git/kanji-forge/docs/gnhf-browse-prompt.md" \
    --agent codex \
    --stop-when '/Users/harry/Documents/git/kanji-forge/docs/browse-workbench-backlog.md has every item in Loops F-J marked [x] or [!]' \
    --current-branch --push \
    --max-iterations 40 \
    --max-tokens 5000000 \
