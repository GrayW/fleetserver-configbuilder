// "How to use this": commands to run the generated config, per platform.
export const PLATFORMS = [
  { id: 'unix', label: 'macOS / Linux' },
  { id: 'windows', label: 'Windows (PowerShell)' },
];

const secretLine = (platform, name) =>
  platform === 'windows' ? `$env:${name} = Read-Host "${name}"` : `read -rs ${name}; export ${name}`;

// omitted: [{env}] from build(..., {secrets: 'omit'}).
export const usageSteps = (platform, { omitted = [], hasYaml = true, hasEnv = true } = {}) => {
  const steps = [];
  if (omitted.length > 0) {
    steps.push({
      title: 'Provide the secrets in your environment',
      note: 'They are not in the file you copied. Fleet reads these variables on top of fleet.yml.',
      code: omitted.map(o => secretLine(platform, o.env)).join('\n'),
    });
  }
  steps.push({
    title: 'Prepare the database once',
    note: 'Run this before the first start and after every Fleet upgrade.',
    code: platform === 'windows' ? 'fleet.exe prepare db --config .\\fleet.yml' : 'fleet prepare db --config ./fleet.yml',
  });
  if (hasYaml) {
    steps.push({
      title: 'Start Fleet with the config file',
      code: platform === 'windows' ? 'fleet.exe serve --config .\\fleet.yml' : 'fleet serve --config ./fleet.yml',
    });
  } else if (hasEnv) {
    steps.push({
      title: 'Start Fleet with environment variables',
      code: platform === 'windows' ? 'fleet.exe serve' : 'fleet serve',
    });
  }
  return steps;
};
