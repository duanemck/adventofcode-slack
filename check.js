const axios = require('axios');
const leftPad = require('left-pad');
const rightPad = require('right-pad');

const config = require('./config.json');

const cookie = config.adventSessionCookie;
const url = config.leaderboardUrl;
const webhook = config.slackWebhookUrl;

let firstRun = true;
let lastTotalPoints = null;
let lastboard = [];

axios.defaults.headers.common['cookie'] = cookie;

setInterval(refresh, 60000 * (config.checkIntervalMinutes || 10));
refresh();

function extractLeaderboard(responseData) {
    let leaderboard = [];
    for (let memberId of Object.keys(responseData.members)) {
        let member = responseData.members[memberId];
        leaderboard.push({
            id: memberId,
            name: member.name,
            stars: member.stars,
            score: member.local_score,
        });
    }
    leaderboard.sort((a, b) => {
        if (a.score === b.score) {
            return b.stars - a.stars;
        }
        return b.score - a.score;
    });

    let rank = 1;
    return leaderboard.map(member => {
        member.rank = rank++;
        return member;
    });
}

function buildMemberScore(member, lastRank) {
    let down = lastRank ? member.rank - lastRank > 0 : false;
    let up = lastRank ? member.rank - lastRank < 0 : false;
    let goldstars = member.stars / 2;
    let silverstars = member.stars % 2;
    let trend = up ? config.icons.trendUp : down ? config.icons.trendDown : config.icons.trendSame;
    let name = `\`${rightPad(member.name, 30, ' ')}\``;
    let score = `\`${leftPad(`${member.score}`, 3, ' ')}\``;
    let goldStarsEmojis = `${leftPad('', goldstars, config.icons.goldStar)}`;
    let silverEmojis = `${leftPad('', silverstars, config.icons.silverStar)}`;
    let stars = `${goldStarsEmojis}${silverEmojis}`;

    return `${config.icons.bullet} ${trend} ${score} ${name} ${stars} \n`;
}

function buildMessage(leaderboard, previousBoard) {
    let text = '*Change in leaderboard:*\n\n';
    for (member of leaderboard) {
        let lastDetails = previousBoard.find(m => m.id === member.id);
        let lastRank = lastDetails ? lastDetails.rank : null;

        text += buildMemberScore(member, lastRank);
    }
    return text;
}

function refresh() {
    console.log(`Getting leaderboard`);
    axios
        .get(url)
        .then(response => {
            console.log('Got it');
            let leaderboard = extractLeaderboard(response.data);
            let totalPoints = leaderboard.reduce((total, member) => total + member.score, 0);
            if (totalPoints !== lastTotalPoints) {
                if (!firstRun) {
                    console.log('Looks like something changed, posting to Slack');
                    console.log('-----------------------------------------');
                    let text = buildMessage(leaderboard, lastboard);
                    console.log(text);
                    console.log('-----------------------------------------');

                    axios.post(webhook, {
                        text: text,
                        mrkdwn: true,
                        username: config.botName || 'AdventBot',
                    });
                    firstRun = false;
                } else {
                    console.log('First run so not posting to Slack');
                }
            } else {
                console.log('No changes');
            }
            lastTotalPoints = totalPoints;
            lastboard = leaderboard;
        })
        .catch(err => {
            console.error(err);
        });
}
