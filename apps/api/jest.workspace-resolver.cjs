const path = process.getBuiltinModule('node:path');
const contracts = path.resolve(__dirname, '../../packages/contracts/src');

module.exports = (request, options) => {
  const relative = path.relative(contracts, options.basedir);
  const inContracts =
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  if (inContracts && /^\.\.?\//.test(request) && request.endsWith('.js')) {
    return options.defaultResolver(request.slice(0, -3) + '.ts', options);
  }
  return options.defaultResolver(request, options);
};
