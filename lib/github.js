const github = require('octonode');
const token = process.env.GITHUB_TOKEN;
const utils = require('./utils');
const _ = require('lodash');

let prVitalInfo = [];

const client = github.client(token);

const self = module.exports = {
  // Iteratively retrieve all repos associated with all orgs listed
  allOrgsRepos: (orgs) => {
    const promiseArr = [];
    const orgList = orgs.split(',');

    // Iterate through each org, retrieve the repo owner name and repo name itself
    orgList.forEach((orgName) => {
      const repos = [];
      promiseArr.push(
        new Promise((resolve, reject) => {
          // Make an API call with each repo name in the orgList using octonode's .repos method
          client.org(orgName).repos({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
                // Push these values to a repos array that will be used in subsequent API calls
                repos.push({[data[i]['owner']['login']]: data[i]['name']}); 
              }
            }
            // Resolves to [{'org1': 'repo'}, {'org2': 'repo2'}, ...]            
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

    // Takes in the array from the previous function, 
    // retrieves the values for each owner and repo
    repos.forEach((repo) => {
      const owner = Object.keys(repo).toString();
      const pulls = [];
      const repoName = repo[owner];

      // For each repo, compose a partial URL containing org, repo and PR info
      promiseArr.push(
        new Promise((resolve, reject) => {
          // Make an API call to get PRs for each repo and owner with a partial URL made of 
          // owner/repo_name using octonode's .repo and .prs methods
          client.repo(owner + '/' + repoName).prs({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
                // Push values of org, repo, and PR #s to an array for use in subsequent API calls (composeRequest)
                pulls.push(data[i]['url'].replace('https://api.github.com/repos/','').replace('/pulls/', ':'));
              }
            }
            // Resolves to ['org/repo:PR#', ...]
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

      // For each repo, retrieve info on all open pull requests
      promiseArr.push(
        new Promise((resolve, reject) => {
          // Make an API call to get PRs for each repo and owner with a partial URL made of 
          // owner/repo_name using octonode's .repo and .prs methods
          client.repo(owner + '/' + repoName).prs({}, (err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
                prInfo.push({
                  'author': data[i]['user']['login'],
                  'title': data[i]['title'],
                  'pr_url': data[i]['html_url'],
                  'api_url': data[i]['url'],
                  'pr_id': data[i]['id'],
                  'created_at': data[i]['created_at']
                });
              }
            }
            // Resolves to [{author: 'PR author', title: 'PR title', pr_url: 'PR URL', pr_id: 'ID', created_at: 'date created'}, ...]
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
  // Prepare a partial URL for use in retrieving info on individual PRs
  composeRequest: (pullRequestSlug) => {
    promiseArr = [];

    // For each partial URL with repo and PR # info, reformat the info into usable API params
    // for use with subsequent octonode calls.
    pullRequestSlug.forEach((slug) => {
      const params = {};
      const repo = slug.split(':')[0];
      const pullNumber = slug.split(':')[1];

      params[repo] = pullNumber;
      requestArgs = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          requestArgs.push(params);

          // Resolves to [{'org/repo': 'PR #'}, ...]
          resolve(requestArgs);
        })
      )
    });

    return Promise.all(promiseArr);
  },
  // Get all reviews associated with a given PR with certain review states
  allReviews: (requests) => {
    promiseArr = [];

    // For all open PRs, look for those reviews that have either a state of 'APPROVED' or 'CHANGES REQUESTED'
    requests.forEach((request) => {
      const repoStr = Object.keys(request).toString();
      const pullNum = Number(Object.values(request));
      const reviews = [];

      promiseArr.push(
        new Promise((resolve, reject) => {
          // Make an API call to get reviews for each open PR with the params from composeRequest
          // using octonode's .pr and .reviews methods
          client.pr(repoStr, pullNum).reviews((err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
                if (data[i]['state'] == ['COMMENTED'] || data[i]['state'] == ['CHANGES_REQUESTED']) {
                  reviews.push(data[i]);
                }
              }
            }
            // Resolves to what one would get from https://developer.github.com/v3/pulls/reviews/
            resolve(reviews);
          });
        })
      )
    });

    return Promise.all(promiseArr);
  },
  // Gets most recent reviews on each open PR for each unique reviewer
  getMostRecentReviews: (data) => {
    promiseArr = [];

    // Reverse the reviews data response, this orders the reviews reverse chronologically
    // placing the most recent reviews at the front of the array
    const reversed = data.reverse();
    // Get all reviwer IDs associated with reviewers on a PR and then filter out the duplicate values
    const reviewerIds = reversed.map(item => item.user.id);
    const uniqueReviewers = _.uniq(reviewerIds);

    // For each unique reviewer, get their most recent review on the PR
    for (let i in uniqueReviewers) {
      const reviews = [];
      // Get the indices of the unique reviwers and the retrieve the corresponding review
      const uniqueIndices = reviewerIds.indexOf(uniqueReviewers[i]);
      reviews.push(reversed[uniqueIndices]);

      // For each of these most recent reviews, push some relevant infomration about them to a new obj
      for (let i in reviews) {
        const lastReviews = [];

        promiseArr.push(
          new Promise((resolve, reject) => {
            lastReviews.push({
              reviewer_name: reviews[i]['user']['login'],
              reviewer_id: reviews[i]['user']['id'],
              review_id: reviews[i]['id'],
              review_state: reviews[i]['state'],
              review_pr: reviews[i]['pull_request_url']
            });

            // Resolves to [ { reviewer_name: string, reviewer_id: integer, review_id: integer, review_state: string, review_pr: string }, ... ]
            resolve(lastReviews);
          })
        )
      }
    }
    return Promise.all(promiseArr);
  },
  // Match up the review states for each open review with its parent PR
  matchPulls: (recentReviews) => {
    const matched = [];
    const pullInfo = [].concat(prVitalInfo);

    // For each recent review, find the corresponding parent PR
    for (let i in recentReviews) {
      // Filter array of all open PRs by matching the on the API URLs for each PR and its reviews
      const matchedPull = pullInfo.filter(obj => obj.api_url.match(recentReviews[i]['review_pr']));
      const reviewer = recentReviews[i]['reviewer_name'];
      const reviewState = recentReviews[i]['review_state'];

      for (let i in matchedPull) {
        // Insert reviewer ID and state into the rest of the info on that PR
        matchedPull[i].reviewer = reviewer;
        matchedPull[i].review_state = reviewState;
      }

      matched.push(matchedPull);
    }

    // Returns { author: string, title: string, pr_url: string, api_url: string, created_at: datetime, reviewer: string, review_state: string }, ...]
    console.log([].concat(...matched));
    return [].concat(...matched);
  }, 
  // This next function is going to take in the array containing PR info
  // that includes the review state of the PR and the PR id.
  // Any PR could show up multiple times here if there is more than one
  // unique reviewer that either approved or requested changes on the PR.
  // So, this function will need to iterate over the array it gets,
  // checking multiple instances of the same PR id. The easy case is when
  // there is only one instance of the PR id. Here we just need to check if
  // the PR's state is either approved or has changes requested.
  // If multiple instances of a PR id show up, then we need to check if there's
  // any occurrence of the changes requested state. If not, the PR is approved.

  // Input looks like
  // [[{ pull 1's info, approved }], [{ pull 2's approved }], [{ pull 2's info changes requested }], [{ pull 3's info approved}]]

  // Desired output is two arrays, depending on the review states
  // approved
  // [[{ pull 1's info }], [{ pull 3's info }]]  

  // changes requested
  // [{ pull 2's info }]]
  
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

      if (item.length) {
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
            console.log(changesRequested);
          })
        )
      }
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

    return _.uniq(matchingPrs);
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
