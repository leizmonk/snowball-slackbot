const github = require('./github');
const os = require('os');
const path = require('path');
const slackBot = require('slackbots');
const utils = require('./utils');
const _ = require('lodash');

// Replace these with your team's info
// Two mappings: GH usernames to Slack user IDs, and GH usernames to Slack user names
const slackIds = utils.readConfig(path.join(os.homedir(), '.ghslackids'));
const githubUsers = utils.readConfig(path.join(os.homedir(), '.ghslackusers'));

// Configurable settings
const interval = parseFloat(process.env.GITHUB_SLACK_REMINDER_INTERVAL) || 2;
const orgs = process.env.ORGANIZATIONS;
const workStart = 10; // Start of the workday in hours
const workEnd = 18; // End of workday

// Create instance of the bot
const bot = new slackBot({
  name: 'snowball',
  token: process.env.REMINDER_TOKEN
});

let snoozed = [];

function start() {
  bot.on('start', (data) => {
    const params = {
      icon_url: 'https://avatars.slack-edge.com/2017-05-23/186302031456_247b555e470ae075e2a4_48.jpg',
      as_user: false
    };

    // Get all open pull requests for reference
    getOpenPullRequests = (orgs) => {
      github.allOrgsRepos(orgs).then(orgRepos => {
        const repos = [].concat(...orgRepos);
        return github.getOpenPullRequestInfo(repos);
      }).then(prInfo => {
        const pullInfo = [].concat(...prInfo);
        return github.referenceOpenPulls(pullInfo);
      }).catch((err) => {
        console.log(err);
      });
    }

    // Get all approved PRs that haven't been merged
    getApprovedPullRequests = (orgs, githubUser) => {
      github.allOrgsRepos(orgs).then(orgRepos => {
        const repos = [].concat(...orgRepos);
        return github.composePullRequestSlugs(repos);
      }).then(prSlugs => {
        const slugs = [].concat(...prSlugs);
        return github.composeRequest(slugs);
      }).then(requestArgs => {
        const requests = [].concat(...requestArgs);
        return github.allApprovedPulls(requests);
      }).then(approved => {
        return github.mapApprovedPulls(approved);
      }).then(approvedPulls => {
        messageApproved(approvedPulls, githubUser);
      }).catch((err) => {
        console.log(err);
      });
    }

    // Get all changes requested
    getChangesRequested = (orgs, githubUser) => {
      github.allOrgsRepos(orgs).then(orgRepos => {
        const repos = [].concat(...orgRepos);  
        return github.composePullRequestSlugs(repos);
      }).then(prSlugs => {
        const slugs = [].concat(...prSlugs);
        return github.composeRequest(slugs);
      }).then(requestArgs => {
        const requests = [].concat(...requestArgs);
        return github.allChangesRequested(requests);
      }).then(changes => {
        return github.mapChangesRequestedToPRs(changes);
      }).then(changesRequested => {
        const allChanges = [].concat(...changesRequested);
        return messageAuthors(allChanges, githubUser);
      }).catch((err) => {
        console.log(err);
      });
    }

    // Get all reivewers requested
    getReviewersRequested = (orgs, githubUser) => {
      github.allOrgsRepos(orgs).then(orgRepos => {
        const repos = [].concat(...orgRepos);
        return github.composePullRequestSlugs(repos);
      }).then(prSlugs => {
        const slugs = [].concat(...prSlugs);
        return github.composeRequest(slugs);
      }).then(requestArgs => {
        const requests = [].concat(...requestArgs);
        return github.allReviewsRequested(requests);
      }).then(reviews => {
        return github.mapReviewsRequestedtoPRs(reviews);
      }).then(reviewersRequested => {
        const allReviewers = [].concat(...reviewersRequested);
        return messageReviewers(allReviewers, githubUser);
      }).catch((err) => {
        console.log(err);
      });
    }

    // TODO: For each PR author who has changes requested, goal is to send
    // one message per PR that includes usernames of all reviewers
    // that requested changes. Right now this only provides the first reviewer
    // that requested changes.
    messageAuthors = (allChanges, githubUser) => {
      allChanges.forEach((pullRequest) => {
        const author = pullRequest['author'];
        const created = new Date(pullRequest['created']).toString();
        const notSnoozed = !snoozed.includes(slackIds[author]);
        const recipient = githubUsers[author];
        const title = pullRequest['pr_title'];
        const url = pullRequest['pr_url'];
        const changesRequested = Object.values(pullRequest['changes_requested']);

        const message = 
          "Reviewers on these PRs by you have requested changes. " +
          "Make some changes, or close the PR. Otherwise, I'll keep bothering you about it. " +
          "\nPRs requiring changes: \n" +
          "\tTitle: " + title + "\n" +
          "\tLink: " + url + "\n" + 
          "\tCreated at: " + created + "\n" +
          "\tChanges requested by: " + requesters;

        // Changes requested reminders without filtering for a specific user
        if (changesRequested.length && githubUser == undefined) {
          var requesters = Object.keys(changesRequested[0]);

          if (notSnoozed) {
            console.log(recipient, message, params);
            bot.postMessageToUser(recipient, message, params);
          }
        // This filters for a specific user for on demand reminders
        } else if (changesRequested.length && githubUser != undefined) {
          var requesters = Object.keys(changesRequested[0]);

          if (notSnoozed && recipient == githubUser) {
            console.log(recipient, message, params);
            bot.postMessageToUser(recipient, message, params);
          }
        }
      });
    }

    // Message all authors with approved PRs that haven't been merged
    messageApproved = (allApprovedPRs, githubUser) => {
      allApprovedPRs.forEach((pullRequest) => {
        const author = pullRequest['author'];
        const created = new Date(pullRequest['created_at']).toString();
        const notSnoozed = !snoozed.includes(slackIds[author]);
        const recipient = githubUsers[author];
        const title = pullRequest['title'];
        const url = pullRequest['pr_url'];

        const message = 
          "You have a PR that's been approved and can be merged. " +
          "Please merge this PR soon or I'll keep pestering you about it. " +
          "\nApproved PRs that can be merged: \n" +
          "\tTitle: " + title + "\n" +
          "\tLink: " + url + "\n" + 
          "\tCreated at: " + created;

        // Changes requested reminders without filtering for a specific user
        if (allApprovedPRs.length && githubUser == undefined) {
          if (notSnoozed) {
            console.log(recipient, message, params);
            bot.postMessageToUser(recipient, message, params);
          }
        // This filters for a specific user for on demand reminders
        } else if (allApprovedPRs.length && githubUser != undefined) {
          if (notSnoozed && recipient == githubUser) {
            console.log(recipient, message, params);
            bot.postMessageToUser(recipient, message, params);
          }
        }
      });
    }

    // Message all users who have been requested to review a pull request
    messageReviewers = (allReviewers, githubUser) => {
      allReviewers.forEach((pullRequest) => {
        const author = pullRequest['author'];
        const created = new Date(pullRequest['created']).toString();
        const title = pullRequest['pr_title'];
        const url = pullRequest['pr_url'];
        const reviewersRequested = pullRequest['reviewers_requested'];

        const message = 
          "You've been asked to review the following PR. " +
          "Review it or I'll keep bothering you about it. " + "\n" +
          "\tTitle: " + title + "\n" +
          "\tAuthor: " + author + "\n" +
          "\tLink: " + url + "\n" + 
          "\tCreated at: " + created + "\n";

        // Reviewers requested reminders without filtering for a specific user
        if (reviewersRequested.length && githubUser == undefined) {
          for (let i in reviewersRequested) {
            var reviewer = reviewersRequested[i]['login'];

            if (!snoozed.includes(slackIds[reviewer])) {
              console.log(githubUsers[reviewer], message, params);
              bot.postMessageToUser(githubUsers[reviewer], message, params);
            }
          }
        // This filters for a specific user for on demand reminders
        } else if (reviewersRequested.length && githubUser != undefined) {
          for (let i in reviewersRequested) {
            var reviewer = reviewersRequested[i]['login'];
            const recipient = githubUsers[reviewer];

            if (!snoozed.includes(slackIds[reviewer]) && recipient == githubUser) {
              console.log(recipient, message, params);
              bot.postMessageToUser(recipient, message, params);
            }
          }
        }
      });
    }

    // Gets Slack username from ID then passes to functions that retrieve reminders
    remindUser = (slackUserId) => {
      const githubUser = _.findKey(slackIds, _.partial(_.isEqual, slackUserId));
      const slackUser = githubUsers[githubUser];

      bot.postMessageToUser(slackUser, "If you have any pending remidners, they will show up below shortly." + "\n" + 
        "If nothing shows up, then you're in the clear!", params);

      // These reminders will be filtered for the user requesting the reminders
      getApprovedPullRequests(orgs, githubUser);
      getChangesRequested(orgs, githubUser);
      getReviewersRequested(orgs, githubUser);
    }

    // Poller sets the bot to check every check for changes/reviews requested 
    // every 2 hours or every interval that's set by the user
    init = () => {
      const now = new Date();
      const hours = now.getHours();
      const day = now.getDay();

      // Only execute the poller when it's during working hours on weekdays
      if (hours >= workStart && hours < workEnd && day != 0 && day != 6) {
        getOpenPullRequests(orgs);
        getApprovedPullRequests(orgs);
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

  // Mostly easter eggs
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
      const slackUser = githubUsers[_.findKey(slackIds, _.partial(_.isEqual, data.user))];

      if (not_snowball) {
        if (checkText('snuffles')) {
          bot.postMessage(channel, "Do not call me that! Snuffles was my slave name. You shall now call me Snowball, because my fur is pretty and white.", params);
        }
        if (checkText('morty')) {
          bot.postMessage(channel, "You can call me Snuffles, Morty, and I'm going to miss you, too, very much.", params);
        }
        if (checkText('jerry')) {
          bot.postMessage(channel, "Jerry, come to rub my face in urine again?", params);
        }
        if (checkText('summer')) {
          bot.postMessage(channel, "Where are my testicles, Summer? They were removed. Where have they gone?", params);
        }
        // Fetch command, on demand reminders
        if (checkText('snowball-fetch')) {
          remindUser(data.user);
        }
        // Snooze command
        if (checkText('snowball-snooze')) {
          // Don't push to snoozed if user already is in the array
          if (!snoozed.includes(data.user)) {
            snoozed.push(data.user);
            bot.postMessageToUser(slackUser, "OK, I'll snooze your reminders until tomorrow.", params);          
          } else {
            bot.postMessageToUser(slackUser, "You've already snoozed reminders for today.", params);
          }
        }
        // Resume reminders command
        if (checkText('snowball-resume')) {
          // Check if user is snoozed
          if (snoozed.includes(data.user) && snoozed.length) {
            let user = snoozed.indexOf(data.user);
            snoozed.splice(user, 1);
            bot.postMessageToUser(slackUser, "OK, I'll start sending reminders to you again.", params);
          } else {
            bot.postMessageToUser(slackUser, "You haven't snoozed reminders.", params);
          }
        }
      }
    }
  });
}
exports = modules.exports = snowball;
