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
          // Make an API call to get reviews for each open PR 
          // using octonode's .pr and .reviews methods with the params from composeRequest
          client.pr(repoStr, pullNum).reviews((err, data, headers) => {
            if (err) {
              reject(err);
            } else {
              for (let i in data) {
                if (data[i]['state'] == ['APPROVED'] || data[i]['state'] == ['CHANGES_REQUESTED']) {
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
    return [].concat(...matched);
  }, 
  // Group open PRs by whether they were approved or not
  approvedOrNot: (matchedPulls) => {
    // Get all unique PR ids
    const uniqPulls = _.uniq((matchedPulls.map(pull => pull.pr_id)));

    // An accumulator to store the grouped PRs by whether they're approved or not
    const sortedPulls = {
      approved: [],
      notApproved: [],
    };

    // Reduce input array to group pulls by review state
    const reviewReducer = (accumulator, prId) => {
      const approvedPulls = matchedPulls.filter((pull) => pull.pr_id === prId && pull.review_state === 'APPROVED');
      const unApprovedPulls = matchedPulls.filter((pull) => pull.pr_id === prId && pull.review_state !== 'APPROVED');

      // Checks if there's more than one review for a PR and only pushes
      // to approved if all reviews are in the `APPROVED` state.
      if (!unApprovedPulls.length) {
        // We don't care who the reviewer is, just need know that the PR and its state,
        // otherwise there'll be multiple messages sent, so just push the first element.
        accumulator.approved.push(approvedPulls[0]);
      } else {
        accumulator.notApproved.push(unApprovedPulls[0]);
      }

      return accumulator;
    };

    // Reduce PRs grouped by review states into accumulator
    const pullRequestsToMsg = uniqPulls.reduce(reviewReducer, sortedPulls);

    // Returns 
    // { 
    //   approved: [
    //     { 
    //       author: string, 
    //       title: string, 
    //       pr_url: string, 
    //       api_url: string, 
    //       created_at: datetime, 
    //       reviewer: string, 
    //       review_state: string 
    //     }, 
    //     ... 
    //   ], 
    //   notApproved: [(objs w same keys as above)}, ...] 
    // };
    return pullRequestsToMsg;
  },
  // Retrieve all reviewers requested on all open PRs
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
          // Make an API call to get reviews requests for each open PR 
          // using octonode's .pr and .reviews methods with the params from composeRequest 
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
  // Maps reviewers requested to the PRs that they were requested to review
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

    // Returns an array of hashes containing info on PRs and reviewers requested
    return requestedReviewers;
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
