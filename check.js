const axios = require('axios');
const leftPad = require('left-pad');
const rightPad = require('right-pad');

const config = require('./config.json');
const fs = require('fs');

const cookie = config.adventSessionCookie;
const url = config.leaderboardUrl;
const webhook = config.slackWebhookUrl;

const lastCheckFile = `lastCheck.json`;
const formatDistance = require('date-fns/formatDistance');

let firstRun = true;
let forcedSlack = false;
let lastTotalPoints = null;
let lastboard = [];

axios.defaults.headers.common['cookie'] = cookie;

if (fs.existsSync(lastCheckFile)) {
  let restoredState = JSON.parse(fs.readFileSync(lastCheckFile));
  if (restoredState) {
    console.log(`Restored state from file`);
    lastTotalPoints = restoredState.lastTotalPoints || null;
    lastboard = restoredState.lastboard || [];
    firstRun = false;
  }
}

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

  let rankChange = lastRank ? member.rank - lastRank : 0;
  //rankChange = Math.floor(Math.random() * 10) - 5;
  let rankChangeP = `\`${rightPad(`${Math.abs(rankChange) > 0 ? Math.abs(rankChange) : ' '}`, 2, ' ')}\``

  let down = rankChange > 0;
  let up = rankChange < 0;

  let trend = up ? `${config.icons.trendUp}${rankChangeP}` : down ? `${config.icons.trendDown}${rankChangeP}` : `${config.icons.trendSame}${config.icons.trendSame}`;
  let rank = `\`${leftPad(`${member.rank}`, 2, ' ')}\``;
  let name = `\`${rightPad(member.name || 'Anon', 30, ' ')}\``;
  let score = `\`${leftPad(`${member.score}`, 3, ' ')}\``;

  let stars = '';
  let daysCompleted = Object.keys(member.starList);
  let lastDayCompleted = +daysCompleted[daysCompleted.length - 1];
  for (let key = 1; key <= lastDayCompleted; key++) {
    let day = member.starList[key];
    if (!day) {
      stars += config.icons.noStar;
    } else {
      stars += day[2] ? config.icons.goldStar : config.icons.silverStar;
    }
  }
  if (stars != '') {
    for (let i = 0; i < 25 - lastDayCompleted; i++) {
      stars = `${stars}:blank:`;
    }
  }
  var lastStarAgo = '';
  if (lastDayCompleted > 0) {
    let lastStar = member.starList[lastDayCompleted][2] ? member.starList[lastDayCompleted][2].get_star_ts : member.starList[lastDayCompleted][1].get_star_ts;
    var date = new Date(lastStar * 1000);
    lastStarAgo = `Last star achieved ${formatDistance(date, new Date())} ago`;
  }
  return `${config.icons.bullet} ${rank} ${trend} ${score} ${name} ${stars || ''} ${lastStarAgo} \n`;
}

function header() {
  let oneToTen = ':one::two::three::four::five::six::seven::eight::nine::zero:';
  let oneToFive = ':one::two::three::four::five:';

  let line1 = `   ${leftPad('', 25, config.icons.blank)}${leftPad('', 10, ':one:')}${leftPad('', 6, ':two:')}`;
  let line2 = `   ${leftPad('', 16, config.icons.blank)}${oneToTen}${oneToTen}${oneToFive}`;
  return `${line1}\n${line2}\n`;
}

const chunkSize = 10;
function getChunk(leaderboard, chunkNumber) {
  let start = chunkNumber * chunkSize;
  let end = start + chunkSize;
  return leaderboard.slice(start, end);
}

function buildMessage(leaderboard, previousBoard) {
  let messages = [];
  let text = '*Change in leaderboard:*\n\n';
  text += header();

  let chunkNumber = 0;
  chunk = getChunk(leaderboard, chunkNumber);
  chunkNumber++;

  while (chunk.length) {
    let chunkText = text;
    for (member of chunk) {
      let lastDetails = previousBoard.find(m => m.id === member.id);
      let lastRank = lastDetails ? lastDetails.rank : null;

      chunkText += buildMemberScore(member, lastRank);
    }
    messages.push(chunkText);
    chunk = getChunk(leaderboard, chunkNumber);
    chunkNumber++;
    text = '';
  }
  return messages;
}

async function sleep(msec) {
  return new Promise(resolve => setTimeout(resolve, msec));
}

async function postToSlack(messages) {
  console.log(`Posting ${messages.length} messages to slack`);

  for (let i = 0; i < messages.length; i++) {
    console.log(`Posting message ${i + 1}`);
    await axios.post(webhook, {
      text: messages[i],
      mrkdwn: true,
      username: config.botName || 'AdventBot',
      icon_emoji: config.botIcon
    });
    console.log(`Small Delay to ensure order`);
    await sleep(2000);
  }
  console.log(`Finished`);
}

async function refresh() {
  console.log(new Date());
  console.log(`Getting leaderboard`);
  axios
    .get(url)
    .then(async response => {

      console.log('Got it');
      let leaderboard = extractLeaderboard(response.data);
      let totalPoints = leaderboard.reduce((total, member) => total + member.score, 0);
      if (forcedSlack || (totalPoints !== lastTotalPoints)) {
        if (!firstRun || forcedSlack) {
          console.log('Looks like something changed, posting to Slack');
          await postToSlack(buildMessage(leaderboard, lastboard));
        } else {
          console.log('First run so not posting to Slack');
        }
      } else {
        console.log('No changes');
      }
      firstRun = false;
      lastTotalPoints = totalPoints;
      lastboard = leaderboard;
      let savedState = {
        lastTotalPoints,
        lastboard
      };

      fs.writeFile(lastCheckFile, JSON.stringify(savedState), 'utf8', () => { });
    })
    .catch(err => {
      console.error(err);
    });
}
