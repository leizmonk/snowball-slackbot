const github = require('octonode');
const token = process.env.GITHUB_TOKEN;
const utils = require('./utils');
let prVitalInfo = [];

const client = github.client(token);

const self = module.exports = {
  // Get repos for each org and creates a array containing [{'org1': 'repo'}, {'org2': 'repo2'}, ...] from that data
  allOrgsRepos: (orgs) => {
    const promiseArr = [];
    const orgList = orgs.split(',');

    orgList.forEach((orgName) => {
      const repos = [];
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.org(orgName).repos({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
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
    const promiseArr = [];

    repos.forEach((repo) => {
      const owner = Object.keys(repo).toString();
      const pulls = [];
      const repoName = repo[owner];

      // Resolves to an array of ['org/repo:PR#']
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.repo(owner + '/' + repoName).prs({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
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
    const promiseArr = [];

    repos.forEach((repo) => {
      const owner = Object.keys(repo).toString();
      const prInfo = [];
      const repoName = repo[owner];

      // Resolves to an array of hashes like 
      // [{author: 'PR author', title: 'PR title', pr_url: 'PR URL', created_at: 'date created'}]
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.repo(owner + '/' + repoName).prs({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
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
  // Assign globally accessible object to contain info on PRs (author, url, title, timestamp)
  referenceOpenPulls: (pullRequestInfo) => {
    prVitalInfo = pullRequestInfo;

    return prVitalInfo;
  },
  // Resolves to an array of hashes like [{'org/repo': 'PR #'}], used for subsequent API calls
  composeRequest: (pullRequestSlug) => {
    promiseArr = [];

    pullRequestSlug.forEach((slug) => {
      const params = {};
      const repo = slug.split(':')[0];
      const pullNumber = slug.split(':')[1];

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
      const repoStr = Object.keys(request).toString();
      const pullNum = Number(Object.values(request));
      const changes = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          client.pr(repoStr, pullNum).reviews((err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
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
  // Resolves to an array of hashes containing info on PRs and changes requested
  // Will return an empty array if no changes are requested
  mapChangesRequestedToPRs: (changes) => {
    promiseArr = [];

    prVitalInfo.forEach((item, i) => {
      const changesRequested = [];

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
      const repoStr = Object.keys(request).toString();
      const pullNum = Number(Object.values(request));
      const reviewRequests = [];
      
      promiseArr.push(
        new Promise((resolve, reject) => {
          client.pr(repoStr, pullNum).reviewRequests((err, data, headers) => {
            if (err) {
              reject(err);
            } else { 
              for (let i in data) {
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
    const requestedReviewers = prVitalInfo.map((item, i) => {
      const formatted = {};
      formatted['author'] = item.author,
      formatted['created'] = item.created_at,
      formatted['pr_url'] = item.pr_url,
      formatted['pr_title'] = item.title,
      formatted['reviewers_requested'] = reviewers[i];

      return formatted;
    });

    return requestedReviewers;
  },
  // Resolves to an array of hashes containing info on approved PRs not yet merged
  allApprovedPulls: (requests) => {
    promiseArr = [];

    // Iterates over the hash above to retrieve reviews for each PR
    requests.forEach((request) => {
      const repoStr = Object.keys(request).toString();
      const pullNum = Number(Object.values(request));
      const approved = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          client.pr(repoStr, pullNum).reviews((err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
                if (data[i]['state'] == ['APPROVED']) {
                  const partialLink = data[i]['_links']['html']['href'].toString().split('https://github.com').pop();
                  const slug = partialLink.substring(0, partialLink.indexOf('#'));
                  approved.push(slug);
                }
              }
            }
            resolve(approved);
          });
        })
      )
    });

    return Promise.all(promiseArr);
  },
  // Resolves to an array of hashes containing info on approved PRs not yet merged
  // Will return an empty array of reviewers requested if there are none 
  mapApprovedPulls: (approved) => {
    const urlSlugs = [].concat(...approved.filter(slug => slug.length));
    const matchingPrs = [];

    for (let i in urlSlugs) {
      matchingPrs.push(...prVitalInfo.filter(obj => obj.pr_url.match(urlSlugs[i])))
    }

    return matchingPrs;
  },
  // Generic function to call the GitHub API
  callApi: (url) => {
    const headers = {
      'Authorization': 'token ' + token,
      'User-Agent': 'Request-Promise'
    };

    return client.get(url, {}, (err, status, data, headers) => {
      if (err) {
        console.log('There was an error: ', err);
        console.log('Status code: ', status);
      } else {
        return(data);
      }
    });
  }
}
