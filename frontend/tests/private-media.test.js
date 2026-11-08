import test from 'node:test';
import assert from 'node:assert/strict';
import { privateArtifactReason, publicAssets } from '../scripts/private-media.js';
test('build boundary rejects songs, renamed identical files and every private cover', () => {
  assert.ok(privateArtifactReason('x/track.MP3')); assert.ok(privateArtifactReason('audio/cover.jpg'));
  assert.ok(privateArtifactReason('images/unrelated.jpg','private-hash',new Set(['private-hash'])));
  for (const name of ['Michita feat. AMIのPurenessからの楽曲Cry For Me (feat. 愛海)をAmazon Musicで.jpg',
    '＜コラム＞iriが『Mステ』初出演、バイラルヒット「会いたいわ」がもたらした“揺るぎない自信” _ Special _ Billboard JAPAN.jpg',
    '迷人的危險 - dance flow_ Song Lyrics, Music Videos & Concerts.jpg','”カタオモイ” by Aimer - トラック・歌詞情報 _ AWA.jpg']) assert.ok(privateArtifactReason('other/' + name));
});
test('public build allowlist retains eleven photographs and favicon without media', () => {
  assert.equal(publicAssets.length,12); assert.equal(publicAssets.filter((p)=>p.startsWith('images/')).length,11);
  assert.ok(publicAssets.every((p)=>!privateArtifactReason(p))); assert.equal(privateArtifactReason('assets/app.js'),null);
});
