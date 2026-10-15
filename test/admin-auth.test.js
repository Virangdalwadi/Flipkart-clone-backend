import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/flipkart-auth-tests";
process.env.JWT_SECRET ||= "test-only-jwt-secret";

const [{ default: app }, { default: User }, { default: Session }] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/models/user.model.js"),
    import("../src/models/session.model.js"),
  ]);
const { getme, login, register } =
  await import("../src/controllers/auth.controller.js");

const userId = "507f1f77bcf86cd799439011";
const sessionId = "507f1f77bcf86cd799439012";
let server;
let baseUrl;

function createResponse() {
  return {
    statusCode: undefined,
    body: undefined,
    cookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    cookie(...args) {
      this.cookies.push(args);
      return this;
    },
  };
}

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function createAccessToken() {
  return jwt.sign({ id: userId, sessionId }, process.env.JWT_SECRET);
}

async function requestAdmin({ role = "user", sessionValid = true, body } = {}) {
  Session.findOne = async (query) => {
    if (
      !sessionValid ||
      query._id !== sessionId ||
      query.user !== userId ||
      query.revoked !== false
    ) {
      return null;
    }
    return { _id: sessionId };
  };
  User.findById = async (id) => (id === userId ? { _id: id, role } : null);

  const headers = { authorization: `Bearer ${createAccessToken()}` };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  return fetch(`${baseUrl}/api/admin/authorization-check`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("admin router requires a valid authenticated admin session", async (t) => {
  await t.test("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/api/admin/authorization-check`);
    assert.equal(response.status, 401);
  });

  await t.test("rejects an invalid access token", async () => {
    const response = await fetch(`${baseUrl}/api/admin/authorization-check`, {
      headers: { authorization: "Bearer invalid-token" },
    });
    assert.equal(response.status, 401);
  });

  await t.test("forbids regular users, even if the request claims admin", async () => {
    const response = await requestAdmin({
      role: "user",
      body: { role: "admin" },
    });
    assert.equal(response.status, 403);
  });

  await t.test("lets an admin pass authorization before an unknown route returns 404", async () => {
    const response = await requestAdmin({ role: "admin" });
    assert.equal(response.status, 404);
  });

  await t.test("rejects a valid token with an invalid session", async () => {
    const response = await requestAdmin({ role: "admin", sessionValid: false });
    assert.equal(response.status, 401);
  });
});

test("public registration always creates a regular user", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalSessionCreate = Session.create;
  let createdUser;

  User.findOne = async () => null;
  User.create = async (user) => {
    createdUser = user;
    return {
      _id: userId,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  };
  Session.create = async () => ({ _id: sessionId });

  const response = createResponse();

  try {
    await register(
      {
        body: {
          username: "Test User",
          email: "test@example.com",
          password: "SecurePass9!",
          role: "admin",
        },
        ip: "127.0.0.1",
        headers: { "user-agent": "node-test" },
      },
      response,
    );

    assert.equal(response.statusCode, 201);
    assert.equal(createdUser.role, "user");
    assert.equal(response.body.user.role, "user");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    Session.create = originalSessionCreate;
  }
});

test("login and session restoration expose the database-loaded user role", async () => {
  const originalFindOne = User.findOne;
  const originalFindById = User.findById;
  const originalSessionCreate = Session.create;
  const user = {
    _id: userId,
    username: "Admin User",
    email: "admin@example.com",
    password: await bcrypt.hash("ValidPassword9!", 4),
    role: "admin",
  };

  User.findOne = () => ({
    select: async (selection) => {
      assert.equal(selection, "+password");
      return user;
    },
  });
  Session.create = async (session) => {
    assert.equal(session.user, userId);
    return { _id: sessionId };
  };

  const loginResponse = createResponse();
  try {
    await login(
      {
        body: { email: user.email, password: "ValidPassword9!" },
        ip: "127.0.0.1",
        headers: { "user-agent": "node-test" },
      },
      loginResponse,
    );

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.body.user.role, "admin");
    assert.equal(loginResponse.cookies[0][0], "refreshtoken");

    User.findById = async (id) => {
      assert.equal(id, userId);
      return user;
    };
    const restorationResponse = createResponse();
    await getme(
      {
        headers: {
          authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`,
        },
      },
      restorationResponse,
    );

    assert.equal(restorationResponse.statusCode, 200);
    assert.equal(restorationResponse.body.user.role, "admin");
  } finally {
    User.findOne = originalFindOne;
    User.findById = originalFindById;
    Session.create = originalSessionCreate;
  }
});
