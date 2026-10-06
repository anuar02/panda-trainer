const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = (options) => launch({ ...options, channel: 'chromium' });
