import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import jwt from "jsonwebtoken";
import cloudinary from "../src/config/cloudinary.js";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/flipkart-profile-image-tests";
process.env.JWT_SECRET ||= "test-only-jwt-secret";

const [{ default: app }, { default: User }, { default: Session }] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/models/user.model.js"),
    import("../src/models/session.model.js"),
  ]);

const userId = "507f1f77bcf86cd799439021";
const sessionId = "507f1f77bcf86cd799439022";
const originalFindById = User.findById;
const originalSessionFindOne = Session.findOne;
const originalUploadStream = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;
let server;
let baseUrl;
let currentUser;
let uploadError;
let uploadCalls;
let destroyCalls;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

afterEach(() => {
  User.findById = originalFindById;
  Session.findOne = originalSessionFindOne;
  cloudinary.uploader.upload_stream = originalUploadStream;
  cloudinary.uploader.destroy = originalDestroy;
});

function setupMocks({
  profileImage = "",
  profileImagePublicId = "",
  saveError,
} = {}) {
  currentUser = {
    _id: userId,
    profileImage,
    profileImagePublicId,
    async save() {
      if (saveError) throw saveError;
      this.saved = true;
    },
  };
  uploadError = null;
  uploadCalls = [];
  destroyCalls = [];
  Session.findOne = async () => ({ _id: sessionId });
  User.findById = async () => currentUser;
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end(buffer) {
      uploadCalls.push({ options, buffer });
      if (uploadError) {
        callback(uploadError);
        return;
      }
      callback(null, {
        secure_url: "https://res.cloudinary.com/demo/image/upload/profile.jpg",
        public_id: options.public_id,
      });
    },
  });
  cloudinary.uploader.destroy = async (publicId, options) => {
    destroyCalls.push({ publicId, options });
    return { result: "ok" };
  };
}

function authHeaders(contentType) {
  return {
    authorization: `Bearer ${jwt.sign(
      { id: userId, sessionId },
      process.env.JWT_SECRET,
    )}`,
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

test("authenticated upload replaces an image and safely deletes the previous owned file", async () => {
  const oldPublicId = `profile-images/${userId}/previous`;
  setupMocks({
    profileImage: "https://res.cloudinary.com/demo/old.jpg",
    profileImagePublicId: oldPublicId,
  });

  const response = await fetch(`${baseUrl}/api/auth/profile/image`, {
    method: "PUT",
    headers: authHeaders("image/jpeg"),
    body: jpeg,
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(currentUser.saved, true);
  assert.equal(result.user.profileImage, currentUser.profileImage);
  assert.equal(uploadCalls.length, 1);
  assert.deepEqual(uploadCalls[0].buffer, Buffer.from(jpeg));
  assert.match(
    uploadCalls[0].options.public_id,
    new RegExp(`^profile-images/${userId}/`),
  );
  assert.equal(destroyCalls[0].publicId, oldPublicId);
});

test("accepts PNG and WebP image signatures", async () => {
  const examples = [
    {
      mimeType: "image/png",
      buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
    {
      mimeType: "image/webp",
      buffer: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]),
    },
  ];

  for (const example of examples) {
    setupMocks();
    const response = await fetch(`${baseUrl}/api/auth/profile/image`, {
      method: "PUT",
      headers: authHeaders(example.mimeType),
      body: example.buffer,
    });
    assert.equal(response.status, 200);
  }
});

test("removal clears the image and only deletes a known public ID in the user's folder", async () => {
  setupMocks({
    profileImage: "https://res.cloudinary.com/demo/old.jpg",
    profileImagePublicId: `profile-images/${userId}/old`,
  });

  const response = await fetch(`${baseUrl}/api/auth/profile/image`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ userId: "another-user" }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(currentUser.profileImage, "");
  assert.equal(currentUser.profileImagePublicId, "");
  assert.equal(result.user.profileImage, "");
  assert.equal(destroyCalls.length, 1);

  setupMocks({
    profileImage: "https://res.cloudinary.com/demo/legacy.jpg",
    profileImagePublicId: "profile-images/someone-else/legacy",
  });
  const legacyResponse = await fetch(`${baseUrl}/api/auth/profile/image`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  assert.equal(legacyResponse.status, 200);
  assert.equal(destroyCalls.length, 0);
});

test("cleans up a newly uploaded Cloudinary image when saving the user fails", async () => {
  setupMocks({ saveError: new Error("MongoDB unavailable") });

  const response = await fetch(`${baseUrl}/api/auth/profile/image`, {
    method: "PUT",
    headers: authHeaders("image/jpeg"),
    body: jpeg,
  });

  assert.equal(response.status, 500);
  assert.equal(destroyCalls.length, 1);
  assert.equal(
    destroyCalls[0].publicId,
    uploadCalls[0].options.public_id,
  );
});

test("upload requires authentication and rejects unsupported or mismatched image data", async () => {
  setupMocks();

  const unauthorizedResponse = await fetch(
    `${baseUrl}/api/auth/profile/image`,
    { method: "PUT", headers: { "content-type": "image/jpeg" }, body: jpeg },
  );
  assert.equal(unauthorizedResponse.status, 401);

  const unsupportedResponse = await fetch(
    `${baseUrl}/api/auth/profile/image`,
    {
      method: "PUT",
      headers: authHeaders("image/gif"),
      body: jpeg,
    },
  );
  assert.equal(unsupportedResponse.status, 415);

  const invalidSignatureResponse = await fetch(
    `${baseUrl}/api/auth/profile/image`,
    {
      method: "PUT",
      headers: authHeaders("image/jpeg"),
      body: new Uint8Array([0x00, 0x01, 0x02]),
    },
  );
  assert.equal(invalidSignatureResponse.status, 400);
  assert.equal(uploadCalls.length, 0);
});

test("oversized uploads are rejected and Cloudinary failures leave the saved image unchanged", async () => {
  setupMocks({
    profileImage: "https://res.cloudinary.com/demo/old.jpg",
    profileImagePublicId: `profile-images/${userId}/old`,
  });

  const oversizedResponse = await fetch(
    `${baseUrl}/api/auth/profile/image`,
    {
      method: "PUT",
      headers: authHeaders("image/jpeg"),
      body: new Uint8Array(5 * 1024 * 1024 + 1),
    },
  );
  assert.equal(oversizedResponse.status, 413);
  assert.match((await oversizedResponse.json()).message, /5 MB/);

  uploadError = new Error("Cloudinary unavailable");
  const failureResponse = await fetch(
    `${baseUrl}/api/auth/profile/image`,
    {
      method: "PUT",
      headers: authHeaders("image/jpeg"),
      body: jpeg,
    },
  );
  assert.equal(failureResponse.status, 502);
  assert.equal(currentUser.profileImage, "https://res.cloudinary.com/demo/old.jpg");
  assert.equal(currentUser.saved, undefined);
  assert.equal(destroyCalls.length, 0);
});
