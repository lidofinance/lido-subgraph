module.exports = {
  transform: {},
  setupFiles: ['dotenv/config'],
  setupFilesAfterEnv: ['./tests/globalBlockSetup.js'],
  reporters: ['./tests/reporter.js'],
}
