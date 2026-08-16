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

gnhf "/Users/harry/Documents/git/kanji-forge/docs/gnhf-browse-prompt.md" \
    --agent codex \
    --stop-when '/Users/harry/Documents/git/kanji-forge/docs/browse-workbench-backlog.md has every item in Loops F-J marked [x] or [!]' \
    --current-branch --push \
    --max-iterations 40 \
    --max-tokens 5000000 \
