const major = Number(process.versions.node.split('.')[0]);
if (major !== 24) {
  console.error(
    `AwesomeJM requires Node.js 24. Current version: ${process.version}`,
  );
  console.error('Run fnm use or nvm use from the repository root.');
  process.exitCode = 1;
}
