import { tasks } from '@plugjs/build'

export default tasks({
  extraLint: [ [ '*', { directory: 'resources' } ] ],
  minimumFileCoverage: 20,
  minimumCoverage: 20,
})
