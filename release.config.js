export default {
  branches: [
    { name: 'latest' },
    { name: 'next', channel: 'next', prerelease: true }
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/npm',
    ['@semantic-release/git', { assets: 'package.json' }],
    ['@semantic-release/github', { successComment: false, failComment: false }]
  ]
}
