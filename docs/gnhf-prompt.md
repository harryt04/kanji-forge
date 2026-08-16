Go ahead and take in this context as needed: /Users/harry/Documents/git/kanji-forge/AGENTS.md

Then, please see /Users/harry/Documents/git/kanji-forge/docs/FEATURE-PARITY.md and identify a feature that you would like to implement that hasn't been implemented yet. This feature parity document exists as the source of truth and backlog for the final implementation I would like to have for this application which aims to be a clone of the Sticky Study Japanese study app that was available for iOS only but no longer available. 

For your feature, please: 

1. Create a plan to implement the feature in the spirit of what you understand StickyStudy Japanese study app to have. If you can't create such a plan, or the feature you picked to work on is blocked by another feature that hasn't been built yet, find another feature to work on instead. 
2. Implement your plan and then validate that it works as you expected by running the app and logging in with the test account credentials you can find at .env.local 
3. Create testing coverage for it as needed or possible.
  - Update this file if needed: /Users/harry/Documents/git/kanji-forge/docs/implemented-already.md
    (docs/TESTING-COVERAGE.md is archived at docs/archived/TESTING-COVERAGE.md and no longer the live status doc)
4. Update AGENTS.md or other instructions files as needed if your changes warrant it. 
5. Run `npm run prettify` to format your changes
6. Confirm npm run ci passes
  - Fix any issues and repeat this steps 5 and 6 until you've fixed all issues introduced by your implementation in this session. 
7. Commit and push.
8. Mark the feature that you created as implemented 
9. This session is complete! ^_^