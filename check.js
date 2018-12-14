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
            starList: member.completion_day_level,
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

    let trend = up ? config.icons.trendUp : down ? config.icons.trendDown : config.icons.trendSame;
    let name = `\`${rightPad(member.name, 30, ' ')}\``;
    let score = `\`${leftPad(`${member.score}`, 3, ' ')}\``;

    let stars = '';
    let daysCompleted = Object.keys(member.starList);
    let lastDayCompleted = daysCompleted[daysCompleted.length - 1];
    for (let key = 0; key <= lastDayCompleted; key++) {
        let day = member.starList[key];
        if (!day) {
            stars += config.icons.noStar;
        } else {
            stars += day[2] ? config.icons.goldStar : config.icons.silverStar;
        }
    }
    return `${config.icons.bullet} ${trend} ${score} ${name} ${stars} \n`;
}

function header() {
    let oneToTen = ':one::two::three::four::five::six::seven::eight::nine::zero:';
    let oneToFive = ':one::two::three::four::five:';

    let line1 = `   ${leftPad('', 23, config.icons.blank)}${leftPad('', 10, ':one:')}${leftPad('', 6, ':two:')}`;
    let line2 = `   ${leftPad('', 14, config.icons.blank)}${oneToTen}${oneToTen}${oneToFive}`;
    return `${line1}\n${line2}\n`;
}

function buildMessage(leaderboard, previousBoard) {
    let text = '*Change in leaderboard:*\n\n';
    text += header();
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
                } else {
                    console.log('First run so not posting to Slack');
                }
            } else {
                console.log('No changes');
            }
            firstRun = false;
            lastTotalPoints = totalPoints;
            lastboard = leaderboard;
        })
        .catch(err => {
            console.error(err);
        });
}
