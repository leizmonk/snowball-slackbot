const github = require('./github');
const slackBot = require('slackbots');
const utils = require('./utils');

// Replace these with your team's info
// Two mappings: GH usernames to Slack user IDs, and GH usernames to Slack user names
var slackIDs = require('./config/slack_ids-github_users.json');
var githubUsers = require('./config/github-slack_users.json');

// Configurable settings
var interval = parseFloat(process.env.GITHUB_SLACK_REMINDER_INTERVAL) || 2;
var orgs = process.env.ORGANIZATIONS;
var workStart = 10; // Start of the workday in hours
var workEnd = 18; // End of workday

// Create instance of the bot
const bot = new slackBot({
  name: 'snowball',
  token: process.env.REMINDER_TOKEN
});

var snoozed = [];

bot.on('start', (data) => {
  const params = {
    icon_url: 'https://avatars.slack-edge.com/2017-05-23/186302031456_247b555e470ae075e2a4_48.jpg',
    as_user: false
  };

  // Get all open pull requests for reference
  getOpenPullRequests = (orgs) => {
    github.allOrgsRepos(orgs).then(orgRepos => {
      var repos = [].concat(...orgRepos);
      return github.getOpenPullRequestInfo(repos);
    }).then(prInfo => {
      var pullInfo = [].concat(...prInfo);
      return github.referenceOpenPulls(pullInfo);
    }).catch((err) => {
      console.log(err);
    });
  }

  // Get all changes requested
  getChangesRequested = (orgs) => {
    github.allOrgsRepos(orgs).then(orgRepos => {
      var repos = [].concat(...orgRepos);  
      return github.composePullRequestSlugs(repos);
    }).then(prSlugs => {
      var slugs = [].concat(...prSlugs);
      return github.composeRequest(slugs);
    }).then(requestArgs => {
      var requests = [].concat(...requestArgs);
      return github.allChangesRequested(requests);
    }).then(changes => {
      return github.mapChangesRequestedToPRs(changes);
    }).then(changesRequested => {
      var allChanges = [].concat(...changesRequested);
      return messageAuthors(allChanges);
    }).catch((err) => {
      console.log(err);
    });
  }

  // Get all reivewers requested
  getReviewersRequested = (orgs) => {
    github.allOrgsRepos(orgs).then(orgRepos => {
      var repos = [].concat(...orgRepos);
      return github.composePullRequestSlugs(repos);
    }).then(prSlugs => {
      var slugs = [].concat(...prSlugs);
      return github.composeRequest(slugs);
    }).then(requestArgs => {
      var requests = [].concat(...requestArgs);
      return github.allReviewsRequested(requests);
    }).then(reviews => {
      return github.mapReviewsRequestedtoPRs(reviews);
    }).then(reviewersRequested => {
      var allReviewers = [].concat(...reviewersRequested);
      return messageReviewers(allReviewers);
    }).catch((err) => {
      console.log(err);
    });
  }

  // TODO: For each PR author who has changes requested, goal is to send
  // one message per PR that includes usernames of all reviewers
  // that requested changes. Right now this only provides the first reviewer
  // that requested changes.
  messageAuthors = (allChanges) => {
    allChanges.forEach((pullRequest) => {
      var author = pullRequest['author'];
      var created = new Date(pullRequest['created']).toString();
      var title = pullRequest['pr_title'];
      var url = pullRequest['pr_url'];
      var changesRequested = Object.values(pullRequest['changes_requested']);

      if (changesRequested.length) {
        var requesters = Object.keys(changesRequested[0]);
        var message = 
          "Reviewers on these PRs by you have requested changes. " +
          "Make some changes, or close the PR. Otherwise, I'll keep bothering you about it. " +
          "\nPRs requiring changes: \n" +
          "\tTitle: " + title + "\n" +
          "\tLink: " + url + "\n" + 
          "\tCreated at: " + created + "\n" +
          "\tChanges requested by: " + requesters;

        if (!snoozed.includes(slackIDs[author])) {
          console.log(githubUsers[author], message, params);
          bot.postMessageToUser(githubUsers[author], message, params);
        }
      }
    });
  }

  messageReviewers = (allReviewers) => {
    allReviewers.forEach((pullRequest) => {
      var author = pullRequest['author'];
      var created = new Date(pullRequest['created']).toString();
      var title = pullRequest['pr_title'];
      var url = pullRequest['pr_url'];
      var reviewersRequested = pullRequest['reviewers_requested'];

      if (reviewersRequested.length) {
        for (var i in reviewersRequested) {
          var reviewer = reviewersRequested[i]['login'];

          var message = 
            "You've been asked to review the following PR. " +
            "Review it or I'll keep bothering you about it. " + "\n" +
            "\tTitle: " + title + "\n" +
            "\tAuthor: " + author + "\n" +
            "\tLink: " + url + "\n" + 
            "\tCreated at: " + created + "\n";

          if (!snoozed.includes(slackIDs[reviewer])) {
            console.log(githubUsers[reviewer], message, params);
            bot.postMessageToUser(githubUsers[reviewer], message, params);
          }
        }
      }
    });
  }

  // Poller sets the bot to check every check for changes/reviews requested 
  // every 2 hours or every interval that's set by the user
  init = () => {
    var now = new Date();
    var hours = now.getHours();
    var day = now.getDay();

    // Only execute the poller when it's during working hours on weekdays
    if (hours >= workStart && hours < workEnd && day != 0 && day != 6) {
      getOpenPullRequests(orgs);
      getChangesRequested(orgs);
      getReviewersRequested(orgs);
      
      setTimeout(init, interval * 60 * 60 * 1000);
    } else {
      console.log('All work and no play makes Jack a dull boy.');

      // Polls every 15 min to check if we're back in work hours
      setTimeout(init, interval * 60 * 7500);
    }

    // Clear snoozes at end of each work day
    if (hours > workEnd && snoozed.length) {
      snoozed.length = 0;
    }
  }

  init();
});

// Mostly easter eggs, TODO: restore 'snowball-fetch', easter egg: profanity responder
bot.on('message', (data) => {
  const params = {
    icon_url: 'https://avatars.slack-edge.com/2017-05-23/186302031456_247b555e470ae075e2a4_48.jpg',
    as_user: false
  };

  if(data.type === 'message') {
    if(data.username === 'snowball') {
      return;
    }

    checkText = (msg) => {
      if (data.text.toLowerCase().indexOf(msg) !== -1) {
        return true;
      }
    }

    const channel = data.channel;
    const not_snowball = (data.username != 'snowball');

    if (not_snowball) {
      if (checkText('snuffles')) {
        bot.postMessage(channel, 'Do not call me that! Snuffles was my slave name. You shall now call me Snowball, because my fur is pretty and white.', params);
      }
      if (checkText('morty')) {
        bot.postMessage(channel, "You can call me Snuffles, Morty, and I'm going to miss you, too, very much.", params);
      }
      if (checkText('jerry')) {
        bot.postMessage(channel, 'Jerry, come to rub my face in urine again?', params);
      }
      if (checkText('summer')) {
        bot.postMessage(channel, 'Where are my testicles, Summer? They were removed. Where have they gone?', params);
      }
      // Snooze command
      if (checkText('snowball-snooze')) {
        // Don't push to snoozed if user already is in the array
        if (!snoozed.includes(data.user)) {
          snoozed.push(data.user);
        }
        bot.postMessage(data.user, "OK, I'll snooze your reminders until tomorrow", params);
      }
      // Resume reminders command
      if (checkText('snowball-resume')) {
        // Check if user is snoozed
        if (snoozed.includes(data.user) && snoozed.length) {
          var user = snoozed.indexOf(data.user);
          snoozed.splice(user, 1);
        } else {
          bot.postMessage(data.user, "You haven't snoozed reminders.", params);
        }
        bot.postMessage(data.user, "OK, I'll start sending reminders to you again.", params);
      }      
    }
  }
});
