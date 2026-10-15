import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/flipkart-admin-users-tests";
process.env.JWT_SECRET ||= "test-only-jwt-secret";

const [{ default: app }, { default: User }, { default: Session }] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/models/user.model.js"),
    import("../src/models/session.model.js"),
  ]);

const adminId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439013";
const sessionId = "507f1f77bcf86cd799439012";
const safeFields =
  "username lastName email role isActive mobile gender createdAt updatedAt";
const originalMethods = {
  find: User.find,
  findOne: User.findOne,
  findById: User.findById,
  countDocuments: User.countDocuments,
  sessionFindOne: Session.findOne,
  sessionUpdateMany: Session.updateMany,
  sessionCreate: Session.create,
};
let server;
let baseUrl;
let userLookup;

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
  User.find = originalMethods.find;
  User.findOne = originalMethods.findOne;
  User.findById = originalMethods.findById;
  User.countDocuments = originalMethods.countDocuments;
  Session.findOne = originalMethods.sessionFindOne;
  Session.updateMany = originalMethods.sessionUpdateMany;
  Session.create = originalMethods.sessionCreate;
  userLookup = null;
});

function token(id = adminId) {
  return jwt.sign({ id, sessionId }, process.env.JWT_SECRET);
}

function authorize({ role = "admin", isActive = true } = {}) {
  Session.findOne = async (filter) => {
    assert.deepEqual(filter, {
      _id: sessionId,
      user: adminId,
      revoked: false,
    });
    return { _id: sessionId };
  };
  User.findById = (id) =>
    String(id) === adminId
      ? { _id: adminId, role, isActive }
      : userLookup?.(id) || null;
}

async function request(path, { role, isActive, method = "GET", body } = {}) {
  authorize({ role, isActive });
  const headers = { authorization: `Bearer ${token()}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function queryResult(value, onSelect = () => {}) {
  return {
    select(fields) {
      onSelect(fields);
      return this;
    },
    sort(value) {
      this.sortValue = value;
      return this;
    },
    skip(value) {
      this.skipValue = value;
      return this;
    },
    limit(value) {
      this.limitValue = value;
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
  };
}

function userDocument(overrides = {}) {
  return {
    _id: userId,
    username: "Taylor",
    lastName: "Customer",
    email: "taylor@example.com",
    role: "user",
    isActive: true,
    mobile: "9876543210",
    gender: "female",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    password: "must-not-be-returned",
    ...overrides,
  };
}

test("admin user listing validates pagination, searches safe fields, and returns safe data", async () => {
  let receivedFilter;
  let receivedProjection;
  let receivedSort;
  let receivedSkip;
  let receivedLimit;
  const listedUser = userDocument();
  User.find = (filter) => {
    receivedFilter = filter;
    const query = queryResult([listedUser], (fields) => {
      receivedProjection = fields;
    });
    query.sort = (sort) => {
      receivedSort = sort;
      return query;
    };
    query.skip = (skip) => {
      receivedSkip = skip;
      return query;
    };
    query.limit = (limit) => {
      receivedLimit = limit;
      return query;
    };
    return query;
  };
  User.countDocuments = async (filter) => {
    assert.deepEqual(filter, receivedFilter);
    return 12;
  };

  const response = await request(
    "/api/admin/users?page=2&limit=5&search=taylor&role=user&status=active",
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilter, {
    $and: [
      {
        $or: [
          { username: { $regex: "taylor", $options: "i" } },
          { lastName: { $regex: "taylor", $options: "i" } },
          { email: { $regex: "taylor", $options: "i" } },
        ],
      },
      { role: "user" },
      { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
    ],
  });
  assert.equal(receivedProjection, safeFields);
  assert.deepEqual(receivedSort, { createdAt: -1, _id: 1 });
  assert.equal(receivedSkip, 5);
  assert.equal(receivedLimit, 5);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 5);
  assert.equal(result.total, 12);
  assert.equal(result.totalPages, 3);
  assert.equal(result.users[0].id, userId);
  assert.equal(result.users[0].isActive, true);
  assert.equal(Object.hasOwn(result.users[0], "password"), false);

  const invalidLimit = await request("/api/admin/users?limit=-1");
  assert.equal(invalidLimit.status, 400);
});

test("admin user endpoints require an admin session and reject invalid pagination", async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/admin/users`);
  assert.equal(unauthenticated.status, 401);

  const forbidden = await request("/api/admin/users", { role: "user" });
  assert.equal(forbidden.status, 403);

  const invalidPage = await request("/api/admin/users?page=0");
  assert.equal(invalidPage.status, 400);

  const invalidRole = await request("/api/admin/users?role=owner");
  assert.equal(invalidRole.status, 400);

  const deactivatedAdmin = await request("/api/admin/users", {
    role: "admin",
    isActive: false,
  });
  assert.equal(deactivatedAdmin.status, 401);
});

test("user detail endpoint validates IDs and returns only safe user fields", async () => {
  let projection;
  userLookup = (id) => {
    if (String(id) === userId) return queryResult(userDocument(), (fields) => {
      projection = fields;
    });
  };

  const invalidResponse = await request("/api/admin/users/not-an-id");
  assert.equal(invalidResponse.status, 400);

  const response = await request(`/api/admin/users/${userId}`);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(projection, safeFields);
  assert.equal(result.user.id, userId);
  assert.equal(result.user.email, "taylor@example.com");
  assert.equal(Object.hasOwn(result.user, "password"), false);
});

test("user status changes reject self and admin accounts and revoke sessions on deactivation", async () => {
  const selfResponse = await request(`/api/admin/users/${adminId}/status`, {
    method: "PATCH",
    body: { isActive: false },
  });
  assert.equal(selfResponse.status, 400);

  const adminTargetId = "507f1f77bcf86cd799439014";
  userLookup = (id) => {
    if (String(id) === adminTargetId) {
      return {
        _id: adminTargetId,
        role: "admin",
        isActive: true,
        async save() {},
      };
    }
  };
  const protectedAdmin = await request(`/api/admin/users/${adminTargetId}/status`, {
    method: "PATCH",
    body: { isActive: false },
  });
  assert.equal(protectedAdmin.status, 403);

  let sessionFilter;
  let sessionUpdate;
  const customer = {
    _id: userId,
    username: "Taylor",
    lastName: "Customer",
    email: "taylor@example.com",
    role: "user",
    isActive: true,
    async save() {
      this.saved = true;
    },
  };
  userLookup = () => customer;
  Session.updateMany = async (filter, update) => {
    sessionFilter = filter;
    sessionUpdate = update;
  };

  const invalidBody = await request(`/api/admin/users/${userId}/status`, {
    method: "PATCH",
    body: { isActive: "false" },
  });
  assert.equal(invalidBody.status, 400);

  const response = await request(`/api/admin/users/${userId}/status`, {
    method: "PATCH",
    body: { isActive: false },
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(customer.saved, true);
  assert.equal(result.user.isActive, false);
  assert.deepEqual(sessionFilter, { user: userId, revoked: false });
  assert.deepEqual(sessionUpdate, { $set: { revoked: true } });
});

test("deactivated users cannot refresh tokens and their presented session is revoked", async () => {
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  const session = {
    _id: sessionId,
    revoked: false,
    async save() {
      this.saved = true;
    },
  };
  Session.findOne = async (filter) => {
    assert.equal(typeof filter.refreshTokenHash, "string");
    assert.equal(filter.revoked, false);
    return session;
  };
  User.findById = async (id) => {
    assert.equal(String(id), userId);
    return { _id: userId, isActive: false };
  };

  const response = await fetch(`${baseUrl}/api/auth/refresh-token`, {
    headers: { cookie: `refreshtoken=${refreshToken}` },
  });
  const result = await response.json();

  assert.equal(response.status, 401);
  assert.equal(result.message, "Account is deactivated");
  assert.equal(session.revoked, true);
  assert.equal(session.saved, true);
  assert.match(response.headers.get("set-cookie") || "", /refreshtoken=/);
});

test("deactivated users cannot log in or create a new session", async () => {
  const password = "ValidPassword9!";
  const passwordHash = await bcrypt.hash(password, 4);
  let sessionCreated = false;
  User.findOne = () => ({
    select: async (fields) => {
      assert.equal(fields, "+password");
      return {
        _id: userId,
        username: "Taylor",
        email: "taylor@example.com",
        role: "user",
        isActive: false,
        password: passwordHash,
      };
    },
  });
  Session.create = async () => {
    sessionCreated = true;
    return { _id: sessionId };
  };

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "taylor@example.com", password }),
  });
  const result = await response.json();

  assert.equal(response.status, 403);
  assert.equal(result.message, "Account is deactivated");
  assert.equal(sessionCreated, false);
});
