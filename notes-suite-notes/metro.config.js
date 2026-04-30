const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
]
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'loro-crdt': path.resolve(
    projectRoot,
    'node_modules/loro-crdt/bundler/index.js'
  ),
  'notes-suite-contracts': path.resolve(
    workspaceRoot,
    'packages/notes-suite-contracts'
  ),
}
config.resolver.assetExts = Array.from(
  new Set([...(config.resolver.assetExts ?? []), 'wasm'])
)
config.resolver.unstable_enableSymlinks = true

module.exports = config
