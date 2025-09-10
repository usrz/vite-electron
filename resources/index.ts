import './index.css'

console.log('This message is being logged by "src/renderer/index.ts"')

console.log('Here are some variables from the preload script:')
console.log(' -> node version', window.versions.node())
console.log(' -> chrome version', window.versions.chrome())
console.log(' -> electron version', window.versions.electron())
