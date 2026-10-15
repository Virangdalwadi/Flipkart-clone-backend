import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import jwt from "jsonwebtoken";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/flipkart-profile-tests";
process.env.JWT_SECRET ||= "test-only-jwt-secret";

const [{ default: app }, { default: User }, { default: Session }] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/models/user.model.js"),
    import("../src/models/session.model.js"),
  ]);

const userId = "507f1f77bcf86cd799439011";
const sessionId = "507f1f77bcf86cd799439012";
const originalFindById = User.findById;
const originalSessionFindOne = Session.findOne;
let server;
let baseUrl;

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
});

async function requestProfile(body, { authenticated = true } = {}) {
  Session.findOne = async () => ({ _id: sessionId });
  User.findById = async () => ({
    _id: userId,
    username: "Old name",
    lastName: "",
    gender: undefined,
    mobile: undefined,
    email: "profile@example.com",
    role: "user",
    async save() {
      this.saved = true;
    },
  });

  const headers = {};
  if (authenticated) {
    headers.authorization = `Bearer ${jwt.sign(
      { id: userId, sessionId },
      process.env.JWT_SECRET,
    )}`;
  }

  return fetch(`${baseUrl}/api/auth/profile`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("profile update persists the supplied personal information", async () => {
  let updatedUser;
  Session.findOne = async () => ({ _id: sessionId });
  User.findById = async () => {
    updatedUser = {
      _id: userId,
      username: "Old name",
      lastName: "",
      gender: undefined,
      mobile: undefined,
      email: "profile@example.com",
      role: "user",
      async save() {
        this.saved = true;
      },
    };
    return updatedUser;
  };

  const response = await fetch(`${baseUrl}/api/auth/profile`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${jwt.sign(
        { id: userId, sessionId },
        process.env.JWT_SECRET,
      )}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "Updated",
      lastName: "User",
      gender: "female",
      mobile: "9876543210",
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updatedUser.saved, true);
  assert.deepEqual(
    {
      username: updatedUser.username,
      lastName: updatedUser.lastName,
      gender: updatedUser.gender,
      mobile: updatedUser.mobile,
    },
    {
      username: "Updated",
      lastName: "User",
      gender: "female",
      mobile: "9876543210",
    },
  );
  assert.equal(result.user.lastName, "User");
  assert.equal(result.user.gender, "female");
  assert.equal(result.user.mobile, "9876543210");
});

test("profile update requires authentication and rejects invalid mobile numbers", async () => {
  const unauthorizedResponse = await requestProfile(
    { lastName: "User" },
    { authenticated: false },
  );
  assert.equal(unauthorizedResponse.status, 401);

  const invalidMobileResponse = await requestProfile({ mobile: "123" });
  const result = await invalidMobileResponse.json();
  assert.equal(invalidMobileResponse.status, 400);
  assert.match(result.message, /10-digit/);
});
