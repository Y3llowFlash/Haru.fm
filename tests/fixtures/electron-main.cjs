const { app } = require('electron');
const path = require('node:path');

// QA launches use an isolated settings directory and do not claim the user's singleton.
app.setPath('userData', process.env.HARU_QA_USER_DATA);
app.requestSingleInstanceLock = () => true;
if (process.platform === 'linux' && process.getuid?.() === 0) app.commandLine.appendSwitch('no-sandbox');
require(path.join(__dirname, '../../desktop/main.cjs'));
