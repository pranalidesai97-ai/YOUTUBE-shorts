import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(14);
Config.setColorSpace('bt709');
Config.setOverwriteOutput(true);

// Optional: point Remotion at a locally installed Chrome Headless Shell
// (e.g. REMOTION_BROWSER=/path/to/chrome-headless-shell npm run render).
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
