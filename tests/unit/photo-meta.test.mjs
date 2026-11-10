// Where a photo came from -> its team and album (js/photo-meta.js).
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { loadScript } from "../helpers/load.mjs";

const w = loadScript("js/photo-meta.js", { crypto: webcrypto });
const P = w.PhotoMeta;

test("team from the folder a photo was dropped in", () => {
  assert.equal(P.teamFromPath("10U/ECA_10U_2023-10_Pacific_Fall_Classic_pack_01-of-04/a.jpg"), "10u-coed");
  assert.equal(P.teamFromPath("14U_Girls/x/a.jpg"), "14u-girls");
  assert.equal(P.teamFromPath("16U_Boys/ECA_16U_Boys_2026-07_JOs_pack_01-of-02/a.jpg"), "16u-boys");
  assert.equal(P.teamFromPath("12U_CoED/02_ECA_12U_CoED/a.jpg"), null, "no 12U coed team exists, so an owner tags it");
  assert.equal(P.teamFromPath("Coaches_from_14U_Boys/pack/a.jpg"), null, "coaches is an album, not a team");
  assert.equal(P.teamFromPath("a.jpg"), null);
  assert.equal(P.teamFromText("Splashball flyers"), "splashball");
});

test("album and date from a pack name", () => {
  assert.deepEqual({ ...P.albumFromPack("ECA_10U_2023-10_Pacific_Fall_Classic_pack_01-of-04") }, { album: "Pacific Fall Classic", taken: "Oct 2023" });
  assert.deepEqual({ ...P.albumFromPack("ECA_16U_Boys_2026-02-14_SPA_Blk_v_Elite_pack_03-of-04") }, { album: "SPA Blk v Elite", taken: "Feb 14, 2026" });
  assert.deepEqual({ ...P.albumFromPack("ECA_16U_Boys_2026-07_JOs_pack_01-of-02") }, { album: "JOs", taken: "Jul 2026" });
  assert.deepEqual({ ...P.albumFromPack("ECA_10U_2024-2026_mixed_pack_02-of-04") }, { album: "Mixed", taken: "2024–2026" });
  assert.deepEqual({ ...P.albumFromPack("ECA_14U_Boys_Coaches_2025-11_5-photos") }, { album: "Coaches", taken: "Nov 2025" });
});

test("sha256 matches the standard digest", async () => {
  const hex = await P.sha256(new TextEncoder().encode("abc").buffer);
  assert.equal(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
