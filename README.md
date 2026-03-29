# @chriscdn/fastify-sequelize-api-generator

This package generates [fastify routes](https://www.fastify.io/docs/latest/Reference/Routes/) for a [Sequelize](https://sequelize.org/) model.

The package works by generating [JSON Schema](https://json-schema.org/) from the model, and using the schema to [validate and serialize](https://www.fastify.io/docs/latest/Reference/Validation-and-Serialization/) the request and response to perform create, read, update, and destroy operations. Callbacks are available to customize the behaviour.

The project is inspired by the Django Rest Framework.

# Fastify Sequelize API Utilities

This module provides utilities for creating REST APIs in **Fastify** using **Sequelize models**. It automatically generates JSON schemas for your models and sets up CRUD endpoints with flexible permissions.

## Features

- Generate JSON schemas from Sequelize models using `sequelize-json-schema`.
- Create Fastify routes for common CRUD operations (List, Retrieve, Create, Update, Destroy).
- Support for read-only and write-only fields.
- Customizable pre-handlers and permissions.
- Flexible endpoint configuration with operation descriptions, tags, and response schemas.

## Installation

Include the module in your project:

```ts
import {
  FastifyAddModelSchema,
  FastifySequelizeGenericViews,
  FastifySequelizeAPI,
  FastifyGetSchemaName,
} from "./fastify-sequelize-api";
```

## Usage

### 1. Add Model Schema

Generates JSON schemas for a Sequelize model and registers them with Fastify:

```ts
FastifyAddModelSchema({
  fastify,
  Model: User, // Sequelize model
  exclude: ["password"], // fields to exclude
  readOnly: ["id", "createdAt", "updatedAt"],
  writeOnly: ["password"],
});
```

### 2. Create CRUD Routes

The `FastifySequelizeAPI` function registers REST endpoints based on the generic views you need.

```ts
FastifySequelizeAPI({
  prefix: "/users",
  fastify,
  Model: User,
  genericView: FastifySequelizeGenericViews.ListCreateAPIView,
  preHandler: [myAuthMiddleware],
  hasPermission: async (req) => req.user?.isAdmin ?? false,
});
```

#### Parameters

- `prefix` – route prefix for endpoints.
- `fastify` – Fastify instance.
- `Model` – Sequelize model to expose.
- `genericView` – array of CRUD operations (`LIST`, `RETRIEVE`, `CREATE`, `UPDATE`, `DESTROY`).
- `preHandler` – optional array of Fastify pre-handlers.
- `hasPermission` – function to check global permissions.
- `hasObjectPermission` – function to check permissions per object.
- `getObject` – optional custom method to retrieve a single object.
- `getObjects` – optional custom method to retrieve multiple objects.
- `tags` – OpenAPI tags for documentation.
- `descriptions` – operation descriptions.
- `operationIds` – custom operation IDs for OpenAPI.
- `performCreate`, `performUpdate`, `performDestroy` – hooks for custom logic on mutations.
- `responseSchema` – override default schema.

### 3. Available Generic Views

```ts
FastifySequelizeGenericViews.ListAPIView;
FastifySequelizeGenericViews.ListCreateAPIView;
FastifySequelizeGenericViews.RetrieveAPIView;
FastifySequelizeGenericViews.CreateAPIView;
FastifySequelizeGenericViews.UpdateAPIView;
FastifySequelizeGenericViews.RetrieveUpdateDestroyAPIView;
```

## Example

```ts
import Fastify from "fastify";
import { User } from "./models";
import {
  FastifyAddModelSchema,
  FastifySequelizeAPI,
  FastifySequelizeGenericViews,
} from "./fastify-sequelize-api";

const fastify = Fastify();

FastifyAddModelSchema({ fastify, Model: User });

FastifySequelizeAPI({
  prefix: "/users",
  fastify,
  Model: User,
  genericView: FastifySequelizeGenericViews.ListCreateAPIView,
  preHandler: [],
  hasPermission: async (req) => true,
});

fastify.listen({ port: 3000 });
```

This sets up:

- `GET /users` – list all users
- `POST /users` – create a user

## Utilities

- `FastifyGetSchemaName(Model, variation?)` – returns the schema name for a model, optionally for `"post"` or `"patch"` variations.
- `FastifyAddModelSchema(params)` – registers JSON schemas for a model.
- `FastifySequelizeAPI(params)` – generates CRUD endpoints.
- `FastifySequelizeGenericViews` – predefined sets of CRUD operations.
