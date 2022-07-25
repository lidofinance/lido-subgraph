module.exports = {
  transform: {},
  setupFiles: ['dotenv/config'],
  setupFilesAfterEnv: ['./tests/globalSetup.js'],
  reporters: ['./tests/reporter.js'],
  testRegex: 'tests/.*.test.(j|t)s$',
}
