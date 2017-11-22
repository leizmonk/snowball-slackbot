const github = require('octonode');
const token = process.env.GITHUB_TOKEN;
const utils = require('./utils');
var prVitalInfo = [];

const client = github.client(token);

var self = module.exports = {
  // Get repos for each org and creates a array containing [{'org1': 'repo'}, {'org2': 'repo2'}, ...] from that data
  allOrgsRepos: (orgs) => {
    var promiseArr = [];
    var orgList = orgs.split(',');

    orgList.forEach((orgName) => {
      var repos = [];
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.org(orgName).repos({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (var i in data) {
                repos.push({[data[i]['owner']['login']]: data[i]['name']}); 
              }
            }
            resolve(repos);
          });
        })
      )
    });
    return Promise.all(promiseArr);
  },
  // Composes pull request slugs for subsequent API calls
  composePullRequestSlugs: (repos) => {
    var promiseArr = [];

    repos.forEach((repo) => {
      var owner = Object.keys(repo).toString();
      var pulls = [];
      var repoName = repo[owner];

      // Resolves to an array of ['org/repo:PR#']
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.repo(owner + '/' + repoName).prs({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (var i in data) {
                pulls.push(data[i]['url'].replace('https://api.github.com/repos/','').replace('/pulls/', ':'));
              }
            }
            resolve(pulls);
          });
        })
      )  
    });

    return Promise.all(promiseArr);
  },
  // Grabs all open pull requests for all repos in all orgs
  getOpenPullRequestInfo: (repos) => {
    var promiseArr = [];

    repos.forEach((repo) => {
      var owner = Object.keys(repo).toString();
      var prInfo = [];
      var repoName = repo[owner];

      // Resolves to an array of hashes like 
      // [{author: 'PR author', title: 'PR title', pr_url: 'PR URL', created_at: 'date created'}]
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.repo(owner + '/' + repoName).prs({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (var i in data) {
                prInfo.push({
                  'author': data[i]['user']['login'],
                  'title': data[i]['title'],
                  'pr_url': data[i]['html_url'],
                  'created_at': data[i]['created_at']
                });
              }
            }
            resolve(prInfo);
          });
        })
      )      
    });

    return Promise.all(promiseArr);
  },
  // Assign globally accessible variable to contain the array of [{'PR author': 'PR URL'}]
  referenceOpenPulls: (pullRequestInfo) => {
    prVitalInfo = pullRequestInfo;

    return prVitalInfo;
  },
  // Resolves to an array of hashes like [{'org/repo': 'PR #'}], used for subsequent API calls
  composeRequest: (pullRequestSlug) => {
    promiseArr = [];

    pullRequestSlug.forEach((slug) => {
      var params = {};
      var repo = slug.split(':')[0];
      var pullNumber = slug.split(':')[1];

      params[repo] = pullNumber;
      requestArgs = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          requestArgs.push(params);
          resolve(requestArgs);
        })
      )
    });

    return Promise.all(promiseArr);
  },
  // Resolves to an array of hashes containing info on changes requested for pull requests
  // If no changes were requested on a PR this returns an empty array for that pull request
  allChangesRequested: (requests) => {
    promiseArr = [];

    // Iterates over the hash above to retrieve reviews for each PR
    requests.forEach((request) => {
      var repoStr = Object.keys(request).toString();
      var pullNum = Number(Object.values(request));
      var changes = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          client.pr(repoStr, pullNum).reviews((err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (var i in data) {
                if (data[i]['state'] == ['CHANGES_REQUESTED']) {
                  changes.push({[data[i]['user']['login']]: data[i]['html_url']});
                }
              }
            }
            resolve(changes);
          });
        })
      )
    });

    return Promise.all(promiseArr);
  },
  // Resolves to an array of hashes containing info on PRs and reviewers requested
  // Will return an empty array of reviewers requested if there are none  
  mapChangesRequestedToPRs: (changes) => {
    promiseArr = [];

    prVitalInfo.forEach((item, i) => {
      var changesRequested = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          changesRequested.push({
            author: item.author,
            created: item.created_at,
            pr_url: item.pr_url,
            pr_title: item.title,
            changes_requested: changes[i]
          });

          resolve(changesRequested);
        })
      )
    });

    return Promise.all(promiseArr);
  },
  // Resolves to an array of hashes containing info on requested reviewers for pull requests
  // If no reviewer was requested on a PR this returns an empty array for that pull request
  allReviewsRequested: (requests) => {
    promiseArr = [];

    // Iterates over the hash above to retrieve reviews for each PR
    requests.forEach((request) => {
      var repoStr = Object.keys(request).toString();
      var pullNum = Number(Object.values(request));
      var reviewRequests = [];
      
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.pr(repoStr, pullNum).reviewRequests((err, data, headers) => {
            if (err) {
              reject(err);
            } else { 
              for (var i in data) {
                reviewRequests.push(data[i]);
              }
            }
            resolve(reviewRequests);
          });
        })
      )
    });  

    return Promise.all(promiseArr);
  },
  // Returns an array of hashes containing info on PRs and reviewers requested
  // Will return an empty array of reviewers requested if there are none
  mapReviewsRequestedtoPRs: (reviewers) => {
    var requestedReviewers = prVitalInfo.map((item, i) => {
      var formatted = {};
      formatted['author'] = item.author,
      formatted['created'] = item.created_at,
      formatted['pr_url'] = item.pr_url,
      formatted['pr_title'] = item.title,
      formatted['reviewers_requested'] = reviewers[i];

      return formatted;
    });

    return requestedReviewers
  },
  // Generic function to call the GitHub API
  callApi: (url) => {
    const baseUrl = 'https://api.github.com/';
    var fullUrl = baseUrl + url;
    var headers = {
      'Authorization': 'token ' + token,
      'User-Agent': 'Request-Promise-Native'
    };

    return client.get(fullUrl, {}, (err, status, data, headers) => {
      if (err) {
        console.log('There was an error: ', err);
        console.log('Status code: ', status);
      } else {
        console.log(data);
        return(data);
      }
    });
  }
}
