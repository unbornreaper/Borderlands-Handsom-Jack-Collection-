// Loads the browser scripts into Node for testing.
const fs = require('fs'), vm = require('vm'), path = require('path');
function load(file) { vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file }); }
module.exports = { load };
