import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import jwt from "jsonwebtoken";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/flipkart-products-tests";
process.env.JWT_SECRET ||= "test-only-jwt-secret";

const [
  { default: app },
  { default: Product },
  { default: Counter },
  { default: User },
  { default: Session },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/product.model.js"),
  import("../src/models/counter.model.js"),
  import("../src/models/user.model.js"),
  import("../src/models/session.model.js"),
]);

const userId = "507f1f77bcf86cd799439011";
const sessionId = "507f1f77bcf86cd799439012";
const originalMethods = {
  productFind: Product.find,
  productFindOne: Product.findOne,
  productCountDocuments: Product.countDocuments,
  productCreate: Product.create,
  productFindOneAndUpdate: Product.findOneAndUpdate,
  counterFindOneAndUpdate: Counter.findOneAndUpdate,
  userFindById: User.findById,
  sessionFindOne: Session.findOne,
};
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
  Product.find = originalMethods.productFind;
  Product.findOne = originalMethods.productFindOne;
  Product.countDocuments = originalMethods.productCountDocuments;
  Product.create = originalMethods.productCreate;
  Product.findOneAndUpdate = originalMethods.productFindOneAndUpdate;
  Counter.findOneAndUpdate = originalMethods.counterFindOneAndUpdate;
  User.findById = originalMethods.userFindById;
  Session.findOne = originalMethods.sessionFindOne;
});

function authorize(role = "admin") {
  Session.findOne = async (query) => {
    assert.deepEqual(query, {
      _id: sessionId,
      user: userId,
      revoked: false,
    });
    return { _id: sessionId };
  };
  User.findById = async () => ({ _id: userId, role });
}

function accessToken() {
  return jwt.sign({ id: userId, sessionId }, process.env.JWT_SECRET);
}

async function request(path, { method = "GET", role, body } = {}) {
  if (role) authorize(role);
  else authorize();

  const headers = role === null ? {} : { authorization: `Bearer ${accessToken()}` };
  if (body !== undefined) headers["content-type"] = "application/json";

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function queryResult(value) {
  return {
    sort(sortValue) {
      this.sortValue = sortValue;
      return this;
    },
    skip(skipValue) {
      this.skipValue = skipValue;
      return this;
    },
    limit(limitValue) {
      this.limitValue = limitValue;
      return this;
    },
    select(selectValue) {
      this.selectValue = selectValue;
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
  };
}

function validProduct(overrides = {}) {
  return {
    title: "Example phone",
    description: "A product for management tests",
    category: "phones",
    brand: "Example",
    sku: "EX-PHONE-1",
    price: 249.99,
    discountPercentage: 10,
    rating: 4.5,
    stock: 8,
    images: ["https://res.cloudinary.com/example/image/upload/phone.jpg"],
    thumbnail: "https://res.cloudinary.com/example/image/upload/phone.jpg",
    ...overrides,
  };
}

test("admin product APIs enforce authentication and authorization", async (t) => {
  await t.test("rejects unauthenticated requests with 401", async () => {
    const response = await request("/api/admin/products", { role: null });
    assert.equal(response.status, 401);
  });

  await t.test("rejects regular users with 403", async () => {
    const response = await request("/api/admin/products", { role: "user" });
    assert.equal(response.status, 403);
  });
});

test("admin product listing validates filters and returns pagination metadata", async () => {
  let receivedFilter;
  let receivedSort;
  let receivedSkip;
  let receivedLimit;
  const products = [{ id: 6 }, { id: 7 }];
  Product.find = (filter) => {
    receivedFilter = filter;
    const query = queryResult(products);
    const originalSort = query.sort;
    query.sort = (value) => {
      receivedSort = value;
      return originalSort.call(query, value);
    };
    query.skip = (value) => {
      receivedSkip = value;
      return query;
    };
    query.limit = (value) => {
      receivedLimit = value;
      return query;
    };
    return query;
  };
  Product.countDocuments = async () => 5;

  const response = await request(
    "/api/admin/products?page=2&limit=2&search=phone&category=phones&isActive=false&sortBy=price&order=desc",
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilter, {
    title: { $regex: "phone", $options: "i" },
    category: "phones",
    isActive: false,
  });
  assert.deepEqual(receivedSort, { price: -1 });
  assert.equal(receivedSkip, 2);
  assert.equal(receivedLimit, 2);
  assert.deepEqual(body, {
    products,
    total: 5,
    page: 2,
    limit: 2,
    totalPages: 3,
  });

  const invalidResponse = await request("/api/admin/products?page=0");
  assert.equal(invalidResponse.status, 400);
});

test("admin product creation generates a numeric ID and assigns the authenticated seller", async () => {
  let counterUpdates = 0;
  let createdData;
  Product.findOne = () => queryResult({ id: 50 });
  Counter.findOneAndUpdate = async () => {
    counterUpdates += 1;
    return { sequence: counterUpdates === 1 ? 50 : 51 };
  };
  Product.create = async (data) => {
    createdData = data;
    return data;
  };

  const response = await request("/api/admin/products", {
    method: "POST",
    body: validProduct(),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.product.id, 51);
  assert.equal(typeof body.product.id, "number");
  assert.equal(createdData.seller, userId);
  assert.equal(body.product.images[0], validProduct().images[0]);
  assert.equal(counterUpdates, 2);
});

test("product creation rejects invalid data, unsafe image paths, and client-controlled fields", async () => {
  let createCalled = false;
  Product.create = async () => {
    createCalled = true;
  };

  for (const body of [
    validProduct({ price: -1 }),
    validProduct({ stock: "8" }),
    validProduct({ rating: 5.1 }),
    validProduct({ discountPercentage: 101 }),
    validProduct({ thumbnail: "C:\\images\\phone.jpg" }),
    validProduct({ seller: userId }),
    validProduct({ isActive: false }),
  ]) {
    const response = await request("/api/admin/products", {
      method: "POST",
      body,
    });
    assert.equal(response.status, 400);
  }
  assert.equal(createCalled, false);
});

test("duplicate numeric product IDs return 409", async () => {
  Product.findOne = () => queryResult({ id: 50 });
  let counterUpdates = 0;
  Counter.findOneAndUpdate = async () => {
    counterUpdates += 1;
    return { sequence: counterUpdates === 1 ? 50 : 51 };
  };
  Product.create = async () => {
    const error = new Error("Duplicate product ID");
    error.code = 11000;
    throw error;
  };

  const response = await request("/api/admin/products", {
    method: "POST",
    body: validProduct(),
  });
  assert.equal(response.status, 409);
});

test("product updates are partial and cannot modify immutable fields", async () => {
  let updateCall;
  Product.findOneAndUpdate = async (...args) => {
    updateCall = args;
    return { id: 4, description: "Updated description" };
  };

  const response = await request("/api/admin/products/4", {
    method: "PATCH",
    body: { description: "Updated description" },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.product.description, "Updated description");
  assert.deepEqual(updateCall, [
    { id: 4 },
    { $set: { description: "Updated description" } },
    { new: true, runValidators: true },
  ]);

  for (const body of [
    { id: 5 },
    { seller: userId },
    { _id: "507f1f77bcf86cd799439013" },
    { createdAt: "2026-01-01T00:00:00.000Z" },
    { $set: { title: "Injected" } },
    {},
  ]) {
    const rejected = await request("/api/admin/products/4", {
      method: "PATCH",
      body,
    });
    assert.equal(rejected.status, 400);
  }
});

test("status changes and DELETE safely deactivate products", async () => {
  let updates = [];
  Product.findOneAndUpdate = async (filter, update, options) => {
    updates.push({ filter, update, options });
    return { id: filter.id, isActive: update.$set.isActive };
  };

  const deactivate = await request("/api/admin/products/4/status", {
    method: "PATCH",
    body: { isActive: false },
  });
  assert.equal(deactivate.status, 200);
  assert.equal((await deactivate.json()).product.isActive, false);

  const activate = await request("/api/admin/products/4/status", {
    method: "PATCH",
    body: { isActive: true },
  });
  assert.equal(activate.status, 200);
  assert.equal((await activate.json()).product.isActive, true);

  const invalidStatus = await request("/api/admin/products/4/status", {
    method: "PATCH",
    body: { isActive: "false" },
  });
  assert.equal(invalidStatus.status, 400);

  const deleted = await request("/api/admin/products/4", { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.deepEqual(updates.map(({ update }) => update), [
    { $set: { isActive: false } },
    { $set: { isActive: true } },
    { $set: { isActive: false } },
  ]);
});

test("admin product detail and update return 404 for missing products", async () => {
  Product.findOne = () => queryResult(null);
  Product.findOneAndUpdate = async () => null;

  const getResponse = await request("/api/admin/products/999");
  const patchResponse = await request("/api/admin/products/999", {
    method: "PATCH",
    body: { title: "Missing" },
  });

  assert.equal(getResponse.status, 404);
  assert.equal(patchResponse.status, 404);
});

test("public storefront hides inactive products and preserves numeric product IDs and images", async () => {
  let publicFilter;
  const product = {
    id: 42,
    title: "Visible phone",
    category: "phones",
    images: ["https://res.cloudinary.com/example/image/upload/phone.jpg"],
    thumbnail: "https://res.cloudinary.com/example/image/upload/phone.jpg",
    isActive: true,
  };
  Product.find = (filter) => {
    publicFilter = filter;
    return queryResult([product]);
  };
  Product.countDocuments = async () => 1;
  Product.findOne = (filter) => {
    assert.deepEqual(filter, { id: 42, isActive: true });
    return queryResult(product);
  };

  const listResponse = await fetch(`${baseUrl}/api/products`);
  const listBody = await listResponse.json();
  const detailResponse = await fetch(`${baseUrl}/api/products/42`);
  const detailBody = await detailResponse.json();

  assert.equal(listResponse.status, 200);
  assert.deepEqual(publicFilter, { isActive: true });
  assert.equal(listBody.products[0].id, 42);
  assert.equal(typeof listBody.products[0].id, "number");
  assert.deepEqual(listBody.products[0].images, product.images);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailBody.product.id, 42);
  assert.equal(detailBody.product.thumbnail, product.thumbnail);
});

test("public product search matches title, description, or category", async () => {
  let receivedFilter;
  Product.find = (filter) => {
    receivedFilter = filter;
    return queryResult([]);
  };
  Product.countDocuments = async () => 0;

  const response = await fetch(
    `${baseUrl}/api/products?search=makeup&page=1&limit=20`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedFilter, {
    isActive: true,
    $or: [
      { title: { $regex: "makeup", $options: "i" } },
      { description: { $regex: "makeup", $options: "i" } },
      { category: { $regex: "makeup", $options: "i" } },
    ],
  });
});

test("inactive or missing public product details return 404", async () => {
  let detailFilter;
  Product.findOne = (filter) => {
    detailFilter = filter;
    return queryResult(null);
  };

  const response = await fetch(`${baseUrl}/api/products/42`);
  assert.equal(response.status, 404);
  assert.deepEqual(detailFilter, { id: 42, isActive: true });
});

test("admin status and delete endpoints return 404 for missing products", async () => {
  Product.findOneAndUpdate = async () => null;
  const statusResponse = await request("/api/admin/products/404/status", {
    method: "PATCH",
    body: { isActive: false },
  });
  const deleteResponse = await request("/api/admin/products/404", {
    method: "DELETE",
  });

  assert.equal(statusResponse.status, 404);
  assert.equal(deleteResponse.status, 404);
});
