import {continueRender, delayRender, staticFile} from 'remotion';

// Inter / Inter Display (SIL OFL 1.1) bundled in public/fonts so renders are
// identical on any machine.
const faces: Array<[string, string, string]> = [
  ['Inter Display', 'InterDisplay-SemiBold.otf', '600'],
  ['Inter Display', 'InterDisplay-Medium.otf', '500'],
  ['Inter', 'Inter-Medium.otf', '500'],
  ['Inter', 'Inter-Regular.otf', '400'],
];

let loaded = false;

export const ensureFonts = () => {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('Loading Inter fonts');
  Promise.all(
    faces.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, {
        weight,
      });
      return face.load().then((f) => document.fonts.add(f));
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
};
