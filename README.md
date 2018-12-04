# Advent of Code Slack bot

This simple script fetches an Advent of Code private leaderboard and posts changes to a Slack channel

## Setup

1. Clone this repo
1. Run `npm install` OR `yarn`
1. Get the JSON url of your private leaderboard:
    1. From the HTML version of the page, click `[API]` in the paragraph at the top
    1. In the new paragraph that appears, click `[JSON]`
    1. Copy the URL
    1. Open your dev tools and copy the cookie starting with `session=`
1. Add an `incoming webhook` to your Slack channel. There's plenty of info online about how to do that.
1. This tool uses some standard Slack emoji, but 2 custom ones are required (they are in the icons folder):
    1. Add them to Slack as custom emojis:
        - `:silver-star:`
        - `:blank:`
    1. _NOTE:_ You can also just use your own emoji, just update config.json with the relavent Slack keys
1. Add the 2 URLs and cookie mentioned above to config.json
1. Run `node check.js`
    1. On first run it just gets the leaderboard but does nothing
    1. It will run every 10 minutes by default (override in `config.json`)
    1. If something has changed, the new leaderboard will be posted to Slack
    1. It will post as "AdventBot", also configurable in `config.json`
