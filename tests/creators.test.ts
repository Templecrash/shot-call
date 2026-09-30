import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTwitterProfile,
  creatorFor,
  EDITORIAL_CREATOR,
  avatarMime,
} from "../lib/creators";
test("Twitter and X profile links derive one canonical handle and URL", () => {
  for (const input of [
    "@Alice_123",
    "Alice_123",
    "https://twitter.com/Alice_123?lang=en",
    "https://x.com/Alice_123/",
    "twitter.com/Alice_123",
    "https://mobile.twitter.com/Alice_123",
  ])
    assert.deepEqual(parseTwitterProfile(input), {
      handle: "Alice_123",
      url: "https://x.com/Alice_123",
    });
});
test("rejects posts, lookalike domains, credentials, unsafe URLs and reserved paths", () => {
  for (const input of [
    "https://x.com/alice/status/123",
    "https://x.com.evil.com/alice",
    "https://evil.com/x.com/alice",
    "https://x.com@evil.com/alice",
    "https://user@x.com/alice",
    "javascript:alert(1)",
    "https://x.com:8080/alice",
    "https://x.com/intent",
    "https://x.com/i",
    "@too_long_a_handle_for_x",
    "@bad-name",
    "",
  ])
    assert.equal(parseTwitterProfile(input), null, input);
});
test("unlinked creators and editorial examples never invent Twitter identities", () => {
  assert.equal(
    creatorFor({ author: "Supertake editorial", example: true }),
    EDITORIAL_CREATOR,
  );
  assert.deepEqual(creatorFor({ author: "Alice", owner: "stable-owner" }), {
    id: "stable-owner",
    name: "Alice",
    handle: null,
    twitterUrl: null,
    avatarUrl: null,
    bio: "",
  });
});
test("avatar uploads reject SVG and non-images and recognize raster signatures", () => {
  assert.equal(
    avatarMime(new TextEncoder().encode('<svg onload="alert(1)">')),
    null,
  );
  assert.equal(
    avatarMime(new Uint8Array([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    "image/jpeg",
  );
  assert.equal(
    avatarMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])),
    "image/png",
  );
  assert.equal(
    avatarMime(new TextEncoder().encode("RIFF0000WEBP")),
    "image/webp",
  );
});
