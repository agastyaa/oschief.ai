const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);

  await notarize({
    appPath,
    appleId: 'sagarkalarkopp@gmail.com',
    appleIdPassword: '@keychain:syag-notarize',
    teamId: '4TF93K384V',
  });

  console.log('Notarization complete.');
};
