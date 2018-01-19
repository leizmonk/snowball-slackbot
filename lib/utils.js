const fs = require('fs');

// Get user mapping configs
const self = module.exports = {
	readConfig: (path) => {
	  var data = JSON.parse(fs.readFileSync(path));
	  return data;
	}
}
