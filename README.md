# @chriscdn/fastify-sequelize-api-generator

This package generates [fastify routes](https://www.fastify.io/docs/latest/Reference/Routes/) for a [Sequelize](https://sequelize.org/) model.

The package works by generating [JSON Schema](https://json-schema.org/) from the model, and using the schema to [validate and serialize](https://www.fastify.io/docs/latest/Reference/Validation-and-Serialization/) the request and response to perform create, read, update, and destroy operations. Callbacks are available to customize the behaviour.

The project is inspired by the Django Rest Framework.

TypeScript should be introduced at some point.
