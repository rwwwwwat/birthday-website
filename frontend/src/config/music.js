// Stable same-origin endpoints. Only the backend maps IDs to private filenames.
// In a static build (GitHub Pages) the files are copied to ./media/audio|cover/{id}.
const staticMedia = import.meta.env.VITE_MEDIA_MODE === 'static';
const mediaBase = `${import.meta.env.BASE_URL}media/`;
export const musicTracks = Object.freeze([
  { id: 'cry-for-me', title: 'Cry For Me', artist: 'Michita feat. 愛海' },
  { id: 'aitaiwa', title: '会いたいわ', artist: 'iri' },
  { id: 'danger', title: '迷人的危险', artist: 'Dance Flow' },
  { id: 'kataomoi', title: 'カタオモイ', artist: 'Aimer' },
].map((track) => Object.freeze({
  ...track,
  src: staticMedia ? `${mediaBase}audio/${track.id}.mp3` : `/media/audio/${track.id}`,
  cover: staticMedia ? `${mediaBase}covers/${track.id}.jpg` : `/media/covers/${track.id}`,
})));
// Default first; others follow the inspected folder listing. No chronology inferred.
export const musicConfig = Object.freeze({ tracks: musicTracks, defaultId: 'cry-for-me', specialId: 'danger', volume: 0.15 });
