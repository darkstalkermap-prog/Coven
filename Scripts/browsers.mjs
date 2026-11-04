// The browser the tests run in, chosen with BROWSER: chromium (the default), chrome (Google Chrome, which must be
// installed), firefox, or webkit (the engine of Safari). CHROMIUM_PATH points chromium at an installed copy.
// All run headless (HEADED=1 shows the window: Firefox on a machine without a graphics card needs one, on a virtual
// display, to get WebGL); Chromium and Chrome draw WebGL in software (SwiftShader), so no graphics card is needed.
import {chromium, firefox, webkit} from 'playwright';

export const BROWSER = process.env.BROWSER || 'chromium';
export const NAMES = { chromium: 'Chromium', chrome: 'Google Chrome', firefox: 'Firefox', webkit: 'WebKit (Safari)' };
if (!NAMES[BROWSER]) throw new Error(`Unknown BROWSER "${BROWSER}": use chromium, chrome, firefox or webkit`);
export const NAME = NAMES[BROWSER];
export const CHROMIUM_FAMILY = BROWSER === 'chromium' || BROWSER === 'chrome';
// Firefox cannot emulate a phone (isMobile); the others can.
export const CAN_EMULATE_PHONE = BROWSER !== 'firefox';

const SOFTWARE_GL = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const headless = !process.env.HEADED;
// `chromiumArgs` only apply to Chromium and Chrome.
export function launch({ chromiumArgs = [] } = {}) {
  if (BROWSER === 'chromium') return chromium.launch({ headless, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: [...SOFTWARE_GL, ...chromiumArgs] });
  if (BROWSER === 'chrome') return chromium.launch({ headless, channel: 'chrome', args: [...SOFTWARE_GL, ...chromiumArgs] });
  if (BROWSER === 'firefox') return firefox.launch({ headless, firefoxUserPrefs: {
    'webgl.force-enabled': true, // WebGL without a graphics card
    'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0, // let the music start in tests
    'media.peerconnection.ice.loopback': true, 'media.peerconnection.ice.no_host': false, // player-hosted games on one machine
  } });
  return webkit.launch({ headless });
}
